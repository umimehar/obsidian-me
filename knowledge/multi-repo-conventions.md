---
title: Multi-repo Project Conventions
tags: [knowledge, conventions]
created: 2026-07-04
updated: 2026-07-04
status: active
type: permanent
---

# Multi-repo Project Conventions

Reusable conventions for any multi-repo project in this vault (delo, alrai, xyzbytes, kronos). Originated from setting up `projects/delo/`. Referenced from the root `CLAUDE.md`. Truly project-specific rules belong in that project's own note, not here.

## Features as folders, not files

Each feature lives at `projects/<project>/features/<feature-name>/` with:

- `index.md` as the entry note (with `aliases: [<feature-name>]` in frontmatter so `[[<feature-name>]]` wikilinks resolve)
- Colocated reference docs (e.g. PRDs, solution docs, dashboards) sitting next to `index.md`
- The `index.md` links to siblings via `[[doc-name]]` wikilinks

Example: `features/auth0-migration/{index.md, auth0-implemented.md, auth0-dashboard-setup-guide.md}`.

## Repos folder for multi-repo projects

For projects spanning multiple repos, add `projects/<project>/repos/` with two files per repo:

- `<repo>.md` — summary note (purpose, stack, entry points, run/test commands, CI, env files, notable conventions, repo URL)
- `<repo>-codebase-index.md` — full codebase index (sections: Quick Reference, Directory Map, API Endpoints, Domain Models, DB, Architecture, External Services, Errors, Conventions, Common Tasks)

Mirror the same index format across all repos in the project.

## Daily logs — include full session UUIDs + agent/CLI/provider

When mining agent session JSONLs into per-day logs (one file per active date in `log/YYYY-MM-DD.md`), include the **full** session UUID (not a short prefix) so the user can resume it directly. Source files for Claude Code sessions live under this device's `~/.claude/projects/<cwd-slug>/` (the repo's cwd path with `/` replaced by `-`, keeping the leading dash); Cursor CLI sessions live under the equivalent `~/.cursor/projects/<cwd-slug>/agent-transcripts/`. Do NOT hard-code a username — the home path differs per device.

Alongside the UUID, always record **which agent, CLI, and provider** the session ran under. That context tells the reader which binary to invoke to resume, and which model/provider produced the work.

Field definitions:

- `agent` — the model/family (e.g. `claude-opus-4.7`, `claude-sonnet-4.5`, `gpt-5`, `composer-2-fast`).
- `cli` — the host CLI (e.g. `claude-code`, `cursor-cli`, `codex-cli`).
- `provider` — the inference provider (e.g. `anthropic`, `openai`, `cursor`).
- `resume` — the exact command to resume the session (e.g. `claude --resume <uuid>` for Claude Code, `cursor-agent --resume=<uuid>` for Cursor CLI).

Format per entry:

```markdown
- **HH:MM** `[<repo-tag>]` <truncated first user message>
  - session: `<full-uuid>`
  - agent: `<model>` · cli: `<cli>` · provider: `<provider>`
  - resume: `<resume-command>`
```

Normalize the snippet (collapse whitespace, replace backticks with `'` and pipes with `/`) so list items render cleanly.

If you can't determine agent/cli/provider from the source JSONL, infer from the transcript path: `~/.claude/...` → `claude-code` + `anthropic`; `~/.cursor/projects/.../agent-transcripts/...` → `cursor-cli` + `cursor` (or the underlying provider if explicit in the transcript). Record the model from the transcript's `model` field when present.

## Filter sessions to project-relevant work

When mining sessions, keep ONLY entries that match a product-term include regex (repo names, feature names, ERP/auth/build keywords) AND fail an exclude regex (vault/obsidian/MCP/skill/IDE setup, "read and understand", "create an index", base directory references). Vault-setup sessions are not product work.

## Don't keep generation scripts in the project

User preference: do **not** keep auto-generation scripts (e.g. session miners) in `projects/<project>/_scripts/`. If bulk extraction is needed, run a one-off Python invocation via Bash and write each file directly. Persistent scripts in the project produce stale or "corrupted" content over time.

## Project wiki (entities and sources)

Every project gets a `wiki/` folder with two subdirs:

- `wiki/entities/` — one file per person (stakeholders, teammates, customers, vendors, authors). Scaffold: `templates/entity.md`. Frontmatter includes `type: entity`, `entity_kind: person`, optional `role`, `org`, `email`, `handle`. Add `aliases:` so `[[Full Name]]` wikilinks resolve.
- `wiki/sources/` — one file per article, book, talk, paper, podcast, or video that informs the project. Scaffold: `templates/source.md`. Frontmatter includes `type: source`, `source_kind`, `author`, `url`, `published`, `venue`, `rating`.

Link entities and sources from logs, decisions, features, and spikes when they drove the work. Each folder has a `README.md` index with a Dataview table.

**Backlink rule for entities:** whenever you drop `[[Entity Name]]` into a log, decision, feature, spike, or bug, also append a one-line entry under the entity's `## Interactions` section in `wiki/entities/<slug>.md`. Format:

```markdown
- YYYY-MM-DD — [[YYYY-MM-DD]]: <one line on what was discussed/decided>
```

The wikilink points at the log (or decision/feature) file so the entity note becomes a chronological index of everything that involved that person. Same rule for sources: when a decision/feature cites `[[source-slug]]`, add a line under that source's `## Applied To` section pointing back at the citing doc.

**Renaming entities without breaking backlinks:** when you learn an entity's real full name (e.g. from a profile screenshot) and need to rename the file, (1) rename the file to the kebab-case full name, (2) update `title:` to the new name, (3) **keep every old name as an `aliases:` entry** so existing `[[OldName]]` wikilinks still resolve, (4) do a vault-wide find-and-replace from the old wikilink to the new one so the graph is clean. Never just rename without preserving aliases — backlinks in logs/decisions break silently.

**Role tags for entities:** entities use tags with a `role/` prefix (e.g. `role/infra`, `role/backend`, `role/pm`) instead of a `role:` frontmatter field. This gives chip UI, cross-note autocomplete, and graph grouping for free. The Dataview entity index builds the `roles` column by filtering `file.etags` for `#role/*`.

## Hand-written seeds vs auto-mined stubs

When regenerating mined content, never trash hand-written seed bugs/spikes. Move them to a temp dir, regenerate, then move them back. Hand-written entries are authoritative.
