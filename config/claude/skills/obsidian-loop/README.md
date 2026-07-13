---
title: "Using /obsidian-loop"
tags: [meta/system, reference, project/system]
created: 2026-07-02
updated: 2026-07-02
status: active
type: reference
---

# Using `/obsidian-loop`

An agent skill that claims and works one ticket from the vault kanban boards, following the claim
protocol so work is coordinated across devices. It is tool-agnostic — usable from Claude Code,
Cursor, Codex, Gemini CLI, or a local LLM (the selector is plain Node `.mjs`, Bun-compatible, and
every transition is `git`). It is the sole execution lane of the [[orchestrator/design|orchestrator]];
the once-planned autonomous daemon was retired in TCK-0035.

## When it runs

The skill activates when you type the slash command, or when you ask in plain language:

- `/obsidian-loop` — claim and work the best claimable ticket for this device.
- `/obsidian-loop TCK-0006` — claim and work that specific ticket.
- "work the next ticket", "claim TCK-0006", "work the board" — same thing, no slash needed.

## What one run does

1. Pulls the vault and resolves this device against `orchestrator/devices/*.md` by `computer_name` (`scutil --get ComputerName`, stable) or `hostname` (`hostname -s`, which drifts on macOS).
2. Picks the ticket: with no argument it takes the top of the ranked claimable list; with an id it
   validates that one ticket and explains precisely if it cannot be claimed.
3. Claims it in one pushed commit (ticket frontmatter, board card, activity log, device heartbeat),
   then works it, appending a Worklog line at each milestone.
4. Leaves the ticket in **Review** by default. It only marks a ticket **done** when you confirm in
   the session.

Every state change is one atomic commit with a `kanban:` message, pushed immediately.

## See what is claimable without claiming

The selector is read only, so you can inspect the queue any time:

```bash
# ranked list of everything this device can claim, best first.
# The script defaults to its own vault; pass --vault to target a specific one.
node ~/obsidian/obsidian-me/config/claude/skills/obsidian-loop/select-tickets.mjs --device mac-studio

# why a specific ticket is or is not claimable
node ~/obsidian/obsidian-me/config/claude/skills/obsidian-loop/select-tickets.mjs --device mac-studio --explain TCK-0001
```

`--device` is the device `slug` from its file in `orchestrator/devices/`. Ranking is priority
(`p0` before `p3`), then oldest `created`, then id. A ticket is claimable when its `status` is
`ready`, it is not pinned to another device, all `depends_on` tickets are `done`, and its `project`
is `system` or one of this device's `repos`.

## First run on a new device

If neither `computer_name` nor `hostname` matches a device file, the skill stops and asks you to register the device: copy an
existing file in `orchestrator/devices/`, then set `slug`, `hostname`, `computer_name`, `capabilities`, and `repos`.
It never guesses a slug. Install the skill once for your tool: on Claude Code run
`config/claude/bootstrap.sh` (symlinks it into `~/.claude/skills/` and registers the plugin
marketplace); on Cursor, Codex, Gemini, or another tool, point that tool's skills or rules directory
at this folder (`config/claude/skills/obsidian-loop/`). The selector is plain Node (`.mjs`),
so it runs the same everywhere (and under Bun once installed).

## Safety rails

- Work starts only after the claim commit pushes successfully, so two devices never work the same
  ticket. If a push is rejected, the skill rebases, rechecks ownership, and yields the ticket if
  another device won the race.
- It never runs `git stash`, never `rm` (uses `trash` or `git rm`), and never edits
  `orchestrator/control.md` (your kill switch).
- Follow up work it discovers is filed into **Backlog** only; you triage Backlog into Ready.

## Related

- [[knowledge/kanban-usage|Kanban usage]] — the full agent contract this skill automates.
- [[orchestrator/design|Design spec]] — claim protocol and execution lanes.
- Build history: [[2026-07-02-obsidian-loop-design]], [[2026-07-02-obsidian-loop-plan]].
