---
title: "Kanban Orchestrator — Design Spec"
tags: [meta/system, decision]
created: 2026-07-02
updated: 2026-07-02
status: active
type: decision
project: orchestrator
---

# Kanban Orchestrator — Design Spec

Approved 2026-07-02. Defines a kanban based orchestration system inside this vault: tickets flow across devices, agents claim and execute them, the system monitors itself and files its own improvement work. The Obsidian Kanban plugin is the UI, markdown is the state, git is the transport, audit log, and claim arbiter.

> **Update 2026-07-03 (TCK-0035):** the **autonomous daemon lane** described below was built (TCK-0002) but never ran for real, so it was **retired** and its code deleted. The interactive `/obsidian-loop` skill is now the sole execution lane; an agent session is pointed at the board on request. The daemon sections are kept below as a design record, marked RETIRED. `control.md` stays as the human-owned control surface.

## Goals

1. One place to create, assign, and monitor work across all projects and all devices.
2. Agents (Claude Code sessions) can claim, execute, and complete tickets with plain file edits plus git.
3. Two execution lanes from day one: an interactive skill a human starts, and an autonomous daemon lane that is watchable, start/stoppable, and monitorable.
4. A self upgrading loop with a human gate: agents file follow up and improvement tickets into Backlog; the human promotes them to Ready. A bounded fully autonomous sub loop exists for pre approved ticket types.

## Architecture decision

**Markdown + git as the whole machine, with opportunistic REST reads.** Board files and ticket notes are the single source of truth. Every state change is a git commit. When Obsidian is running locally, agents may use the Local REST API and Dataview for fast reads and searches; the file system is the fallback for reads and always the write path. Rejected: REST as backbone (breaks headless daemons) and an external queue (two sources of truth, contradicts the kanban substrate).

## Vault layout

```
orchestrator/
  design.md             ← this spec
  board.md              ← central kanban (system + cross project tickets)
  control.md            ← loop switch, budgets, guardrails (the kill switch)
  dashboard.md          ← Dataview monitor across all boards and devices
  activity.log.md       ← append only event log
  next-id.md            ← global ticket id counter
  plans/<date>-<slug>.md   ← design and plan docs for larger tickets
  devices/<slug>.md     ← one file per device: identity, capabilities, heartbeat
  tickets/TCK-XXXX-<slug>.md
projects/<name>/
  board.md              ← project kanban
  tickets/TCK-XXXX-<slug>.md
knowledge/kanban-usage.md   ← usage doc: plugin how to + workflow contract
```

Everything under `orchestrator/`, board files, and ticket notes stay **markdown** (machine read by agents and required by the kanban plugin); the HTML first preference applies to project content, not to orchestration state.

## Boards

Standard Obsidian Kanban plugin format (`kanban-plugin: board` frontmatter, `##` headings as columns). Columns on every board:

`Backlog → Ready → Claimed → In Progress → Review → Done` plus `Blocked`.

Cards are one line views linking to the ticket note:

```
- [ ] [[TCK-0007-fix-vercel-deploys]] #project/xyzbytes #type/chore #p1
```

The card is the view; the ticket note is the record. Column position and ticket `status` must agree; the agent moving a ticket updates both in the same commit.

A ticket with `status: failed` keeps that status in its frontmatter and parks its card in the `Blocked` column; there is no separate Failed column.

## Ticket schema

Ticket notes live in the `tickets/` folder next to their board. Filename `TCK-XXXX-<kebab-slug>.md`. IDs are globally unique across all boards, allocated from `orchestrator/next-id.md` (a counter file bumped in the same commit that creates the ticket).

```yaml
---
title: "TCK-0007 — Fix Vercel git-triggered deploys"
tags: [ticket, project/xyzbytes, type/chore]
created: 2026-07-02
updated: 2026-07-02
type: ticket
id: TCK-0007
status: ready          # backlog|ready|claimed|in-progress|review|done|blocked|failed
project: xyzbytes      # or "system" for orchestrator tickets
ticket_type: chore     # research|docs|chore|test|feature|bug|spike|loop
assigned_device: any   # "any" or a device slug
claimed_by: null       # device slug, set atomically at claim time
auto_ok: false         # true = daemon may run this unattended
triage: manual         # manual | auto (auto = may skip the human Backlog gate)
priority: p2           # p0..p3
effort: small          # small|medium|large
depends_on: []         # ticket ids
created_by: umar       # "umar" or "agent:<device-slug>"
session: null          # claude session uuid once worked
human_review_required: false  # optional; true = a human must review. Agent sets this for high-risk work (auth, payments, migrations, deletes, secrets). Absent == false.
---
```

