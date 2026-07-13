// Tests for the read-only /obsidian-loop ticket selector.
// Runtime-agnostic: `node --test test-select.mjs` or `bun test` (Bun implements node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseFrontmatter,
  loadAllTickets,
  selectCandidates,
  explain,
  findNearMisses,
  findPinnedUngateable,
  findSchemaViolations,
  findUncoveredProjects,
  findCardPresenceIssues,
  findStatusDrift,
  findStaleClaims,
  computeStatus,
  main,
} from './select-tickets.mjs';

function ticket(id, opts = {}) {
  const {
    status = 'ready', assigned = 'any', deps = '[]', project = 'system',
    priority = 'p2', created = '2026-07-02', title = `${id} test`, claimedBy = 'null',
    createdBy = null, updated = null,
  } = opts;
  const lines = [
    '---',
    `title: "${title}"`,
    'type: ticket',
    `id: ${id}`,
    `status: ${status}`,
    `project: ${project}`,
    `claimed_by: ${claimedBy}`,
    `assigned_device: ${assigned}`,
    `depends_on: ${deps}`,
    `priority: ${priority}`,
    `created: ${created}`,
  ];
  if (createdBy !== null) lines.push(`created_by: ${createdBy}`);
  if (updated !== null) lines.push(`updated: ${updated}`);
  lines.push('---', '', '# body', '');
  return lines.join('\n');
}

function makeVault() {
  const vault = mkdtempSync(join(tmpdir(), 'obs-loop-'));
  mkdirSync(join(vault, '.git'));
  mkdirSync(join(vault, 'orchestrator', 'tickets'), { recursive: true });
  mkdirSync(join(vault, 'orchestrator', 'devices'), { recursive: true });
  mkdirSync(join(vault, 'projects', 'delo', 'tickets'), { recursive: true });
  writeFileSync(
    join(vault, 'orchestrator', 'devices', 'dev1.md'),
    '---\nslug: dev1\nhostname: HOST1\nrepos:\n  - delo\n  - alrai\n---\n',
  );
  return vault;
}

function withVault(fn) {
  const vault = makeVault();
  try {
    return fn(vault);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
}

function write(vault, folder, id, opts) {
  writeFileSync(join(vault, ...folder.split('/'), `${id}.md`), ticket(id, opts));
}

function writeDevice(vault, slug, repos, heartbeat = null) {
  const lines = ['---', `slug: ${slug}`, `hostname: ${slug.toUpperCase()}`, 'repos:'];
  for (const r of repos) lines.push(`  - ${r}`);
  if (heartbeat) lines.push(`last_heartbeat: ${heartbeat}`);
  lines.push('---', '');
  writeFileSync(join(vault, 'orchestrator', 'devices', `${slug}.md`), lines.join('\n'));
}

function writeBoard(vault, relPath, cardIds) {
  const lines = ['---', '', 'kanban-plugin: board', '', '---', '', '## Ready', ''];
  for (const id of cardIds) lines.push(`- [ ] [[${id}]] #project/system #type/chore #p2`);
  lines.push('', '## Done', '');
  writeFileSync(join(vault, ...relPath.split('/')), lines.join('\n'));
}

// Write a board with cards placed under specific columns.
// cols is { ColumnName: [cardId, ...] }; columns emit in canonical board order.
function writeBoardCols(vault, relPath, cols) {
  const order = ['Backlog', 'Ready', 'Claimed', 'In Progress', 'Review', 'Blocked', 'Done'];
  const lines = ['---', '', 'kanban-plugin: board', '', '---', ''];
  for (const col of order) {
    lines.push(`## ${col}`, '');
    for (const id of cols[col] ?? []) lines.push(`- [ ] [[${id}]] #project/system #type/chore #p2`);
    lines.push('');
  }
  writeFileSync(join(vault, ...relPath.split('/')), lines.join('\n'));
}

// Device notes record last_heartbeat as zoneless local time (`date "+%Y-%m-%dT%H:%M:%S"`),
// so shift to the local clock before formatting.
function hoursAgo(h) {
  const d = new Date(Date.now() - h * 3600000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 19);
}

function writeClaim(vault, id, device, status) {
  write(vault, 'orchestrator/tickets', id, { status, claimedBy: device });
}

function ids(vault, device = 'dev1') {
  return selectCandidates(vault, device).map((c) => c.id);
}

function captureMain(argv) {
  const chunks = [];
  const rc = main(argv, { log: (s) => chunks.push(s) });
  return { rc, payload: JSON.parse(chunks.join('')) };
}

// --- parsing ---
test('parses inline and block lists', () => {
  const fm = parseFrontmatter(
    '---\nid: TCK-0001\ndepends_on: [TCK-0002, TCK-0003]\n'
      + 'repos:\n  - delo\n  - alrai\nempty: []\n---\n',
  );
  assert.equal(fm.id, 'TCK-0001');
  assert.deepEqual(fm.depends_on, ['TCK-0002', 'TCK-0003']);
  assert.deepEqual(fm.repos, ['delo', 'alrai']);
  assert.deepEqual(fm.empty, []);
});

test('returns null without frontmatter', () => {
  assert.equal(parseFrontmatter('# just a heading\n'), null);
});

// --- selection ---
test('selects ready system ticket', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001');
  assert.deepEqual(ids(v), ['TCK-0001']);
}));

