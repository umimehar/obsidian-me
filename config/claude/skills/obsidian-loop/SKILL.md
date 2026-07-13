---
name: obsidian-loop
description: (Obsidian)  Claim and execute tickets from an Obsidian vault kanban board (obsidian-me or obsidian-dev) following the claim protocol. Use when the user runs /obsidian-loop, or asks to "work the next ticket", "claim TCK-XXXX", or "work the board".
---

# Obsidian Loop — Work the Vault Kanban Board

Claim and execute one ticket from an Obsidian vault kanban board, following the claim
protocol exactly. This one skill serves both vaults (`obsidian-me` and `obsidian-dev`): it resolves
the vault from the session's working directory, so running it inside either repo works the right
board. This skill is the single implementation of the protocol. Work is driven
interactively — a human (or an agent acting on request) runs `/obsidian-loop` or `/obsidian-loop
TCK-XXXX`. There is no autonomous background lane (the daemon was retired in TCK-0035).

`/obsidian-loop` with no argument claims the best claimable ticket for this device.
`/obsidian-loop TCK-XXXX` claims that specific ticket, or explains precisely why it cannot.

## Constants

- `VAULT` — resolve dynamically, do NOT hardcode a vault:
  `VAULT=$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null)`. This is the vault the session is in
  (`obsidian-me` or `obsidian-dev`). Validate it: abort with a clear message if `test -d "$VAULT/.git"`
  fails OR `test -f "$VAULT/orchestrator/board.md"` fails (not inside an Obsidian orchestrator vault).
  If the cwd is outside any vault, ask the user which vault to work and `cd` there first. Every
  selector/guard call below passes `--vault "$VAULT"`, so the same skill drives whichever vault you run it in.
- Boards: `orchestrator/board.md` plus every `projects/*/board.md`. Ticket notes live in the sibling
  `tickets/` folder next to each board.
- Selector: `node "$VAULT/config/claude/skills/obsidian-loop/select-tickets.mjs"` (read-only).
- Column ↔ status map:

  | Column | status |
  |---|---|
  | Backlog | backlog |
  | Ready | ready |
  | Claimed | claimed |
  | In Progress | in-progress |
  | Review | review |
  | Blocked | blocked |
  | Done | done |

  A `failed` ticket's card parks in `Blocked` (the `failed` status stays in frontmatter).

## 1. Preflight

1. `test -d "$VAULT/.git"` — if it fails, stop and tell the user the vault is missing.
2. `git -C "$VAULT" pull --rebase`. If it fails on a dirty tree, report the dirty files
   (`git -C "$VAULT" status --short`) and stop. NEVER `git stash` — an interrupted stash has silently
   eaten vault edits before (see `knowledge/lessons.md`).
3. Self-heal the git auto-backup guard:
   `node "$VAULT/config/claude/skills/obsidian-loop/loop-git-guard.mjs" status`. If `sentinelExists`
   is `true`, a prior run crashed while auto-commit was paused — run `loop-git-guard.mjs resume` now
   so the owner's auto-commit is never left disabled. See §5.5.

## 2. Device identity

1. Read both identifiers: `hostname -s` and `scutil --get ComputerName`. `hostname -s` is NOT stable
   on macOS — it drifts via DHCP/mDNS (observed flipping between `Mac` and `Mac-Studio` on the same
   machine), so it alone is unreliable. `scutil --get ComputerName` is the stable local identifier.
2. Match this machine against `orchestrator/devices/*.md`: a device file matches if its
   `computer_name:` equals `scutil --get ComputerName` **or** its `hostname:` equals `hostname -s`.
   The matched `slug:` is `$DEVICE` for every commit and frontmatter write; that file's `repos:` list
   gates which projects' tickets are claimable here.
3. **On a collision** (more than one file matches — e.g. `mac-studio` and `personal-macbook` both
   declare `hostname: Mac`), the `computer_name:` match is authoritative: the file whose
   `computer_name:` equals `scutil --get ComputerName` wins. Every device that shares a bare
   `hostname` MUST carry a `computer_name:`. Zero matches or still ambiguous → step 4. NEVER pick
   arbitrarily.
4. No match → STOP. Register this device: copy an existing device file, set `slug`, `hostname`,
   `computer_name` (the stable `scutil --get ComputerName` — required), `capabilities`, `repos`.
   Never guess a slug.

