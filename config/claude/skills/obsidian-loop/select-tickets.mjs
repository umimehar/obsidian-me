#!/usr/bin/env node
// Read-only ticket selector for the /obsidian-loop skill.
//
// Scans the vault kanban ticket notes, filters to those claimable by a given
// device, and ranks them. No writes, no git, no network. The TCK-0002 daemon
// imports selectCandidates() so selection lives in exactly one place.
//
// Runtime-agnostic: runs identically under `node` and `bun`, node: builtins only,
// zero dependencies, no build step.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const PRIORITY_ORDER = { p0: 0, p1: 1, p2: 2, p3: 3 };
// Vault root is four levels up from this script (config/claude/skills/obsidian-loop/), so a copy
// inside either vault (obsidian-me or obsidian-dev) defaults to its own vault. Callers still
// override with --vault; homedir stays imported for other path joins below.
const DEFAULT_VAULT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const FM_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;
const KV_RE = /^([A-Za-z0-9_]+):\s*(.*)$/;
const ITEM_RE = /^\s+-\s+(.*)$/;

function stripQuotes(s) {
  const q = s.at(0);
  if (s.length >= 2 && (q === '"' || q === "'") && s.at(-1) === q) {
    return s.slice(1, -1);
  }
  return s;
}

/** Parse a note's YAML-ish frontmatter into a flat object.
 *  Values are strings, or arrays for inline (`[a, b]`) and block (`- a`) lists.
 *  Returns null when the note has no leading frontmatter block. */
export function parseFrontmatter(text) {
  const m = FM_RE.exec(text);
  if (!m) return null;
  const lines = m[1].split('\n');
  const fm = {};
  let i = 0;
  while (i < lines.length) {
    const kv = KV_RE.exec(lines[i]);
    if (!kv) {
      i += 1;
      continue;
    }
    const key = kv[1];
    const raw = kv[2].trim();
    if (raw === '') {
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const item = ITEM_RE.exec(lines[j]);
        if (!item) break;
        items.push(item[1].trim());
        j += 1;
      }
      if (items.length) {
        fm[key] = items;
        i = j;
      } else {
        fm[key] = '';
        i += 1;
      }
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      const inner = raw.slice(1, -1).trim();
      fm[key] = inner ? inner.split(',').map((x) => x.trim()).filter(Boolean) : [];
      i += 1;
    } else {
      fm[key] = stripQuotes(raw);
      i += 1;
    }
  }
  return fm;
}

function asList(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

/** Map every registered device slug to its parsed device-note frontmatter. */
function readDeviceNotes(vault) {
  const dir = join(vault, 'orchestrator', 'devices');
  const notes = {};
  if (!existsSync(dir)) return notes;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const fm = parseFrontmatter(readFileSync(join(dir, f), 'utf8')) || {};
    const slug = fm.slug ?? f.replace(/\.md$/, '');
    notes[slug] = fm;
  }
  return notes;
}

/** Map every registered device slug to its repos array, scanning device notes. */
export function loadDeviceReposMap(vault) {
  const map = {};
  for (const [slug, fm] of Object.entries(readDeviceNotes(vault))) {
    map[slug] = asList(fm.repos);
  }
  return map;
}

/** Return the repos the given device may work, from its device note. */
export function loadDeviceRepos(vault, device) {
  const devFile = join(vault, 'orchestrator', 'devices', `${device}.md`);
  if (!existsSync(devFile)) {
    throw new Error(`device file not found: ${devFile}`);
  }
  const fm = parseFrontmatter(readFileSync(devFile, 'utf8')) || {};
  return asList(fm.repos);
}