test('orders by priority then created then id', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { priority: 'p2', created: '2026-07-01' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { priority: 'p1', created: '2026-07-02' });
  write(v, 'orchestrator/tickets', 'TCK-0003', { priority: 'p1', created: '2026-07-01' });
  assert.deepEqual(ids(v), ['TCK-0003', 'TCK-0002', 'TCK-0001']);
}));

test('excludes ticket pinned to other device', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { assigned: 'dev2' });
  assert.deepEqual(ids(v), []);
}));

test('includes ticket pinned to this device', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { assigned: 'dev1' });
  assert.deepEqual(ids(v), ['TCK-0001']);
}));

test('excludes when dependency not done', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'in-progress' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { deps: '[TCK-0001]' });
  assert.deepEqual(ids(v), []);
}));

test('includes when dependency done', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'done' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { deps: '[TCK-0001]' });
  assert.deepEqual(ids(v), ['TCK-0002']);
}));

test('project ticket gated by device repos', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { project: 'delo' });
  write(v, 'projects/delo/tickets', 'TCK-0002', { project: 'xyzbytes' });
  assert.deepEqual(ids(v), ['TCK-0001']);
}));

test('only ready status selected', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'claimed' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { status: 'done' });
  assert.deepEqual(ids(v), []);
}));

test('malformed ticket skipped not crash', () => withVault((v) => {
  writeFileSync(join(v, 'orchestrator', 'tickets', 'TCK-0009.md'), 'no frontmatter\n');
  write(v, 'orchestrator/tickets', 'TCK-0001');
  const { byId, malformed } = loadAllTickets(v);
  assert.ok('TCK-0001' in byId);
  assert.ok(malformed.some((p) => p.includes('TCK-0009')));
}));

// --- explain + CLI ---
test('explain reports unmet dependency', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'ready' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { deps: '[TCK-0001]' });
  const result = explain(v, 'dev1', 'TCK-0002');
  assert.equal(result.claimable, false);
  assert.ok(result.reason.includes('TCK-0001'));
}));

test('explain unknown ticket', () => withVault((v) => {
  const result = explain(v, 'dev1', 'TCK-9999');
  assert.equal(result.claimable, false);
  assert.ok(result.reason.toLowerCase().includes('not found'));
}));

test('main prints json candidates', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { priority: 'p1' });
  const { rc, payload } = captureMain(['--vault', v, '--device', 'dev1']);
  assert.equal(rc, 0);
  assert.equal(payload[0].id, 'TCK-0001');
  assert.equal(payload[0].priority, 'p1');
}));

test('main explain flag', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { assigned: 'dev2' });
  const { rc, payload } = captureMain(['--vault', v, '--device', 'dev1', '--explain', 'TCK-0001']);
  assert.equal(rc, 0);
  assert.equal(payload.claimable, false);
  assert.ok(payload.reason.includes('dev2'));
}));

