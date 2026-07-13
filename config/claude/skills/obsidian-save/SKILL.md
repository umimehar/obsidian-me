---
name: obsidian-save
description: (Obsidian) Save session context to Obsidian vault, commit, and push to GitHub.
---

# Save Session to Obsidian Vault

Persist the current session's context to the Obsidian vault, then commit and push to GitHub.

## Process

> **Tool-agnostic.** This skill works on any agent (Claude Code, Cursor, Codex, Gemini, or a local
> LLM). Read and write the vault with whatever file tools your agent has; the `mcp__obsidian__*`
> names below are the Claude Code Obsidian MCP tools and are optional accelerators — plain `ls`,
> file read/write, and `git` against `~/obsidian/<vault>` work everywhere.

### 1. Detect Active Vault

Resolve the vault from the current working directory's git root (or `ls ~/obsidian/*`). Branch on the vault folder name:

- `obsidian-me` → **personal** vault (path: `~/obsidian/obsidian-me`) — personal-first, this skill's home.
- `obsidian-dev` → **dev** vault (path: `~/obsidian/obsidian-dev`) — work/projects.

The rest of this skill covers the **personal** vault. For the dev vault, defer to its own `obsidian-save` copy (project-scoped logs + memory audit).

### 2. Create or Update Today's Log

Write to the active endeavor's log:

- Personal endeavor → `personal/[endeavor]/log/YYYY-MM-DD.md`
- Personal code project → `projects/[project]/log/YYYY-MM-DD.md`

If work spanned multiple endeavors, update each one's log, and add a cross-endeavor summary to `standup/YYYY-MM-DD.md`.

Log format (personal endeavor):

```markdown
---
title: "Log — <endeavor> — YYYY-MM-DD"
tags: [personal/<endeavor>, log]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: active
type: log
personal: <endeavor>
---

# YYYY-MM-DD — <endeavor>

## Done
- [Key activities with [[wikilinks]] where relevant]

## Decisions
- [Decisions made]

## Open loops
- [ ] [Unresolved items, pending tasks]
```

If the file already exists, append a timestamped section instead of overwriting.

> **Masking.** Never write raw sensitive values (SIN, passport, national ID, bank/account/card numbers). Record the label with the value masked: `SIN: ****`. The pre-commit guard (`config/git-hooks/pre-commit`) will block the commit otherwise.

### 3. Update Hot Cache

Overwrite root `hot.md`, keeping it a **scannable index** (one to three lines per endeavor with `[[wikilinks]]` out; bulk detail lives in each endeavor's `log/`):

- **Active endeavors** and their current status
- **Recent sessions** (date + one-line summary)
- **Pending** items and open loops

### 4. Git Commit & Push

```bash
git -C ~/obsidian/obsidian-me add -A
git -C ~/obsidian/obsidian-me commit -m "session: YYYY-MM-DD — [brief summary]" || true
git -C ~/obsidian/obsidian-me push || (git -C ~/obsidian/obsidian-me pull --rebase && git -C ~/obsidian/obsidian-me push)
```

**Edge cases:**

- No changes → `|| true` prevents failure on empty commit.
- If the commit is blocked by the masking hook, an unmasked secret is present — mask it and retry. Do not bypass the hook to commit real secrets.
- Push rejected because remote is ahead → pull with rebase, then push again.
- Push fails on network → warn: "Saved locally but push failed. Run `git -C ~/obsidian/obsidian-me push` when network is available."

### 5. Confirm to User

Tell the user what was saved (log + hot cache), the commit hash and push status, and remind them to use `/obsidian-resume` next session.
