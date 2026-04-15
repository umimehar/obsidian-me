> **To install on a new machine:** Copy this file to `~/.claude/skills/obsidian-save/SKILL.md`

---
name: save
description: Save session context to Obsidian vault, commit, and push to GitHub.
---

# Save Session to Obsidian Vault

Persist the current session's context to the Obsidian vault, then commit and push to GitHub.

## Process

### 1. Detect Active Vault

Use `mcp__obsidian__obsidian_list_files_in_vault` to list root files. Detect vault type:
- If `wiki/` exists → **me** vault (path: `~/obsidian/me`)
- If `knowledge/` exists → **dev** vault (path: `~/obsidian/dev`)

### 2. Create or Update Today's Note

**For me vault:**
Use `mcp__obsidian__obsidian_append_content` to create or update `daily-notes/YYYY-MM-DD.md` (today's date).

Format:
```markdown
---
title: Daily Note — YYYY-MM-DD
tags: [daily]
created: YYYY-MM-DD
status: active
type: daily
---

# YYYY-MM-DD

## Today's Focus
[What the user was working on]

## Session Log
- [Key activities with [[wikilinks]] where relevant]
- [Decisions made]
- [Problems solved]

## Notes
[Any additional context worth preserving]

## Open Loops
- [ ] [Unresolved items, pending tasks]
```

If the file already exists, append a new session log section with a timestamp header instead of overwriting.

**For dev vault:**
Create or update the active project's log at `projects/[project]/log/YYYY-MM-DD.md`. If working across multiple projects, update each project's log. Also update `standup/YYYY-MM-DD.md` with a cross-project summary if applicable.

### 3. Update Hot Cache

**For me vault:**
Overwrite `wiki/hot.md` with:
- **Date** of this session
- **Activity** summary (1-2 sentences)
- **Decisions** made during this session
- **Pending** items and open loops
- **Recently Modified Notes** with [[wikilinks]]

**For dev vault:**
Overwrite `hot.md` with:
- **Active Projects** and their current status
- **Last Session** details
- **Blocked / Waiting** items
- **This Week's Focus**

### 4. Git Commit & Push

Run these commands using the Bash tool:

```bash
git -C ~/obsidian/[vault] add -A
git -C ~/obsidian/[vault] commit -m "session: YYYY-MM-DD — [brief summary of what was done]" || true
git -C ~/obsidian/[vault] push || (git -C ~/obsidian/[vault] pull --rebase && git -C ~/obsidian/[vault] push)
```

**Edge cases:**
- If there are no changes to commit, `|| true` prevents failure on empty commit
- If push fails because remote has newer changes, pull with rebase first, then push again
- If push still fails (network issues), warn the user: "Changes saved locally but push failed. Run `git -C ~/obsidian/[vault] push` when network is available."

### 5. Confirm to User

Tell the user:
- What was saved (daily note / project log + hot cache)
- Git commit hash and push status
- Remind them to use `/resume` next session to pick up where they left off