Body sections, in order: **Goal**, **Acceptance criteria**, **Context** (wikilinks, repo paths, related tickets), **Worklog** (append only, timestamped entries in the vault's existing log style).

## Device identity

A device joins the fleet by cloning the vault and writing `orchestrator/devices/<slug>.md`:

```yaml
---
title: "Device — macbook-delo"
tags: [meta/system, device]
created: 2026-07-02
updated: 2026-07-02
status: active
type: device
slug: macbook-delo
hostname: CA-JHHMW4F77T
os: macos
capabilities: [claude-code, node, python, xcode]
repos: [alrai, xyzbytes, delo]   # project repos cloned on this device
daemon: false                    # whether the autonomous lane runs here
last_heartbeat: 2026-07-02T12:00:00
---
```

A ticket with `assigned_device: any` is claimable by any device whose `repos`/`capabilities` cover the ticket's project. A pinned ticket waits for its device. Agents refresh `last_heartbeat` when they claim or complete work; the dashboard flags devices silent for more than 48 hours. `last_heartbeat` is a full ISO 8601 local datetime (`YYYY-MM-DDTHH:MM:SS`, second precision) — date only granularity made a same day refresh a silent no op and stopped the 48 hour flag from firing at the right time.

### Project coverage (audit)

`select-tickets.mjs --coverage` lists `ready` non-system tickets whose `project` is in no registered device's `repos` — those tickets can never be claimed. The selector is ticket driven, so a project with no `ready` tickets never surfaces even when no device covers it; the standing disposition of every project is recorded here so the gap is explicit rather than merely latent. A project is **covered** when a registered device that physically holds its repo lists the repo in `repos:`. A project no device holds is **dormant**: it is intentionally uncovered, and to un-dormant it the device that actually clones the repo adds the project to its own `repos:` (never add a repo to a device that does not hold it — that recreates the pinned-but-ungateable bug from [[TCK-0012-device-repo-coverage|TCK-0012]]).

Audit as of 2026-07-03 (TCK-0017), fleet = mac-studio, macbook-delo, personal-macbook:

| Project | Disposition | Covered by / reason |
|---|---|---|
| delo | covered | macbook-delo (`repos: [delo]`) |
| personal | covered | mac-studio, personal-macbook |
| xyzbytes | covered | mac-studio, personal-macbook (`~/apps/xyzbytes/xyzbytes`) |
| alrai | covered | personal-macbook (`~/apps/xyzbytes/alrai`, `umimehar/alrai`). Was dormant until 2026-07-03, when personal-macbook — which holds the repo — added it to `repos:`. Board is currently empty (the former TCK-0009 note is gone), but the project is now claimable. |
| kronos | dormant | vault-resident forecasting tool (`kronos-forecast` skill); no `board.md`, so it is not kanban orchestrated. No ticket work is tracked here. |

`_template` is a scaffold, not a project. `--coverage` returning `[]` confirms no non-dormant project has an unclaimable `ready` ticket. A `ready` ticket appearing under a dormant project is a real signal (work resumed without coverage) and `--coverage` should surface it — the selector is deliberately not taught to suppress dormant projects.

## Claim protocol

A single serialized claim, arbitrated by git, prevents two devices working one ticket: each transition is one commit (`status` + card move + an `activity.log.md` line) that must push before work continues, and a rejected push means rebase, re check ownership, then yield if another device won the race. All writes go through it, so git history doubles as a complete, tamper evident audit trail.

The full step-by-step (claim, start, review, done, blocked, failed, with commit-message and selection rules) is defined canonically in [[knowledge/kanban-usage#Claim protocol (agents — mandatory)|kanban-usage.md]]; that doc is normative and this spec defers to it. It is deliberately not restated here — three full copies drifted once, which TCK-0040 consolidated.

## Execution lanes

**Interactive lane (skill, built later as TCK-0001).** A human runs `/obsidian-loop` (optionally with a ticket id) in a Claude Code session on any device. The skill pulls, claims per the protocol, executes the ticket in the relevant repo, writes the Worklog, records its `session` uuid, moves the ticket to `Review` (or `Done` for trivial ticket types when the human confirms), and pushes. Any ticket type is eligible.

**Autonomous lane (daemon, TCK-0002) — RETIRED (TCK-0035, 2026-07-03).** Built and unit-tested but never run for real; code deleted. Kept here as a design record. A `launchd` job per opted in device wakes every N minutes and runs a small script: pull vault → parse `control.md` → if `loop: running`, device enabled, and daily budget remains → pick ONE ticket that is `ready + auto_ok: true + ticket_type ∈ allowed_types + effort ≤ max_effort` → claim per protocol → spawn `claude -p "/obsidian-loop TCK-XXXX"` headless with a capped permission mode → log the outcome. One ticket per wake; no parallel daemon runs per device; autonomous work always lands in `Review`, never `Done`.

## control.md — the cockpit

Human edited from any synced device (including phone); read by every daemon before every action.

```yaml
---
title: "Orchestrator Control"
tags: [meta/system]
created: 2026-07-02
updated: 2026-07-02
status: active
type: control
loop: paused             # running | paused  ← the kill switch
max_tickets_per_day: 5   # per device, autonomous lane only
max_effort: medium
allowed_types: [research, docs, chore, test]
require_review: true     # retired-daemon meaning; current semantics (human vs agent reviewer) live in control.md / kanban-usage.md
devices_enabled: []      # device slugs allowed to run the daemon
---
```

Flip `loop: paused` and every daemon stands down on its next wake. Failed autonomous tickets get `status: failed`, the error in the Worklog, and are never retried automatically; a human or interactive session triages them.

## Monitoring

1. **The boards** — the kanban plugin UI is the live visual state.
2. **`dashboard.md`** — Dataview tables over all `tickets/` folders: in flight by device, Ready queue by priority, failed, blocked, stale claims (claimed with no update for over a day), throughput per ISO week, current `control.md` state, device heartbeats with a staleness flag.
3. **`activity.log.md` + git log** — every transition is one appended line and one conventional commit, so `git log --grep kanban:` reconstructs everything.

### Timestamp granularity

Two fields carry timestamps, at two different granularities on purpose:

- **`last_heartbeat` (device files) — datetime, second precision.** Refreshed several times within a single working session, so it needs sub day resolution; the dashboard staleness flag compares it against `now - 48h`.
- **Ticket `updated` — date granularity (`YYYY-MM-DD`).** A ticket advances across the board over calendar days, and the stale claim signal is a human facing "has this claim gone quiet" check, so day resolution is sufficient. The stale claim query flags a claimed or in progress ticket whose `updated` is more than one full day old (fires once a claim is untouched across a day boundary). Per minute progress lives in the Worklog `HH:MM` lines, not in `updated`.

## Self upgrading loop

- Agents finishing a ticket may file follow up tickets (`created_by: agent:<slug>`) into **Backlog** only.
- A recurring **loop engineering** ticket (`ticket_type: loop`) audits the system: failed tickets, stale claims, guardrails that blocked useful work, missing skills or capabilities, board hygiene — and files improvement tickets into Backlog. A retro never spawns the next retro; the next one is gated by the bounded cadence rule (≥10 tickets Done since the last retro OR ≥7 days, whichever first, and skipped while ≥5 of the previous retro's tickets stay untriaged in Backlog) defined in [[knowledge/kanban-usage#Retro cadence (bounded trigger)|kanban-usage.md]]. See TCK-0037.
- **Human gate:** the drag from Backlog to Ready is triage; agent created tickets wait there by default.
- **Autonomous sub loop:** tickets whose `ticket_type ∈ allowed_types` AND `triage: auto` may enter Ready without human triage. Still bounded by `control.md` budgets and `require_review`. This is the fully autonomous mode: watchable (dashboard + activity log), stoppable (`loop: paused`), monitorable (git history).

## Failure handling

- Push race → resolved by the claim protocol (rebase, re check, yield).
- Agent dies mid ticket → stale claim rule: dashboard flags it; a human or the loop retro reassigns (`status: ready`, `claimed_by: null`).
- Malformed ticket frontmatter → agents skip it and file a `chore` ticket to fix it; never guess.
- Board/note status disagreement → ticket note frontmatter wins; the discrepancy is corrected in the next commit that touches the ticket.
- obsidian-git auto backup races → agents doing orchestration writes use their own `pull --rebase`/push cycle and tolerate a rejected push per the protocol (see the existing lesson in `knowledge/lessons.md`).

## Deliverables

**Today (this implementation):**
1. `orchestrator/` scaffold: `board.md`, `control.md` (loop: paused), `dashboard.md`, `activity.log.md`, `next-id.md`, `devices/macbook-delo.md`, `design.md` (this file).
2. Central board seeded with real tickets from `hot.md` plus the system's own build tickets: TCK-0001 build `/obsidian-loop` skill, TCK-0002 build daemon script, TCK-0003 loop retro cycle 1.
3. Project boards + `tickets/` for alrai, delo, xyzbytes seeded from current focus items.
4. `knowledge/kanban-usage.md`: kanban plugin usage plus the full workflow contract (this spec, condensed for operators and agents).

**Later (as tickets on the board):** the `/obsidian-loop` skill, the daemon script + launchd plist, dashboard refinements, additional devices.

## Verification

- Boards render correctly in the Obsidian Kanban plugin (open each board).
- Dataview dashboard queries resolve without errors.
- A dry run of the claim protocol on a seeded ticket: claim commit, push, status/card agreement.
- Vault committed and pushed so a second device can join by pulling.
