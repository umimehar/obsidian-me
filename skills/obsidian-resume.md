> **To install on a new machine:** Copy this file to `~/.claude/skills/obsidian-resume/SKILL.md`

---
name: resume
description: Resume a session by pulling latest changes and loading recent context from Obsidian vault.
---

# Resume Session from Obsidian Vault

Pull latest changes from GitHub, then load recent context to resume where the last session left off.

## Process

### 1. Detect Active Vault

Use `mcp__obsidian__obsidian_list_files_in_vault` to list root files. Detect vault type:
- If `wiki/` exists → **me** vault (path: `~/obsidian/me`)
- If `knowledge/` exists → **dev** vault (path: `~/obsidian/dev`)

### 2. Git Pull

Run `git -C ~/obsidian/[vault] pull --rebase` to fetch latest changes from GitHub.

- If pull succeeds, continue normally
- If pull fails due to merge conflict, warn the user: "There are merge conflicts in your vault. Resolve them in Obsidian or terminal before continuing." Then continue reading what's available — don't block the session.
- If pull fails due to network issues, warn the user and continue with local state

### 3. Read Hot Cache

Use `mcp__obsidian__obsidian_get_file_contents` to read the hot cache:
- **me** vault: `wiki/hot.md`
- **dev** vault: `hot.md`

This contains the most recent session context including what was worked on, decisions made, and pending items.

### 4. Find and Read Latest Daily Note / Log

**For me vault:**
Use `mcp__obsidian__obsidian_list_files_in_dir` to list files in `daily-notes/`. Find the most recent daily note (files are named `YYYY-MM-DD.md`). Read its contents.

**For dev vault:**
Read `hot.md` for active project info. Then list files in `projects/[active-project]/log/` and read the most recent log entry.

### 5. Summarize Context

Present a concise summary to the user covering:
- **Git sync status:** Whether pull was successful and if there were new changes
- **Last session:** What was worked on and when
- **Decisions made:** Key choices from recent sessions
- **Open loops:** Pending items, unresolved questions, blocked tasks
- **Active focus:** What the user was working toward

Keep the summary brief and actionable. Don't dump raw note contents — synthesize.