## 3. Select the ticket

**No argument:**

```bash
node "$VAULT/config/claude/skills/obsidian-loop/select-tickets.mjs" --device "$DEVICE"
```

The output is a JSON array of claimable tickets, best first (priority `p0<p1<p2<p3`, then `created`
ascending, then id). Take the first entry. Empty array → run the near-miss reporter to show why every
ready ticket was gated out, then report each near-miss id with its `reason`:

```bash
node "$VAULT/config/claude/skills/obsidian-loop/select-tickets.mjs" --near-misses --device "$DEVICE"
```

It returns a JSON array of `{ id, title, project, reason }` for every `ready` ticket this device cannot
claim. Report each id and reason. Empty here too → there are genuinely no ready tickets.

**With a `TCK-XXXX` argument:**

```bash
node "$VAULT/config/claude/skills/obsidian-loop/select-tickets.mjs" --device "$DEVICE" --explain TCK-XXXX
```

If `claimable` is false, print the `reason` (wrong status, pinned elsewhere, unmet deps, project not
in device repos) and stop. Do not claim a ticket the selector rejects.

## 4. Claim (one commit, then push — work starts only after the push succeeds)

> This skill is the executable implementation of the claim/transition protocol whose canonical,
> normative definition lives in `knowledge/kanban-usage.md` (§Claim protocol). The concrete commands
> below are the implementation; if they ever disagree with that doc on a rule, the doc wins.

Do ALL of the following, then commit them together:

1. Ticket frontmatter: `status: claimed`, `claimed_by: $DEVICE`, `updated: <today>`.
2. Move the card line (text unchanged) from `## Ready` to `## Claimed` on that ticket's board.
3. Append to `orchestrator/activity.log.md`:
   `- $(date "+%Y-%m-%d %H:%M") · $DEVICE · claim · TCK-XXXX · <one line>`.
4. Bump `last_heartbeat` in `orchestrator/devices/$DEVICE.md` to the current datetime
   (`$(date "+%Y-%m-%dT%H:%M:%S")`); date only granularity makes a same day refresh a silent no op.

Then:

```bash
git -C "$VAULT" add <ticket> orchestrator/board.md orchestrator/activity.log.md orchestrator/devices/$DEVICE.md
git -C "$VAULT" commit -m "kanban: claim TCK-XXXX ($DEVICE)"
git -C "$VAULT" push
```

**Push rejected** → `git -C "$VAULT" pull --rebase`. Re-check the ticket's `claimed_by`: still
`$DEVICE` → push again; another device took it → revert your local claim edits and return to
step 3 to pick the next ticket. NEVER `git stash`.

## 5. Start

Same one-commit pattern as the claim: `status: in-progress`, card `Claimed → In Progress`, activity
verb `start`, `last_heartbeat` bumped. Commit `kanban: start TCK-XXXX ($DEVICE)`, push.

Record the session id (and, when known, the agent CLI, provider, and model that produced it) so the
ticket can be resumed later. Find the id in your CLI's session transcript directory, for example
`~/.claude/projects/<cwd-slug>/*.jsonl` (Claude Code), `~/.cursor/projects/.../agent-transcripts/`
(Cursor), or the equivalent for Codex or your tool. Write it into the ticket `session:` field. Leave
`null` if it cannot be determined — do not fabricate.

### 5.5 Pause the git auto-backup for the run

After the start push, pause the Obsidian git plugin's auto-commit so it cannot sweep this run's edits
into a generic `vault backup:` commit mid work (the race documented in
[[TCK-0030-guard-git-auto-backup-race]]):

```bash
node "$VAULT/config/claude/skills/obsidian-loop/loop-git-guard.mjs" pause
```

The guard writes `autoSaveInterval: 0` into the gitignored `.obsidian/plugins/obsidian-git/data.json`;
obsidian-git's `onExternalSettingsChange` hook reloads and stops the live timer at once. The owner's
real interval is saved in a sentinel (`~/.local/state/obsidian-loop/git-guard.json`), which is the
source of truth for the resume — so a crashed run self-heals at the next preflight (§1 step 3). This
never edits `control.md` and never creates a vault commit. **Guaranteed resume:** run
`loop-git-guard.mjs resume` at every §7 exit (review/done/blocked/failed) AND on any abort. Do not
change the obsidian-git auto-commit interval in the Obsidian UI while a run is paused — `resume`
restores the pre-pause value and would overwrite that manual edit.

