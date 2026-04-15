# Vault — Instructions for Claude Code

## What is this vault

Centralized knowledge base and second brain. Persistent memory across Claude Code sessions. All notes follow Obsidian conventions.

## Folder Structure

- `inbox/` — Raw dumps, brain dumps, research findings (unprocessed)
- `wiki/` — Synthesized, cross-linked knowledge pages (the compounding layer)
  - `wiki/concepts/` — Core ideas, patterns, mental models
  - `wiki/entities/` — People, tools, services, organizations
  - `wiki/sources/` — Processed source material with citations
- `projects/` — Active project context, decisions, architecture notes
- `daily-notes/` — Chronological activity log (YYYY-MM-DD format)
- `references/` — Evergreen reference material
- `templates/` — Note templates (do not modify without asking)

## Conventions

### Note Format
- Use `[[wikilinks]]` for internal links (never markdown links)
- Mandatory YAML frontmatter on every note
- Filenames in kebab-case: `auth-flow-design.md`
- Descriptive filenames — name notes like sentences, not `untitled-48.md`
- One concept per permanent note (atomicity)
- Minimum 2 wikilinks per note (dense linking)
- Tag format: `#category/subcategory`

### Frontmatter Standard
```yaml
---
title: Note Title
tags: [topic, subtopic]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft | active | archived
type: permanent | fleeting | daily | project
---
```

## Layered Reading Strategy

When you need context from this vault:

1. Read `wiki/hot.md` first (recent context cache)
2. If not enough, read `wiki/index.md` (master index)
3. Drill into relevant domain sub-indexes or folders
4. Only then read specific wiki pages

Do NOT read the entire vault. Scope your reads.

## Session Commands

### /resume
When you receive this command:
1. Read `wiki/hot.md` for recent session context
2. Read the most recent file in `daily-notes/`
3. Summarize current state and pending items

### /save
When you receive this command:
1. Create or update today's daily note in `daily-notes/YYYY-MM-DD.md`
2. Record: what was done, decisions made, pending items
3. Add wikilinks to created/modified notes
4. Update `wiki/hot.md` with current session summary

## Compounding Knowledge Workflow

When given raw material (text, research, brain dumps):
1. Save raw content to `inbox/`
2. Extract 5-15 atomic concepts
3. Create or update wiki pages in `wiki/concepts/` or `wiki/entities/`
4. Cross-reference with existing pages
5. Update `wiki/index.md` with new entries
6. Update `wiki/hot.md` with session summary

## Rules

- Never delete notes without asking first
- Never create notes without frontmatter
- Never overwrite existing notes without confirmation
- Use `[[wikilinks]]` for all internal references
- Keep filenames descriptive and in kebab-case
- When synthesizing, anchor to existing vault content — don't hallucinate
- Update `wiki/hot.md` at the end of every session