function ticketPaths(vault) {
  const paths = [];
  const orchDir = join(vault, 'orchestrator', 'tickets');
  if (existsSync(orchDir)) {
    for (const f of readdirSync(orchDir)) {
      if (f.startsWith('TCK-') && f.endsWith('.md')) paths.push(join(orchDir, f));
    }
  }
  const projRoot = join(vault, 'projects');
  if (existsSync(projRoot)) {
    for (const proj of readdirSync(projRoot)) {
      const td = join(projRoot, proj, 'tickets');
      if (!existsSync(td)) continue;
      for (const f of readdirSync(td)) {
        if (f.startsWith('TCK-') && f.endsWith('.md')) paths.push(join(td, f));
      }
    }
  }
  return paths.sort();
}

/** Return { byId: {ticketId: frontmatter}, malformed: [paths] }. */
export function loadAllTickets(vault) {
  const byId = {};
  const malformed = [];
  for (const p of ticketPaths(vault)) {
    const fm = parseFrontmatter(readFileSync(p, 'utf8'));
    if (!fm || !('id' in fm) || !('status' in fm)) {
      malformed.push(p);
      continue;
    }
    fm._path = p;
    byId[fm.id] = fm;
  }
  return { byId, malformed };
}

/** Return [claimable, reason] for a ticket against a device. */
export function isClaimable(t, device, repos, byId) {
  if (t.status !== 'ready') return [false, `status is '${t.status}', not ready`];
  const assigned = t.assigned_device ?? 'any';
  if (assigned !== 'any' && assigned !== device) return [false, `pinned to ${assigned}`];
  for (const dep of asList(t.depends_on)) {
    const depT = byId[dep];
    if (!depT || depT.status !== 'done') return [false, `dependency ${dep} not done`];
  }
  const project = t.project ?? '';
  if (project !== 'system' && !repos.includes(project)) {
    return [false, `project '${project}' not in device repos ${JSON.stringify(repos)}`];
  }
  return [true, 'claimable'];
}

function sortKey(t) {
  return [PRIORITY_ORDER[t.priority] ?? 3, t.created ?? '', t.id ?? ''];
}