// --- near misses ---
test('near miss reports unmet dependency', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'in-progress' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { deps: '[TCK-0001]' });
  const misses = findNearMisses(v, 'dev1');
  assert.deepEqual(misses.map((m) => m.id), ['TCK-0002']);
  assert.ok(misses[0].reason.includes('TCK-0001'));
}));

test('near miss reports ticket pinned to other device', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { assigned: 'dev2' });
  const misses = findNearMisses(v, 'dev1');
  assert.deepEqual(misses.map((m) => m.id), ['TCK-0001']);
  assert.ok(misses[0].reason.includes('dev2'));
}));

test('near miss reports project not in device repos', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { project: 'xyzbytes' });
  const misses = findNearMisses(v, 'dev1');
  assert.deepEqual(misses.map((m) => m.id), ['TCK-0001']);
  assert.ok(misses[0].reason.includes('xyzbytes'));
}));

test('near miss excludes non-ready ticket', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'backlog', assigned: 'dev2' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { status: 'claimed', assigned: 'dev2' });
  assert.deepEqual(findNearMisses(v, 'dev1'), []);
}));

test('near miss excludes claimable ready ticket', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001');
  assert.deepEqual(findNearMisses(v, 'dev1'), []);
}));

test('near miss carries title and project sorted by id', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0002', { assigned: 'dev2', title: 'second' });
  write(v, 'projects/delo/tickets', 'TCK-0001', { project: 'xyzbytes', title: 'first' });
  const misses = findNearMisses(v, 'dev1');
  assert.deepEqual(misses.map((m) => m.id), ['TCK-0001', 'TCK-0002']);
  assert.equal(misses[0].title, 'first');
  assert.equal(misses[0].project, 'xyzbytes');
}));

test('main near-misses flag prints json array', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { assigned: 'dev2' });
  const { rc, payload } = captureMain(['--vault', v, '--device', 'dev1', '--near-misses']);
  assert.equal(rc, 0);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].id, 'TCK-0001');
  assert.ok(payload[0].reason.includes('dev2'));
}));

// --- pinned-but-ungateable lint ---
test('lint clean vault has no violations', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { assigned: 'dev1', project: 'system' });
  write(v, 'projects/delo/tickets', 'TCK-0002', { assigned: 'dev1', project: 'delo' });
  assert.deepEqual(findPinnedUngateable(v), []);
}));

test('lint flags ticket pinned to real device missing project', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { assigned: 'dev1', project: 'xyzbytes' });
  const violations = findPinnedUngateable(v);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].id, 'TCK-0001');
  assert.equal(violations[0].assigned_device, 'dev1');
  assert.equal(violations[0].project, 'xyzbytes');
}));

test('lint ignores ticket pinned to any', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { assigned: 'any', project: 'xyzbytes' });
  assert.deepEqual(findPinnedUngateable(v), []);
}));

test('lint ignores ticket pinned to unregistered slug', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { assigned: 'ghost', project: 'xyzbytes' });
  assert.deepEqual(findPinnedUngateable(v), []);
}));

test('lint ignores system ticket pinned to any device', () => withVault((v) => {
  writeDevice(v, 'dev2', ['delo']);
  write(v, 'orchestrator/tickets', 'TCK-0001', { assigned: 'dev2', project: 'system' });
  assert.deepEqual(findPinnedUngateable(v), []);
}));

test('main lint flag prints violations', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { assigned: 'dev1', project: 'xyzbytes' });
  const { rc, payload } = captureMain(['--vault', v, '--lint']);
  assert.equal(rc, 0);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].id, 'TCK-0001');
}));

// --- schema violations ---
function fullTicket(id, extra = {}) {
  const fm = {
    id, status: 'ready', project: 'system', ticket_type: 'chore',
    assigned_device: 'any', claimed_by: 'null', priority: 'p2',
    effort: 'small', depends_on: '[]', created_by: 'agent:dev1', ...extra,
  };
  const lines = ['---'];
  for (const [k, val] of Object.entries(fm)) lines.push(`${k}: ${val}`);
  lines.push('---', '', '# body', '');
  return lines.join('\n');
}

function writeFull(vault, folder, id, extra) {
  writeFileSync(join(vault, ...folder.split('/'), `${id}.md`), fullTicket(id, extra));
}