## 6. Execute

1. Read the ticket's Goal, Acceptance criteria, and Context. Do the work in the relevant repo
   (repo paths per `projects/<name>/README.md`).
2. Non-trivial work follows a structured flow inside the ticket scope: brainstorm the design, write
   a plan, implement test-first, then verify before moving to Review. If your tool ships these as
   skills (for example the `superpowers` skills `brainstorming` → `writing-plans` →
   `test-driven-development` → `verification-before-completion` on Claude Code, Codex, or Gemini),
   use them; otherwise follow the equivalent workflow manually.
3. Append a Worklog line at each milestone: `- YYYY-MM-DD HH:MM — <what happened>`. Check off
   acceptance-criteria boxes as they are met.
4. Follow-ups discovered during the work go into **Backlog** only: new ticket with
   `created_by: agent:$DEVICE`, id taken from `orchestrator/next-id.md` with the counter bumped in
   the same commit, activity verb `create`. Never move agent-created tickets out of Backlog (unless
   the ticket carries `triage: auto`).

### Parallelism — use subagents whenever work is genuinely independent

This device holds at most one claimed ticket at a time; parallelism happens WITHIN that ticket. Map
dependencies first, keep same-file or dependent work sequential, then fan out only genuinely
independent subtasks (auditing several repos, researching multiple sources, editing unrelated files)
to 3 to 5 subagents with a complete self-contained brief each, and synthesize their distilled
results. Reserve fan-out for high-value independent work; most tickets need one focused session.
Full guidance (subagents vs agent teams, briefing, graceful degradation, model routing): see
[`references/parallelism.md`](references/parallelism.md).

### Verify before Review

- Run the ticket's own tests, linter, and type checker; paste the real output into the Worklog
  (evidence, not assertion).
- Check beyond what you edited: search the repo for other usages of any symbol you changed. If
  something turns up that you never opened, the ticket is not done.
- Verify before moving to Review: use a verification skill if your tool has one (for example
  `superpowers:verification-before-completion`), otherwise do a deliberate self-check that the
  evidence actually supports the claim.

### Flag high-risk tickets for human review

Set the ticket's `human_review_required: true` the moment the work looks high-risk: auth or
authorization, payments or money movement, data migration, destructive or irreversible operations,
deletes, secrets or credentials, or any external write that is hard to reverse. This forces the human
review path at Finish (§7) regardless of `control.md`. When in doubt, flag it — a human is the safe
default. See [`references/review-gate.md`](references/review-gate.md).

### Loop guardrails

- Respect `orchestrator/control.md` `max_effort`; if a ticket is ballooning past its `effort`, stop
  and split it into Backlog follow-ups rather than grinding.
- Never blind-retry a failed command: diagnose the error and change approach. Repeating the same
  failing action is the most common agent failure mode.
- Prune as you go. Treat the ticket note (Goal / Acceptance / Worklog) as the durable state, not a
  growing scratch context.
- Never hard-wrap ticket prose at a fixed column. Write one line per paragraph / list item and let
  the editor soft-wrap (vault CLAUDE.md "Prose line breaks"). Wrapping Goal, Recommendation, Worklog,
  etc. at ~100 chars reflows badly in git diffs and is a recurring correction.
- Capture every correction or surprise into `knowledge/lessons.md` automatically (never ask first).

### Token efficiency — spend context on signal, not noise

Re-sent context, not the current prompt, is the bulk of the bill. Start each ticket with a clean
context (`/clear` or a fresh session); read narrowly (ticket note plus only the exact files needed,
selector over loading every ticket); filter noisy tool output through `grep`/`head`/`tail` and offload
large artifacts to scratch files; treat the ticket Worklog and atomic `kanban:` commits as the durable
external memory; keep the stable prefix stable for prompt caching; and route effort/model to the
ticket's `effort` and `ticket_type` within `control.md` `max_effort`. Full guidance: see
[`references/token-efficiency.md`](references/token-efficiency.md).

## 7. Finish (each transition: one commit + push, same pattern)

