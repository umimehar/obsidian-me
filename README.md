---
title: Vault README
tags: [meta/system]
created: 2026-04-15
updated: 2026-07-13
status: active
type: permanent
---

# Obsidian — Personal Vault (me)

Personal life-management vault and second brain. Organized personal-first: everyday endeavors (taxes, applications, certifications, admin, life areas) live under `personal/`, and personal code projects live under `projects/`. Uses the same system as the `dev` vault with its own standalone Claude Code config.

## New Machine Setup

### 1. Clone the repo

```bash
mkdir -p ~/obsidian
git clone git@github.com:umimehar/obsidian-me.git ~/obsidian/obsidian-me
```

The clone directory must be named `obsidian-me` (hooks and skills resolve the vault at `~/obsidian/obsidian-me`).

### 2. Open in Obsidian

Open Obsidian > "Open folder as vault" > select `~/obsidian/obsidian-me`

### 3. Enable community plugins

Settings > Community Plugins > turn off Restricted Mode, then install:

- **Obsidian Git** — auto-commit and sync every 5 minutes
- **Local REST API** — enables Claude Code MCP connection. Copy this vault's API key from Settings > Local REST API (it is **different** from the `dev` vault's key).
- Templater, Calendar, Dataview — recommended. Kanban — optional, only for the orchestrator board UI.

### 4. Install the git hooks (masking guard)

```bash
cd ~/obsidian/obsidian-me
git config core.hooksPath config/git-hooks
```

This enables `config/git-hooks/pre-commit`, which blocks commits containing unmasked sensitive data (SIN, passport, card, account numbers).

### 5. Set up Claude Code MCP + config

This vault ships its own config at `config/claude/`:

```bash
cd ~/obsidian/obsidian-me/config/claude
cp .env.example .env && $EDITOR .env   # fill OBSIDIAN_API_KEY with THIS vault's Local REST API key
```

MCP servers are defined in `config/claude/mcp/mcp.json` (obsidian, reddit, context7, sequential-thinking). The obsidian MCP connects to whichever vault has the Local REST API plugin active, so open this vault in Obsidian when working here.

### 6. Verify

1. Restart Claude Code
2. Run `/obsidian-resume` — should pull and show recent context
3. Run `/obsidian-save` — should commit and push

## Vault Structure

```
obsidian-me/
  CLAUDE.md              Claude's orientation document
  hot.md                 Active endeavors and recent session context
  personal/              One folder per non-coding endeavor (primary content)
    _assets/personal.css Shared stylesheet for all personal HTML pages
    [endeavor]/README.md · log/ · notes/ · tracking.md
  projects/              Personal code projects
    _template/           Copy this to create a new project
  orchestrator/          Kanban orchestrator (design.md, board.md, control.md, dashboard.md, devices/, tickets/)
  knowledge/             Cross-endeavor patterns, tools, snippets, lessons
  standup/               Daily cross-endeavor summaries
  retros/                Retros and learnings
  templates/             Note templates
  config/claude/         This vault's standalone Claude Code config (MCP + skills)
  config/git-hooks/      Pre-commit masking guard
```

## Session Workflow

```
/obsidian-resume    Pull from GitHub, load context, summarize where you left off
/obsidian-save      Save log + hot cache, commit, push to GitHub
```

## Creating a New Endeavor

- **Personal:** `personal/<name>/README.md` (`type: personal`, `personal: <name>`, `#personal/<name>`) + an empty `log/`. Or tell Claude: `"Create a personal endeavor for my 2026 tax return"`.
- **Project:** `cp -r projects/_template projects/my-app`, then fill in `README.md`.

## Conventions

- `[[wikilinks]]` for internal links · YAML frontmatter on every note · kebab-case filenames
- Never commit unmasked sensitive data — mask values with `****`
- One endeavor folder = one self-contained endeavor

## GitHub Repo

`git@github.com:umimehar/obsidian-me.git` (private)
