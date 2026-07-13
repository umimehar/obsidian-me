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

- **2026-07-13** — Vault initialized from the `dev` system: personal-first structure (`personal/`, `projects/`, `orchestrator/`, `knowledge/`), standalone `config/claude/`, and a pre-commit masking guard. See `standup/2026-07-13.md`.

## Pending

- Install the git masking hook on this device: `git config core.hooksPath config/git-hooks`
- Fill `config/claude/.env` with this vault's Local REST API key
