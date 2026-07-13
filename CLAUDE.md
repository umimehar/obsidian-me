# Personal Vault — Instructions for Claude Code

## What is this vault

Personal life-management vault and second brain. Tracks personal endeavors (taxes, applications, certifications, admin, life areas) and personal code projects. Persistent memory across Claude Code sessions. Uses the same system as the `dev` vault, but personal-first: `personal/` is the primary content, `projects/` holds personal code.

> **Sensitive info policy.** Never commit unmasked sensitive data (SIN, passport, national ID, bank/account numbers, card numbers, government file numbers). Replace the value with `****` in the note, keeping the label (`SIN: ****`). A pre-commit guard in `config/git-hooks/pre-commit` blocks commits that contain unmasked patterns — do not bypass it to commit real secrets.

## Folder Structure

- `personal/` — One folder per non-coding endeavor, any size or lifespan (one-off admin through ongoing life areas). Taxes, job/visa/school applications, certifications, fitness, finances. Never orchestrator-tracked.
  - `[endeavor]/README.md` — thin index (mandatory)
  - `[endeavor]/log/` — daily log, same convention as projects (mandatory)
  - `[endeavor]/tracking.md` — optional longitudinal metrics/habits/deadlines
  - `[endeavor]/notes/` — optional freeform notes (replaces bugs/features/spikes)
  - `[endeavor]/wiki/entities/` · `wiki/sources/` — optional
  - `personal/_assets/` — **shared** assets for ALL personal HTML pages (one stylesheet, `personal.css`). Endeavors never get their own `assets/` folder; HTML in `personal/<name>/notes/` links `../../_assets/personal.css`.
  - To create one: add `personal/<name>/README.md` (`type: personal`, `personal: <name>`, `#personal/<name>` — see Frontmatter Standard) plus an empty `log/`. No template folder — the scaffold is just those two.
- `projects/` — One folder per personal code project (self-contained). Use only for things you build.
  - `[project]/README.md` — overview, tech stack, status, links
  - `[project]/architecture.md` · `decisions.md` · `log/` · `bugs/` · `features/` · `spikes/` · `wiki/entities/` · `wiki/sources/`
  - `projects/_template/` — scaffold for a new project (copy to create one)
- `orchestrator/` — Kanban orchestration system (see `orchestrator/design.md`)
  - `board.md` — central kanban; `control.md` — loop kill switch + budgets; `dashboard.md` — Dataview monitor
  - `devices/` — one file per device in the fleet; `tickets/` — central ticket notes
- `knowledge/` — Cross-endeavor knowledge
  - `patterns.md` — reusable patterns · `tools.md` — tools/CLIs/configs · `snippets.md` — reusable snippets · `lessons.md` — corrections and quirks
- `standup/` — Daily cross-endeavor summary notes
- `retros/` — Retros and learnings
- `templates/` — Note templates
- `config/claude/` — This vault's own standalone Claude Code config (MCP servers + session skills). Not symlinked from `dev`.

## Conventions

### Note Format

- Use `[[wikilinks]]` for internal links
- Mandatory YAML frontmatter on every note
- Filenames in kebab-case: `2026-tax-return-federal.md`
- Descriptive filenames
- Tag format: `#personal/[name]`, `#project/[name]`, `#bug`, `#feature`, `#decision`, `#spike`, `#entity/person`, `#source`

### Prose line breaks — no hard wrapping (overrides global 100-char rule)

Never hard-wrap prose at a fixed column in vault markdown. Write **one line per paragraph** and let the editor soft-wrap. The global `~/.claude/CLAUDE.md` "100-char line length" rule is a **code** rule and does not apply to `.md` prose here — applying it produces mid-sentence line breaks that render identically in Obsidian reading mode but reflow badly in git backup diffs. Only insert a newline to end a paragraph or list item. This does not change lists, tables, code fences, or frontmatter.

### Frontmatter Standard

```yaml
---
title: Note Title
tags: [personal/taxes, log]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft | active | resolved | archived
type: log | bug | feature | decision | spike | standup | retro | entity | source | permanent | reference | ticket | device | project | personal
personal: endeavor-name
---
```

For a **personal** endeavor use `type: personal` on its README, the key `personal: <name>` instead of `project:`, and the tag `#personal/<name>` instead of `#project/<name>`. Daily logs inside a personal endeavor stay `type: log` with `personal: <name>`. The existing `status:` field carries the one-off-vs-ongoing distinction (a filed application ends `resolved`; fitness stays `active`), so no second type is needed. Use `project:` (not `personal:`) for `projects/` notes.

