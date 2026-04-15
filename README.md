---
title: Vault README
tags: [meta/system]
created: 2026-04-15
updated: 2026-04-15
status: active
type: permanent
---

# Obsidian — Personal Vault (me)

Personal second brain and knowledge base. Uses the Karpathy LLM Wiki pattern for compounding knowledge across Claude Code sessions.

## New Machine Setup

### 1. Clone the repo

```bash
mkdir -p ~/obsidian
git clone git@github.com:umimehar/obsidian-me.git ~/obsidian/me
```

### 2. Open in Obsidian

Open Obsidian > "Open folder as vault" > select `~/obsidian/me`

### 3. Enable community plugins

Go to Settings > Community Plugins > Turn off Restricted Mode, then install:

- **Obsidian Git** — auto-commit and sync every 5 minutes
  - Settings: Auto backup interval: `5`, Auto pull interval: `5`, Pull on startup: `on`, Push on backup: `on`
- **Local REST API** — enables Claude Code MCP connection
  - Copy the API key from Settings > Local REST API after enabling

### 4. Set up Claude Code MCP

Add to `~/.mcp.json`:

```json
"obsidian": {
  "command": "uvx",
  "args": ["mcp-obsidian"],
  "env": {
    "OBSIDIAN_API_KEY": "<your-api-key-from-local-rest-api-plugin>"
  }
}
```

Add `"obsidian"` to `enabledMcpjsonServers` in `~/.claude/settings.json`.

### 5. Install Claude Code skills

```bash
mkdir -p ~/.claude/skills/obsidian-resume ~/.claude/skills/obsidian-save
cp ~/obsidian/me/skills/obsidian-resume.md ~/.claude/skills/obsidian-resume/SKILL.md
cp ~/obsidian/me/skills/obsidian-save.md ~/.claude/skills/obsidian-save/SKILL.md
```

Remove the `> **To install...** ` line from the top of each copied SKILL.md.

### 6. Verify

1. Restart Claude Code
2. Run `/resume` — should pull and show recent context
3. Run `/save` — should commit and push

## Vault Structure

```
me/
  CLAUDE.md              Claude's orientation document
  usage.md               Complete usage guide with all prompts
  inbox/                 Raw captures, brain dumps, research
  wiki/
    hot.md               Session context cache (read first)
    index.md             Master wiki index
    concepts/            Core ideas, patterns, mental models
    entities/            People, tools, services
    sources/             Processed articles, books, talks
  projects/              Active project context and decisions
  daily-notes/           One note per day (YYYY-MM-DD.md)
  references/            Evergreen cheat sheets and stable docs
  templates/             Note templates
  skills/                Claude Code skill references
```

## Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Claude reads this for vault conventions and rules |
| `usage.md` | Complete guide with every prompt you can use |
| `wiki/hot.md` | Recent session context — always read first |
| `wiki/index.md` | Master directory of all wiki pages |

## Session Workflow

```
/resume    Pull from GitHub, load context, summarize where you left off
/save      Save daily note + hot cache, commit, push to GitHub
```

## Sync Architecture

| Scenario | How it syncs |
|----------|-------------|
| Editing in Obsidian | Obsidian Git plugin auto-commits every 5 min |
| Claude Code session start | `/resume` runs `git pull --rebase` |
| Claude Code session end | `/save` runs `git commit + push` |
| Opening on another device | Obsidian Git pulls on startup |

## Conventions

- `[[wikilinks]]` for internal links (never markdown links)
- YAML frontmatter on every note
- Kebab-case filenames: `auth-flow-design.md`
- Tag format: `#category/subcategory`
- One concept per wiki page (atomic notes)
- Minimum 2 wikilinks per note

## Recommended Plugins

| Plugin | Purpose |
|--------|---------|
| Obsidian Git | Auto-commit + push every 5 min |
| Local REST API | MCP connection for Claude Code |
| Templater | Auto-fill templates with dates and titles |
| Calendar | Navigate daily notes visually |
| Dataview | Query notes with SQL-like syntax |

## GitHub Repo

`git@github.com:umimehar/obsidian-me.git` (private)