function writeControl(vault, fm) {
  const lines = ['---'];
  for (const [k, val] of Object.entries(fm)) {
    if (Array.isArray(val)) {
      lines.push(`${k}:`);
      for (const item of val) lines.push(`  - ${item}`);
    } else {
      lines.push(`${k}: ${val}`);
    }
  }
  lines.push('---', '');
  writeFileSync(join(vault, 'orchestrator', 'control.md'), lines.join('\n'));
}

const VALID_CONTROL = {
  loop: 'paused', max_tickets_per_day: 5, max_effort: 'medium',
  allowed_types: ['research', 'docs', 'chore'],
};

function writeWithout(vault, id, dropField) {
  const lines = fullTicket(id).split('\n').filter((l) => !l.startsWith(`${dropField}:`));
  writeFileSync(join(vault, 'orchestrator', 'tickets', `${id}.md`), lines.join('\n'));
}

test('schema flags ticket missing a required field', () => withVault((v) => {
  writeWithout(v, 'TCK-0001', 'claimed_by');
  writeControl(v, VALID_CONTROL);
  const rows = findSchemaViolations(v);
  assert.ok(rows.some((r) => r.kind === 'missing_field' && r.target === 'TCK-0001'
    && r.field === 'claimed_by'));
}));

test('schema clean ticket has no missing_field rows', () => withVault((v) => {
  writeFull(v, 'orchestrator/tickets', 'TCK-0001');
  writeControl(v, VALID_CONTROL);
  const rows = findSchemaViolations(v).filter((r) => r.kind === 'missing_field');
  assert.deepEqual(rows, []);
}));

test('schema no-frontmatter note yields single frontmatter row', () => withVault((v) => {
  writeFileSync(join(v, 'orchestrator', 'tickets', 'TCK-0009.md'), 'no frontmatter here\n');
  writeControl(v, VALID_CONTROL);
  const rows = findSchemaViolations(v).filter((r) => r.kind === 'missing_field');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].target, 'TCK-0009.md');
  assert.equal(rows[0].field, 'frontmatter');
}));

test('schema flags bad control loop value', () => withVault((v) => {
  writeControl(v, { ...VALID_CONTROL, loop: 'sideways' });
  const rows = findSchemaViolations(v).filter((r) => r.kind === 'bad_control_value');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].field, 'loop');
  assert.equal(rows[0].target, 'orchestrator/control.md');
}));

test('schema flags bad control effort and allowed type', () => withVault((v) => {
  writeControl(v, { ...VALID_CONTROL, max_effort: 'huge', allowed_types: ['bogus'] });
  const fields = findSchemaViolations(v)
    .filter((r) => r.kind === 'bad_control_value').map((r) => r.field);
  assert.ok(fields.includes('max_effort'));
  assert.ok(fields.includes('allowed_types'));
}));

test('schema flags non-integer max_tickets_per_day', () => withVault((v) => {
  writeControl(v, { ...VALID_CONTROL, max_tickets_per_day: 'abc' });
  const rows = findSchemaViolations(v).filter((r) => r.kind === 'bad_control_value');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].field, 'max_tickets_per_day');
}));

test('schema valid control yields no bad_control_value rows', () => withVault((v) => {
  writeControl(v, VALID_CONTROL);
  const rows = findSchemaViolations(v).filter((r) => r.kind === 'bad_control_value');
  assert.deepEqual(rows, []);
}));

test('schema missing control emits one frontmatter row', () => withVault((v) => {
  const rows = findSchemaViolations(v).filter((r) => r.kind === 'bad_control_value');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].field, 'frontmatter');
  assert.equal(rows[0].detail, 'missing or unparseable');
}));

test('schema rows sorted by target then field', () => withVault((v) => {
  writeControl(v, VALID_CONTROL);
  const lines = fullTicket('TCK-0002').split('\n')
    .filter((l) => !l.startsWith('priority:') && !l.startsWith('effort:'));
  writeFileSync(join(v, 'orchestrator', 'tickets', 'TCK-0002.md'), lines.join('\n'));
  const rows = findSchemaViolations(v);
  const targets = rows.map((r) => r.target);
  assert.deepEqual(targets, [...targets].sort());
}));