- **Review (mandatory — pick the reviewer):** resolve `humanReviewRequired = control.md require_review
  OR ticket human_review_required`. If **true** (human path): `status: review`, card → `## Review`,
  verb `review`, Worklog summary line pointing at the evidence (commits, PRs, test output), then stop
  for the human. If **false** (agent path): run a specialized reviewer subagent at opus / high effort
  over the diff and evidence; fix and re-review its findings, capped at 3 rounds. On pass, take the
  **Done** exit below. Still failing after 3 rounds → set `human_review_required: true` and take the
  human path, recording the unresolved findings in the Worklog. Full detail (reviewer selection table,
  brief, escalation): see [`references/review-gate.md`](references/review-gate.md).
- **Done:** `status: done`, card → `## Done` as `- [x]`, verb `done` — when the human explicitly
  confirms in this session, OR when the agent-review path (above) returned a pass. Never self-close to
  Done on the human path.
- **Blocked:** `status: blocked`, card → `## Blocked`, verb `block`, Worklog states exactly what
  unblocks it.
- **Failed:** `status: failed`, card → `## Blocked`, verb `fail`, the error verbatim in the Worklog,
  then stop. No automatic retries.

At every one of these exits (and on any abort), resume the git auto-backup you paused in §5.5:
`node "$VAULT/config/claude/skills/obsidian-loop/loop-git-guard.mjs" resume`. It is idempotent and a
no-op when nothing is paused, so it is safe to run unconditionally.

## Hard rules

- Never work a ticket without a successfully pushed claim commit.
- Ticket note frontmatter wins over card position; fix any disagreement in the next commit that
  touches that ticket.
- Never `git stash`; never `rm` (use `git rm` or `trash`); never edit `orchestrator/control.md`
  (human-owned kill switch).
- Malformed ticket → skip it and file a `chore` ticket to fix it. Never guess.
- `touch` a file before appending with `>>` (this machine's zsh has `noclobber`, so `>>` will not
  create a missing file).
- Each transition commit touches only the ticket note, its board, `activity.log.md`, and (on
  claim/start) the device file. Keep feature work in separate commits.

## Board hygiene

Six read-only selector modes audit the board for drift. Run them from
`config/claude/skills/obsidian-loop/`; each prints a JSON array that is empty when the board is clean.

```bash
node select-tickets.mjs --lint
node select-tickets.mjs --schema
node select-tickets.mjs --coverage
node select-tickets.mjs --card-presence
node select-tickets.mjs --status-drift
node select-tickets.mjs --stale            # optional: --hours N (default 24)
```

In order: `--lint` (pins no device can claim), `--schema` (bad ticket frontmatter or `control.md`
values), `--coverage` (`ready` tickets whose project no device holds), `--card-presence`
(`missing_card`/`orphan_card`, one card per note per its board), `--status-drift` (a card sitting in a
column that disagrees with its frontmatter `status` — the complement to card-presence: it checks
*which* column, not merely that a card exists), `--stale` (claimed/in-progress/review tickets whose
device heartbeat is past the threshold). Per-flag detail: see
[`references/board-hygiene.md`](references/board-hygiene.md).

### Board drift (plugin reflow + git auto-backup race)

Two out-of-band writers dirty the tree mid-run. The **Kanban plugin** reflows `*/board.md` (blank
lines, trailing newline, sometimes a moved card) while Obsidian is open — for an auto-reflow,
frontmatter is the source of truth, but a deliberate newer HUMAN card drag wins and frontmatter is
reconciled to it. The **git auto-backup plugin** sweeps every unstaged change into a generic
`vault backup:` commit on an interval — no work is ever lost, only per-commit provenance, so keep your
own commits atomic (commit foreign changes separately first) and never `git stash`. A dirty tree at
preflight is usually one of these, not corruption; reconcile by authorship. Full detail, including the
masked-exit-code trap and the relevant lessons/tickets: see
[`references/board-drift.md`](references/board-drift.md).

## Portability and references

This skill is tool-agnostic: the protocol is prose plus a plain Node (`.mjs`, Bun-compatible) selector
and `git`, so it runs under Claude Code, Cursor, Codex, Gemini CLI, or a local LLM — substitute your
tool's equivalent for the examples above (`/clear`, `superpowers` skills, session-transcript paths).
Install differs per tool (see this skill's `README.md`). Portability notes and the loop-design source
list are in [`references/loop-design.md`](references/loop-design.md).
