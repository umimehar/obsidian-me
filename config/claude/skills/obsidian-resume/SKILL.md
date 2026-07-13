---
name: obsidian-resume
description: (Obsidian) Resume a session by pulling latest changes and loading recent context from Obsidian vault.
---

# Resume Session from Obsidian Vault

Pull latest changes from GitHub, then load recent context to resume where the last session left off.

## Process

> **Tool-agnostic.** This skill works on any agent (Claude Code, Cursor, Codex, Gemini, or a local
> LLM). Read the vault with whatever file tools your agent has; the `mcp__obsidian__*` names below
> are the Claude Code Obsidian MCP tools and are optional accelerators — plain `ls`, file read, and
> `git` against `~/obsidian/<vault>` work everywhere.

### 1. Detect Active Vault

Resolve the vault from the current working directory's git root (or `ls ~/obsidian/*`). Branch on the vault folder name:

- `obsidian-me` → **personal** vault (path: `~/obsidian/obsidian-me`) — this skill's home.
- `obsidian-dev` → **dev** vault (path: `~/obsidian/obsidian-dev`) — defer to its own resume copy.

### 2. Git Pull

Run `git -C ~/obsidian/obsidian-me pull --rebase` to fetch latest changes.

- Pull succeeds → continue.
- Merge conflict → warn: "There are merge conflicts in your vault. Resolve them in Obsidian or terminal before continuing." Then continue reading what's available; don't block.
- Network failure → warn and continue with local state.

### 3. Read Hot Cache

Read root `hot.md` — the most recent session context: active endeavors, recent sessions, and pending items.

### 4. Read the Latest Log

From `hot.md`, identify the active endeavor. List its `log/` (`personal/[endeavor]/log/` or `projects/[project]/log/`) and read the most recent entry.

### 5. Summarize Context

Present a concise, actionable summary:

- **Git sync status** — whether pull succeeded and if there were new changes
- **Last session** — what was worked on and when
- **Decisions made** — key recent choices
- **Open loops** — pending items, unresolved questions
- **Active focus** — what the user was working toward

Synthesize; don't dump raw note contents.