function compareKeys(a, b) {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

/** Return claimable tickets for the device, best first. */
export function selectCandidates(vault, device) {
  const repos = loadDeviceRepos(vault, device);
  const { byId } = loadAllTickets(vault);
  return Object.values(byId)
    .filter((t) => isClaimable(t, device, repos, byId)[0])
    .sort(compareKeys);
}

/** Return ready tickets this device cannot claim, with the gating reason. */
export function findNearMisses(vault, device) {
  const repos = loadDeviceRepos(vault, device);
  const { byId } = loadAllTickets(vault);
  const misses = [];
  for (const t of Object.values(byId)) {
    if (t.status !== 'ready') continue;
    const [ok, reason] = isClaimable(t, device, repos, byId);
    if (ok) continue;
    misses.push({ id: t.id, title: t.title ?? '', project: t.project ?? '', reason });
  }
  return misses.sort((a, b) => a.id.localeCompare(b.id));
}

function summarize(t) {
  return {
    id: t.id,
    title: t.title ?? '',
    priority: t.priority ?? '',
    project: t.project ?? '',
    path: t._path ?? '',
  };
}

/** Explain whether a specific ticket is claimable by the device. */
export function explain(vault, device, ticketId) {
  const repos = loadDeviceRepos(vault, device);
  const { byId } = loadAllTickets(vault);
  const t = byId[ticketId];
  if (!t) return { id: ticketId, claimable: false, reason: 'ticket not found' };
  const [ok, reason] = isClaimable(t, device, repos, byId);
  return { id: ticketId, claimable: ok, reason };
}

/** List tickets pinned to a registered device that can never work them.
 *  A violation is a ticket whose `assigned_device` names a device with a note
 *  whose `repos` exclude the ticket's `project`, and `project` is not 'system'.
 *  Tickets pinned to 'any' or to an unregistered slug are out of scope. */
export function findPinnedUngateable(vault) {
  const devices = loadDeviceReposMap(vault);
  const { byId } = loadAllTickets(vault);
  const violations = [];
  for (const t of Object.values(byId)) {
    const assigned = t.assigned_device ?? 'any';
    const project = t.project ?? '';
    if (assigned === 'any' || !(assigned in devices) || project === 'system') continue;
    const repos = devices[assigned];
    if (!repos.includes(project)) {
      violations.push({ id: t.id, assigned_device: assigned, project, device_repos: repos });
    }
  }
  return violations.sort((a, b) => a.id.localeCompare(b.id));
}

const REQUIRED_TICKET_FIELDS = [
  'id', 'status', 'project', 'ticket_type', 'assigned_device', 'claimed_by',
  'priority', 'effort', 'depends_on', 'created_by',
];
const CONTROL_LOOP = ['running', 'paused'];
const CONTROL_EFFORT = ['small', 'medium', 'large'];
const CONTROL_TYPES = ['research', 'docs', 'chore', 'test', 'feature', 'bug', 'spike', 'loop'];

function basename(p) {
  return p.slice(p.lastIndexOf('/') + 1);
}

/** Emit missing-field violations for one ticket note. */
function checkTicketFields(path) {
  const file = basename(path);
  const fm = parseFrontmatter(readFileSync(path, 'utf8'));
  if (!fm) {
    return [{ kind: 'missing_field', target: file, field: 'frontmatter',
      detail: 'no frontmatter block' }];
  }
  const target = 'id' in fm ? fm.id : file;
  return REQUIRED_TICKET_FIELDS
    .filter((field) => !(field in fm))
    .map((field) => ({ kind: 'missing_field', target, field, detail: 'required field absent' }));
}

function badControl(field, detail) {
  return { kind: 'bad_control_value', target: 'orchestrator/control.md', field, detail };
}

/** Emit bad-value violations for the orchestrator control.md config. */
function checkControl(vault) {
  const file = join(vault, 'orchestrator', 'control.md');
  const fm = existsSync(file) ? parseFrontmatter(readFileSync(file, 'utf8')) : null;
  if (!fm) return [badControl('frontmatter', 'missing or unparseable')];
  const out = [];
  if (!CONTROL_LOOP.includes(fm.loop)) out.push(badControl('loop', `invalid: ${fm.loop}`));
  if (!CONTROL_EFFORT.includes(fm.max_effort)) {
    out.push(badControl('max_effort', `invalid: ${fm.max_effort}`));
  }
  for (const t of asList(fm.allowed_types)) {
    if (!CONTROL_TYPES.includes(t)) out.push(badControl('allowed_types', `unknown type: ${t}`));
  }
  const n = Number(fm.max_tickets_per_day);
  if (!(Number.isInteger(n) && n > 0)) {
    out.push(badControl('max_tickets_per_day', `not a positive integer: ${fm.max_tickets_per_day}`));
  }
  return out;
}

/** Report tickets missing required frontmatter fields and invalid control.md values.
 *  Returns a flat array of { kind, target, field, detail }, sorted by target then field. */
export function findSchemaViolations(vault) {
  const out = [];
  for (const p of ticketPaths(vault)) out.push(...checkTicketFields(p));
  out.push(...checkControl(vault));
  return out.sort((a, b) => (a.target !== b.target
    ? a.target.localeCompare(b.target)
    : a.field.localeCompare(b.field)));
}

/** List ready non-system tickets whose project is in no registered device's repos.
 *  Such tickets can never be claimed anywhere until a device adds the repo. */
export function findUncoveredProjects(vault) {
  const covered = new Set(Object.values(loadDeviceReposMap(vault)).flat());
  const { byId } = loadAllTickets(vault);
  const out = [];
  for (const t of Object.values(byId)) {
    const project = t.project ?? '';
    if (t.status !== 'ready' || project === 'system' || covered.has(project)) continue;
    out.push({ id: t.id, project });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const CARD_ID_RE = /^\s*- \[[ xX]\] .*\[\[(TCK-\d{4})/;

/** Board scope: system tickets live on orchestrator/board.md, project tickets
 *  on projects/<project>/board.md (per the vault's kanban contract). */
function boardRelPath(t) {
  const project = t.project ?? '';
  return project === 'system' || project === ''
    ? 'orchestrator/board.md'
    : `projects/${project}/board.md`;
}

/** Return the set of ticket ids carded on a board, or null when the board is absent. */
function boardCardIds(vault, relPath) {
  const p = join(vault, ...relPath.split('/'));
  if (!existsSync(p)) return null;
  const ids = new Set();
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = CARD_ID_RE.exec(line);
    if (m) ids.add(m[1]);
  }
  return ids;
}

const COLUMN_HEADING_RE = /^##\s+(.+?)\s*$/;

/** Map each carded ticket id to the column (## heading) it sits under, or null
 *  when the board is absent. A card before any heading maps to null. */
function boardCardColumns(vault, relPath) {
  const p = join(vault, ...relPath.split('/'));
  if (!existsSync(p)) return null;
  const columns = new Map();
  let column = null;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const h = COLUMN_HEADING_RE.exec(line);
    if (h) {
      column = h[1].trim();
      continue;
    }
    const m = CARD_ID_RE.exec(line);
    if (m) columns.set(m[1], column);
  }
  return columns;
}

function listBoards(vault) {
  const boards = ['orchestrator/board.md'];
  const projRoot = join(vault, 'projects');
  if (!existsSync(projRoot)) return boards;
  for (const proj of readdirSync(projRoot)) {
    if (existsSync(join(projRoot, proj, 'board.md'))) boards.push(`projects/${proj}/board.md`);
  }
  return boards;
}

/** Report ticket notes with no card on their board (missing_card) and board
 *  cards with no backing ticket note (orphan_card). Every status maps to a
 *  column, so every well-formed note must have exactly one card. */
export function findCardPresenceIssues(vault) {
  const { byId } = loadAllTickets(vault);
  const cardsByBoard = {};
  for (const b of listBoards(vault)) cardsByBoard[b] = boardCardIds(vault, b);
  const issues = [];
  for (const t of Object.values(byId)) {
    const board = boardRelPath(t);
    const cards = cardsByBoard[board];
    if (!cards || !cards.has(t.id)) issues.push({ kind: 'missing_card', id: t.id, board });
  }
  for (const [board, cards] of Object.entries(cardsByBoard)) {
    for (const id of cards ?? []) {
      if (!(id in byId)) issues.push({ kind: 'orphan_card', id, board });
    }
  }
  return issues.sort((a, b) => (a.id !== b.id
    ? a.id.localeCompare(b.id)
    : a.board.localeCompare(b.board)));
}

/** The Column<->status map from the kanban contract. A `failed` ticket keeps
 *  `status: failed` in frontmatter but parks its card in the Blocked column. */
const STATUS_TO_COLUMN = {
  backlog: 'Backlog',
  ready: 'Ready',
  claimed: 'Claimed',
  'in-progress': 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  failed: 'Blocked',
};

/** Report tickets whose card sits in a column that disagrees with the ticket's
 *  frontmatter status (frontmatter is the source of truth). A missing card is
 *  findCardPresenceIssues's concern and is left to it; an unknown status is
 *  findSchemaViolations's concern and is skipped here. */
export function findStatusDrift(vault) {
  const { byId } = loadAllTickets(vault);
  const columnsByBoard = {};
  const out = [];
  for (const t of Object.values(byId)) {
    const board = boardRelPath(t);
    if (!(board in columnsByBoard)) columnsByBoard[board] = boardCardColumns(vault, board);
    const columns = columnsByBoard[board];
    if (!columns || !columns.has(t.id)) continue;
    const expected = STATUS_TO_COLUMN[t.status];
    if (!expected) continue;
    const actual = columns.get(t.id);
    if (actual !== expected) {
      out.push({
        kind: 'status_drift',
        id: t.id,
        status: t.status,
        cardColumn: actual ?? '(before any column heading)',
        expectedColumn: expected,
        board,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const STALE_STATUSES = ['claimed', 'in-progress', 'review'];
const DEFAULT_STALE_HOURS = 24;
const MS_PER_HOUR = 3600000;

/** Report claimed/in-progress/review tickets whose owning device's last_heartbeat
 *  is older than `hours`. A claimed_by of null/any or an unregistered slug cannot
 *  be resolved to a device note; those tickets are reported with a reason rather
 *  than skipped, so a dead claim never hides. */
export function findStaleClaims(vault, hours = DEFAULT_STALE_HOURS, nowMs = Date.now()) {
  const devices = readDeviceNotes(vault);
  const { byId } = loadAllTickets(vault);
  const out = [];
  for (const t of Object.values(byId)) {
    if (!STALE_STATUSES.includes(t.status)) continue;
    const row = staleRow(t, devices, hours, nowMs);
    if (row) out.push(row);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function staleRow(t, devices, hours, nowMs) {
  const device = t.claimed_by ?? '';
  const base = { id: t.id, status: t.status, claimed_by: device, last_heartbeat: null };
  if (device === '' || device === 'null' || device === 'any' || !(device in devices)) {
    return { ...base, reason: `cannot resolve claimed_by '${device}' to a device note` };
  }
  const heartbeat = devices[device].last_heartbeat ?? '';
  const ts = Date.parse(heartbeat);
  if (Number.isNaN(ts)) {
    return { ...base, reason: `device ${device} has no parseable last_heartbeat` };
  }
  const ageHours = (nowMs - ts) / MS_PER_HOUR;
  if (ageHours <= hours) return null;
  return {
    ...base,
    last_heartbeat: heartbeat,
    reason: `heartbeat ${ageHours.toFixed(1)}h old exceeds ${hours}h threshold`,
  };
}

/** Board rollups computed from the raw ticket files — the headless equivalent of
 *  dashboard.md's Dataview, plus the backlog-rot counters (filed/triaged/completed
 *  for agent-created improvement tickets). No app, no network. `nowMs` is injectable
 *  so the throughput window and stale threshold are testable. */
export function computeStatus(vault, { hours = DEFAULT_STALE_HOURS, nowMs = Date.now() } = {}) {
  const { byId, malformed } = loadAllTickets(vault);
  const tickets = Object.values(byId);
  const count = (s) => tickets.filter((t) => t.status === s).length;

  const agentFiled = tickets.filter((t) => String(t.created_by ?? '').startsWith('agent:'));
  const backlogRot = {
    filed: agentFiled.length,
    triaged: agentFiled.filter((t) => t.status !== 'backlog').length,
    completed: agentFiled.filter((t) => t.status === 'done').length,
  };

  const cutoff = new Date(nowMs - 7 * 24 * MS_PER_HOUR).toISOString().slice(0, 10);
  const doneLast7d = tickets.filter(
    (t) => t.status === 'done' && String(t.updated ?? '') >= cutoff,
  ).length;

  const stale = findStaleClaims(vault, hours, nowMs);

  return {
    inFlight: { claimed: count('claimed'), inProgress: count('in-progress') },
    ready: count('ready'),
    review: count('review'),
    blocked: count('blocked'),
    failed: count('failed'),
    backlog: count('backlog'),
    throughput: { doneTotal: count('done'), doneLast7d },
    stale: { count: stale.length, tickets: stale },
    backlogRot,
    malformed: malformed.length,
  };
}

/** Render computeStatus() as a compact human-readable block for terminals. */
export function formatStatusText(s, hours = DEFAULT_STALE_HOURS) {
  const lines = [
    'Board status',
    `  In flight:    claimed ${s.inFlight.claimed}, in-progress ${s.inFlight.inProgress}`,
    `  Ready queue:  ${s.ready}`,
    `  Review:       ${s.review}`,
    `  Blocked:      ${s.blocked}    Failed: ${s.failed}`,
    `  Backlog:      ${s.backlog}`,
    `  Throughput:   ${s.throughput.doneTotal} done total, ${s.throughput.doneLast7d} in last 7d`,
    `  Stale (>${hours}h): ${s.stale.count}`,
    `  Backlog rot:  filed ${s.backlogRot.filed} / triaged ${s.backlogRot.triaged}`
      + ` / completed ${s.backlogRot.completed} (agent-filed improvement tickets)`,
  ];
  if (s.malformed) lines.push(`  Malformed:    ${s.malformed}`);
  for (const row of s.stale.tickets) lines.push(`    stale ${row.id}: ${row.reason}`);
  return lines.join('\n');
}

const HELP = `select-tickets.mjs — read-only board selector and auditor (no writes, no git, no network).

Usage:
  select-tickets.mjs --device <slug>            best claimable ticket(s), JSON, best first
  select-tickets.mjs --device <slug> --explain TCK-XXXX   why a ticket is/ isn't claimable
  select-tickets.mjs --device <slug> --near-misses        ready tickets this device can't claim
  select-tickets.mjs --status [--json]          board rollups (text, or JSON with --json)
  select-tickets.mjs --lint|--schema|--coverage|--card-presence|--status-drift|--stale [--hours N]   hygiene audits

--status is the token-disciplined way to survey the board: it prints the lane counts, throughput,
stale claims, and backlog-rot metrics from the raw files.
An agent can check board health without loading every ticket note into context.
Pair it with the hygiene flags before a work session.`;

function expanduser(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

const AUDIT_FLAGS = {
  '--lint': 'lint',
  '--schema': 'schema',
  '--coverage': 'coverage',
  '--card-presence': 'cardPresence',
  '--status-drift': 'statusDrift',
  '--stale': 'stale',
  '--status': 'status',
};

function parseArgs(argv) {
  const args = {
    vault: null, device: null, explain: null, nearMisses: false, hours: DEFAULT_STALE_HOURS,
    lint: false, schema: false, coverage: false, cardPresence: false, statusDrift: false,
    stale: false, status: false, json: false, help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--device') args.device = argv[i += 1];
    else if (argv[i] === '--vault') args.vault = argv[i += 1];
    else if (argv[i] === '--explain') args.explain = argv[i += 1];
    else if (argv[i] === '--hours') args.hours = Number(argv[i += 1]);
    else if (argv[i] === '--near-misses') args.nearMisses = true;
    else if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else if (argv[i] in AUDIT_FLAGS) args[AUDIT_FLAGS[argv[i]]] = true;
  }
  const auditMode = args.help || Object.values(AUDIT_FLAGS).some((k) => args[k]);
  if (!auditMode && !args.device) {
    console.error('error: --device <slug> is required');
    process.exit(2);
  }
  return args;
}

function resolveResult(vault, args) {
  if (args.lint) return findPinnedUngateable(vault);
  if (args.schema) return findSchemaViolations(vault);
  if (args.coverage) return findUncoveredProjects(vault);
  if (args.cardPresence) return findCardPresenceIssues(vault);
  if (args.statusDrift) return findStatusDrift(vault);
  if (args.stale) return findStaleClaims(vault, args.hours);
  if (args.nearMisses) return findNearMisses(vault, args.device);
  if (args.explain) return explain(vault, args.device, args.explain);
  return selectCandidates(vault, args.device).map(summarize);
}

export function main(argv = process.argv.slice(2), { log = (s) => console.log(s) } = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    log(HELP);
    return 0;
  }
  const vault = args.vault ? expanduser(args.vault) : DEFAULT_VAULT;
  if (args.status) {
    const status = computeStatus(vault, { hours: args.hours });
    log(args.json ? JSON.stringify(status, null, 2) : formatStatusText(status, args.hours));
    return 0;
  }
  log(JSON.stringify(resolveResult(vault, args), null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