test('main schema flag prints json array', () => withVault((v) => {
  writeFull(v, 'orchestrator/tickets', 'TCK-0001');
  writeControl(v, VALID_CONTROL);
  const { rc, payload } = captureMain(['--vault', v, '--schema']);
  assert.equal(rc, 0);
  assert.ok(Array.isArray(payload));
}));

// --- project coverage ---
test('coverage ignores ready project covered by a device', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { project: 'delo' });
  assert.deepEqual(findUncoveredProjects(v), []);
}));

test('coverage flags ready project no device covers', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { project: 'kronos' });
  const rows = findUncoveredProjects(v);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'TCK-0001');
  assert.equal(rows[0].project, 'kronos');
}));

test('coverage ignores system and non-ready tickets', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { project: 'system' });
  write(v, 'projects/delo/tickets', 'TCK-0002', { project: 'kronos', status: 'backlog' });
  assert.deepEqual(findUncoveredProjects(v), []);
}));

test('main coverage flag prints json array', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { project: 'kronos' });
  const { rc, payload } = captureMain(['--vault', v, '--coverage']);
  assert.equal(rc, 0);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].id, 'TCK-0001');
}));

// --- card presence ---
test('card presence clean when note and card agree', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { project: 'system' });
  write(v, 'projects/delo/tickets', 'TCK-0002', { project: 'delo' });
  writeBoard(v, 'orchestrator/board.md', ['TCK-0001-some-slug']);
  writeBoard(v, 'projects/delo/board.md', ['TCK-0002-other-slug']);
  assert.deepEqual(findCardPresenceIssues(v), []);
}));

test('card presence flags note with no card on its board', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { project: 'system' });
  writeBoard(v, 'orchestrator/board.md', []);
  const rows = findCardPresenceIssues(v);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'missing_card');
  assert.equal(rows[0].id, 'TCK-0001');
  assert.equal(rows[0].board, 'orchestrator/board.md');
}));

test('card presence flags project note missing from project board', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { project: 'delo' });
  writeBoard(v, 'orchestrator/board.md', []);
  writeBoard(v, 'projects/delo/board.md', []);
  const rows = findCardPresenceIssues(v);
  assert.deepEqual(rows.map((r) => [r.kind, r.id, r.board]),
    [['missing_card', 'TCK-0001', 'projects/delo/board.md']]);
}));

test('card presence flags card with no backing note', () => withVault((v) => {
  writeBoard(v, 'orchestrator/board.md', ['TCK-0099-ghost']);
  const rows = findCardPresenceIssues(v);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'orphan_card');
  assert.equal(rows[0].id, 'TCK-0099');
  assert.equal(rows[0].board, 'orchestrator/board.md');
}));

test('main card-presence flag prints json array', () => withVault((v) => {
  writeBoard(v, 'orchestrator/board.md', ['TCK-0099-ghost']);
  const { rc, payload } = captureMain(['--vault', v, '--card-presence']);
  assert.equal(rc, 0);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].kind, 'orphan_card');
}));

// --- status drift (TCK-0054): card column vs frontmatter status ---
test('status drift clean when every card column matches status', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'ready' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { status: 'in-progress', claimedBy: 'dev1' });
  writeBoardCols(v, 'orchestrator/board.md', { Ready: ['TCK-0001'], 'In Progress': ['TCK-0002'] });
  assert.deepEqual(findStatusDrift(v), []);
}));

test('status drift flags a card in the wrong column', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'in-progress', claimedBy: 'dev1' });
  writeBoardCols(v, 'orchestrator/board.md', { Ready: ['TCK-0001'] });
  const rows = findStatusDrift(v);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'TCK-0001');
  assert.equal(rows[0].cardColumn, 'Ready');
  assert.equal(rows[0].expectedColumn, 'In Progress');
}));

test('status drift maps failed status to the Blocked column', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'failed', claimedBy: 'dev1' });
  writeBoardCols(v, 'orchestrator/board.md', { Blocked: ['TCK-0001'] });
  assert.deepEqual(findStatusDrift(v), []);
  writeBoardCols(v, 'orchestrator/board.md', { Done: ['TCK-0001'] });
  const rows = findStatusDrift(v);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].expectedColumn, 'Blocked');
  assert.equal(rows[0].cardColumn, 'Done');
}));

