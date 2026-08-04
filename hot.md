---
title: Hot — Active Context
tags: [meta/system]
created: 2026-07-13
updated: 2026-07-13
status: active
type: reference
---

# Hot — Active Context

Scannable cache of active endeavors and recent session context. Read this first. Bulk detail lives in each endeavor's `log/`.

## Active endeavors

- **[[personal/investments/README|investments]]** — Wealthsimple statement pipeline (parse, classify, mask, datastore, analytics, render) built and run against real statements: 8050 transactions across 18 accounts, six HTML pages in `notes/`. See `personal/investments/log/2026-07-13.md`.

## Recent sessions

- **2026-08-04** — Config consolidated: this vault carries no `config/` folder. Claude Code config, skills, MCP definitions, and git hooks live only in `~/obsidian/obsidian-dev/config/`. Docs here that claimed a standalone config or a pre-commit masking guard were describing something that never existed on disk.
- **2026-07-13** — Vault initialized from the `dev` system: personal-first structure (`personal/`, `projects/`, `orchestrator/`, `knowledge/`). See `standup/2026-07-13.md`.

## Pending

- Fill `~/obsidian/obsidian-dev/config/claude/.env` with this vault's Local REST API key
- Decide whether the sensitive-data masking guard gets built for real (as a hook in the `dev` vault) or the policy stays manual-only