**Quoting rules.** If a `title:` (or any YAML scalar) contains `:`, `@`, `[`, `]`, `#`, `*`, `&`, `>`, `|`, `'`, `"`, leading whitespace, or starts with `-`, **always double-quote it** — unquoted, Obsidian fails to parse the file. **Phone numbers and anything starting with `+`, `-`, or a digit followed by `:` must also be quoted** (`+1 514 393 7848` parses as a malformed scalar, `9:30` as a sexagesimal number).

```yaml
# WRONG — Obsidian fails to parse
title: got this error 17:07:52 -
phone_mobile: +1 438 989 4719
start_time: 9:30
# RIGHT — quote any scalar with :, +, a leading -, or a digit followed by :
title: "got this error 17:07:52 -"
phone_mobile: "+1 438 989 4719"
start_time: "9:30"
```

### Note format — HTML-first (owner preference)

Prefer **styled `.html`** for substantive content over plain markdown. Pattern:

- Each note's real content is a self-contained `.html` page (brand tokens, sections, tables, light/dark toggle). Personal endeavors share one stylesheet at `personal/_assets/personal.css` referenced with `../../_assets/personal.css`; code projects share one at `projects/<project>/assets/*.css`.
- Keep a **thin `README.md` index per folder** (frontmatter + `[[wikilinks]]`/relative links to the HTML pages) so the Obsidian graph, search, and Dataview still resolve. The frontmatter/quoting rules above apply to those `.md` index files.
- `hot.md`, `standup/`, and `knowledge/` may stay markdown (they're read inline by skills).

## Reading Strategy

When you need context for a specific endeavor:

1. Read `hot.md` first (active endeavors and recent work)
2. Read `personal/<name>/README.md` (or `projects/<name>/README.md`)
3. Read the latest entry in its `log/`
4. Only then drill into specific notes, decisions, bugs, or features

A **personal** endeavor is never a project: no orchestrator, no board, no `/obsidian-loop`.

Do NOT read the entire vault. Scope to the active endeavor.

## Session Commands

### /obsidian-resume

1. Read `hot.md` for active endeavors
2. Read the latest log entry for the active endeavor
3. Summarize current state and what needs to happen next

### /obsidian-save

1. Create or update today's log in `personal/[endeavor]/log/YYYY-MM-DD.md` (or `projects/[project]/log/YYYY-MM-DD.md`)
2. Update `hot.md` with current session summary
3. If cross-endeavor work, also update `standup/YYYY-MM-DD.md`

## Creating a New Endeavor

- **Personal:** add `personal/<name>/README.md` (`type: personal`, `personal: <name>`, `#personal/<name>`) plus an empty `log/`.
- **Project:** copy `projects/_template/` to `projects/<name>/`, fill in `README.md`, start logging in `log/YYYY-MM-DD.md`.

## Long-term memory system

The vault is the canonical long-term memory. The built-in Claude Code memory dir is a **rebuildable pointer cache** into these notes, never the source of truth.

- **Lessons** go in `knowledge/lessons.md`, one rule per `### <slug> (YYYY-MM-DD)` heading. The slug is the `(subject, relation)` key.
- **Supersession, not append:** a rule that contradicts an existing one on the same subject updates it in place or tombstones it (`> ⊘ Superseded YYYY-MM-DD by [[#<slug>]]`) — never two live conflicting rules.
- Keep `hot.md` a scannable index (bulk detail lives in each endeavor's `log/`).

## Kanban Orchestrator

Work that needs agent execution is tracked as ticket notes (`TCK-XXXX-<slug>.md`, `type: ticket`) on the central board (`orchestrator/board.md`). The contract in `knowledge/kanban-usage.md` is mandatory for agents.

- `personal/` endeavors are journal-only: they never carry `board.md` or `tickets/`, and no orchestrator file references them. A personal task needing agent execution becomes a normal central-board ticket that references the endeavor.
- Allocate ticket ids from `orchestrator/next-id.md` and bump the counter in the same commit.
- Orchestrator files stay markdown (machine read); the HTML-first preference does not apply to them.
- The Obsidian Kanban plugin renders `board.md` as a UI. The scaffold works as plain markdown without it — install the plugin only if you want the board view.

## Rules

- Never delete an endeavor or project folder without asking
- Never overwrite existing notes without confirmation
- Never commit unmasked sensitive data — mask with `****` (see Sensitive info policy above)
- Keep logs chronological (one file per day per endeavor)
- Cross-endeavor patterns go in `knowledge/`, not in a specific endeavor
