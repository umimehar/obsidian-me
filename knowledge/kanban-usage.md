---
title: "Kanban Usage — Boards, Tickets, and the Orchestrator Workflow"
tags: [meta/system, knowledge]
created: 2026-07-02
updated: 2026-07-02
status: active
type: reference
---

# Kanban Usage

How to use the Obsidian Kanban plugin in this vault, and the workflow contract every human and agent follows. Full rationale: [[orchestrator/design|design spec]].

## The plugin in 60 seconds

- A board is a markdown file with `kanban-plugin: board` frontmatter; `## headings` are columns; list items are cards.
- Drag cards between columns in the plugin UI, or edit the markdown directly — same thing.
- Cards here are one line links to ticket notes: `- [ ] [[TCK-0004-unblock-vercel-deploys]] #project/xyzbytes #type/chore #p1`.
- Open a board note and choose "Open as kanban board" if it renders as plain markdown.

## Our boards

| Board | Scope |
|---|---|
| [[orchestrator/board\|Central]] | system + cross project tickets |
| [[projects/alrai/board\|alrai]] · [[projects/delo/board\|delo]] · [[projects/xyzbytes/board\|xyzbytes]] | project work |

Columns everywhere: `Backlog → Ready → Claimed → In Progress → Review → Done` + `Blocked`.
The card is the view. The ticket note (in the sibling `tickets/` folder) is the record. If they disagree, reconcile by recency and authorship, not a blanket rule: a Kanban-plugin auto-reflow is noise, so the note's frontmatter wins there; a deliberate HUMAN card drag is a triage signal, and when it is the newer change it wins — reconcile frontmatter to match the moved card. Use `git log`/timestamps to determine which side (card position or frontmatter) changed last before reconciling.

## Ticket lifecycle

`backlog` (untriaged) → `ready` (claimable) → `claimed` → `in-progress` → `review` → `done`, with `blocked` and `failed` as exits back to triage. Dragging Backlog → Ready IS triage — that drag is the human gate for agent created tickets.

## Creating a ticket