test('status drift leaves a missing card to card-presence', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'ready' });
  writeBoardCols(v, 'orchestrator/board.md', {});
  assert.deepEqual(findStatusDrift(v), []);
}));

test('main status-drift flag prints json array', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'done' });
  writeBoardCols(v, 'orchestrator/board.md', { Ready: ['TCK-0001'] });
  const { rc, payload } = captureMain(['--vault', v, '--status-drift']);
  assert.equal(rc, 0);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].kind, 'status_drift');
  assert.equal(payload[0].expectedColumn, 'Done');
}));

test('status drift detects drift on a project board', () => withVault((v) => {
  write(v, 'projects/delo/tickets', 'TCK-0001', { project: 'delo', status: 'review', claimedBy: 'dev1' });
  writeBoardCols(v, 'projects/delo/board.md', { Backlog: ['TCK-0001'] });
  const rows = findStatusDrift(v);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'TCK-0001');
  assert.equal(rows[0].board, 'projects/delo/board.md');
  assert.equal(rows[0].cardColumn, 'Backlog');
  assert.equal(rows[0].expectedColumn, 'Review');
}));

test('status drift defers an unknown status to --schema', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'weird' });
  writeBoardCols(v, 'orchestrator/board.md', { Ready: ['TCK-0001'] });
  assert.deepEqual(findStatusDrift(v), []);
}));

test('status drift reports a card before any column heading', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'ready' });
  writeFileSync(
    join(v, 'orchestrator', 'board.md'),
    ['---', '', 'kanban-plugin: board', '', '---', '',
      '- [ ] [[TCK-0001]] #project/system #type/chore #p2', ''].join('\n'),
  );
  const rows = findStatusDrift(v);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cardColumn, '(before any column heading)');
  assert.equal(rows[0].expectedColumn, 'Ready');
}));

// --- stale claims ---
test('stale ignores fresh heartbeat', () => withVault((v) => {
  writeDevice(v, 'dev1', ['delo'], hoursAgo(1));
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'claimed' });
  writeClaim(v, 'TCK-0001', 'dev1', 'claimed');
  assert.deepEqual(findStaleClaims(v), []);
}));

test('stale flags claim on device heartbeat older than threshold', () => withVault((v) => {
  writeDevice(v, 'dev1', ['delo'], hoursAgo(48));
  writeClaim(v, 'TCK-0001', 'dev1', 'in-progress');
  const rows = findStaleClaims(v);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'TCK-0001');
  assert.equal(rows[0].claimed_by, 'dev1');
  assert.ok(rows[0].reason.includes('24'));
}));

test('stale respects custom threshold', () => withVault((v) => {
  writeDevice(v, 'dev1', ['delo'], hoursAgo(3));
  writeClaim(v, 'TCK-0001', 'dev1', 'review');
  assert.equal(findStaleClaims(v, 2).length, 1);
  assert.deepEqual(findStaleClaims(v, 4), []);
}));

test('stale reports unresolved claimed_by without crashing', () => withVault((v) => {
  writeClaim(v, 'TCK-0001', 'ghost', 'claimed');
  writeClaim(v, 'TCK-0002', 'any', 'in-progress');
  const rows = findStaleClaims(v);
  assert.deepEqual(rows.map((r) => r.id), ['TCK-0001', 'TCK-0002']);
  for (const r of rows) assert.ok(r.reason.includes('resolve'));
}));

test('stale ignores ready and done tickets', () => withVault((v) => {
  writeDevice(v, 'dev1', ['delo'], hoursAgo(48));
  writeClaim(v, 'TCK-0001', 'dev1', 'done');
  write(v, 'orchestrator/tickets', 'TCK-0002');
  assert.deepEqual(findStaleClaims(v), []);
}));

test('main stale flag honors --hours', () => withVault((v) => {
  writeDevice(v, 'dev1', ['delo'], hoursAgo(3));
  writeClaim(v, 'TCK-0001', 'dev1', 'claimed');
  const { rc, payload } = captureMain(['--vault', v, '--stale', '--hours', '2']);
  assert.equal(rc, 0);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].id, 'TCK-0001');
}));

// --- status rollups (TCK-0036) ---
function captureRaw(argv) {
  const chunks = [];
  const rc = main(argv, { log: (s) => chunks.push(s) });
  return { rc, text: chunks.join('') };
}

test('status rollup counts each lane', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'ready' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { status: 'ready' });
  write(v, 'orchestrator/tickets', 'TCK-0003', { status: 'claimed', claimedBy: 'dev1' });
  write(v, 'orchestrator/tickets', 'TCK-0004', { status: 'in-progress', claimedBy: 'dev1' });
  write(v, 'orchestrator/tickets', 'TCK-0005', { status: 'review' });
  write(v, 'orchestrator/tickets', 'TCK-0006', { status: 'blocked' });
  write(v, 'orchestrator/tickets', 'TCK-0007', { status: 'failed' });
  write(v, 'orchestrator/tickets', 'TCK-0008', { status: 'done' });
  const s = computeStatus(v);
  assert.deepEqual(s.inFlight, { claimed: 1, inProgress: 1 });
  assert.equal(s.ready, 2);
  assert.equal(s.review, 1);
  assert.equal(s.blocked, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.throughput.doneTotal, 1);
}));

test('status backlog-rot counts agent-filed vs triaged vs completed', () => withVault((v) => {
  // human-created ticket is not counted as an agent-filed improvement
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'ready', createdBy: 'umar' });
  // agent-filed, still in backlog (untriaged)
  write(v, 'orchestrator/tickets', 'TCK-0002', { status: 'backlog', createdBy: 'agent:dev1' });
  // agent-filed, triaged into ready
  write(v, 'orchestrator/tickets', 'TCK-0003', { status: 'ready', createdBy: 'agent:dev1' });
  // agent-filed, completed
  write(v, 'orchestrator/tickets', 'TCK-0004', { status: 'done', createdBy: 'agent:dev1' });
  const s = computeStatus(v);
  assert.deepEqual(s.backlogRot, { filed: 3, triaged: 2, completed: 1 });
}));

test('status throughput counts done in last 7 days by updated', () => withVault((v) => {
  const now = Date.parse('2026-07-10T00:00:00Z');
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'done', updated: '2026-07-09' });
  write(v, 'orchestrator/tickets', 'TCK-0002', { status: 'done', updated: '2026-06-01' });
  const s = computeStatus(v, { nowMs: now });
  assert.equal(s.throughput.doneTotal, 2);
  assert.equal(s.throughput.doneLast7d, 1);
}));

test('status is empty-safe on a clean board', () => withVault((v) => {
  const s = computeStatus(v);
  assert.deepEqual(s.inFlight, { claimed: 0, inProgress: 0 });
  assert.equal(s.ready, 0);
  assert.deepEqual(s.backlogRot, { filed: 0, triaged: 0, completed: 0 });
  assert.equal(s.stale.count, 0);
  assert.equal(s.throughput.doneTotal, 0);
}));

test('status folds in stale claims', () => withVault((v) => {
  writeDevice(v, 'dev1', ['delo'], hoursAgo(48));
  writeClaim(v, 'TCK-0001', 'dev1', 'claimed');
  const s = computeStatus(v);
  assert.equal(s.stale.count, 1);
  assert.equal(s.stale.tickets[0].id, 'TCK-0001');
}));

test('main --status --json prints the rollup', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'ready' });
  const { rc, payload } = captureMain(['--vault', v, '--status', '--json']);
  assert.equal(rc, 0);
  assert.equal(payload.ready, 1);
  assert.ok('backlogRot' in payload);
}));

test('main --status prints human text without --device', () => withVault((v) => {
  write(v, 'orchestrator/tickets', 'TCK-0001', { status: 'review' });
  const { rc, text } = captureRaw(['--vault', v, '--status']);
  assert.equal(rc, 0);
  assert.match(text, /Board status/);
  assert.match(text, /Review/);
}));

test('main --help notes the token-discipline intent', () => withVault((v) => {
  const { rc, text } = captureRaw(['--vault', v, '--help']);
  assert.equal(rc, 0);
  assert.match(text, /--status/);
  assert.match(text, /without loading every ticket/i);
}));