1. Read `next_id` from [[orchestrator/next-id|next-id]]; your id is `TCK-<zero padded>`; increment the counter in the same commit.
2. Copy the frontmatter schema from any existing ticket (all required fields present; `human_review_required` is optional; see the design spec's Ticket schema section).
3. Body sections in order: Goal, Acceptance criteria, Context, Worklog.
4. Add the card to the right board column (`Backlog` for agent created, your choice as a human).
5. Central/system tickets → `orchestrator/tickets/`; project tickets → `projects/<name>/tickets/`.
6. `human_review_required` is optional (absent == false). Set it to `true` when the ticket must have a human review; an agent MUST set it for high-risk work (auth, payments, data migration, deletes, secrets, irreversible external writes).

## Claim protocol (agents — mandatory)

This section is the **canonical, normative definition** of the claim and transition protocol. `orchestrator/design.md` (rationale) and `config/claude/skills/obsidian-loop/SKILL.md` (the executable skill) implement it and defer here; on any disagreement, this doc wins. Change a rule here once.

1. `git pull --rebase` the vault.
2. Pick: `status: ready`, device matches `assigned_device`, deps done, highest priority then oldest.
3. ONE commit: frontmatter `status: claimed` + `claimed_by` + `updated`, card moved Ready → Claimed, one `activity.log.md` line. Message: `kanban: claim TCK-XXXX (<device>)`.
4. `git push`. Rejected → rebase and re check: still yours → push; taken → pick the next ticket.
5. Work starts only after the push succeeds. Every later transition = same pull → edit → commit → push with `kanban: <verb>` messages. Append Worklog entries as you go; record your session uuid.

## Execution lanes

- **Interactive:** run `/obsidian-loop` in any agent session (Claude Code, Cursor, Codex, Gemini, or
  a local LLM); any ticket type. The skill lives at `config/claude/skills/obsidian-loop/` (a prose
  `SKILL.md` plus a read-only Node/Bun `select-tickets.mjs` selector) and uses a structured
  brainstorm → plan → TDD → verify flow for non-trivial work (the `superpowers` skills where a tool
  ships them). Usage: [[config/claude/skills/obsidian-loop/README|obsidian-loop guide]].
There is only this one lane. An **autonomous daemon lane** (a `launchd` job that claimed `auto_ok`
tickets unattended) was designed and built as [[TCK-0002-build-daemon-lane]] but never ran for real;
it was retired in [[TCK-0035-prove-or-retire-daemon-lane]] and its code deleted, because an inert
daemon plus live code implied a capability that did not exist. Interactive `/obsidian-loop` already
delivers the same outcome, and an agent session can be pointed at the board on request.

## Control and monitoring

- [[orchestrator/control|control.md]] — `loop: paused` and `devices_enabled` are the human-owned
  control surface; `max_effort` and `allowed_types` bound what a run may take on; `require_review`
  sets the default reviewer (`true` = human reviews and the loop stops in `Review`; `false` = a
  mandatory high-effort agent review that self-closes to `Done` on pass). A ticket's own
  `human_review_required: true` forces human review regardless. Never edited by an agent. Editable
  from any synced device, including phone.
- [[orchestrator/dashboard|dashboard.md]] — live Dataview: in flight, ready queue, stale claims, failed, per week throughput, and devices with a >48h staleness flag.
- [[orchestrator/activity.log|activity.log.md]] + `git log --grep "kanban:"` — full audit trail.

## The self upgrading loop

Agents file follow up tickets into Backlog only (`created_by: agent:<device>`). The recurring loop retro ticket audits the system and files improvement tickets. Humans triage Backlog → Ready — except tickets with `triage: auto` and an allowed `ticket_type`, which may enter Ready on their own (the bounded fully autonomous sub loop).

### Retro cadence (bounded trigger)

A retro is a periodic audit, not a self-perpetuating chain. **A retro never creates the next retro ticket.** Six retro cycles ran in two days once (TCK-0003/0014/0020/0026/0031/0033) because each cycle spawned the next; that fanned out improvement tickets faster than the human could triage them and rotted the backlog (see [[TCK-0037-cap-retro-cadence]]).

The next retro is instead gated by a cadence rule, checked from the board data, not by the previous retro:

> **A retro becomes eligible only when at least 10 tickets have reached Done since the last completed retro, OR at least 7 days have passed since it, whichever comes first. A retro never creates the next retro ticket, and a retro is skipped while 5 or more of the previous retro's tickets remain untriaged in Backlog.**

The numbers: N = 10 Done tickets, cadence cap = 7 days, backlog guard = 5 untriaged retro-created tickets (set by advice agent fable). The 10-Done floor guarantees enough new signal to be worth auditing; the 7-day cap guarantees a slow week still gets roughly one retro (a ceiling of about one per week instead of the observed three per day); and the backlog guard attacks the rot directly — a retro cannot run again until its predecessor's output has been triaged, so cheap ticket churn cannot game it. All three checks are single reads off the raw board data: the count of Done tickets since the last retro's date, that date itself, and the Backlog count of agent-created retro tickets — so `select-tickets.mjs --status` (see [[TCK-0036-headless-status-rollups]]) can surface "retro due? yes/no" without opening the app.

## Devices

Each machine has a file in `orchestrator/devices/`. To add a device: clone the vault, copy an existing device file, set `slug`, `hostname`, `capabilities`, `repos`. Pin work to it with `assigned_device: <slug>`.

## Rules

- Never work a ticket you didn't successfully claim (push confirmed).
- A ticket's `assigned_device` must name a device whose `repos` include the ticket's `project`, or the ticket must be `project: system`. Otherwise the ticket is pinned to a device that can never gate it in, so no one works it. Run `node select-tickets.mjs --lint` to list any such pinned but ungateable tickets.
- Never move agent created tickets out of Backlog yourself unless `triage: auto`.
- Failed work: set `status: failed`, error in Worklog, stop. No automatic retries. A failed ticket keeps `status: failed` in its frontmatter and parks its card in the `Blocked` column; there is no separate Failed column.
- Malformed ticket? Skip it and file a `chore` ticket to fix it. Never guess.
- Timestamps: device `last_heartbeat` is a full datetime (`YYYY-MM-DDTHH:MM:SS`) so same session refreshes register and the 48h staleness flag fires on time; ticket `updated` stays date only (`YYYY-MM-DD`) and drives the day granular stale claim flag. Minute level progress goes in Worklog `HH:MM` lines, not `updated`.
