---
title: Hot — Active Context
tags: [meta/system]
created: 2026-07-13
updated: 2026-08-10
status: active
type: reference
---

# Hot — Active Context

Scannable cache of active endeavors and recent session context. Read this first. Bulk detail lives in each endeavor's `log/`.

## Active endeavors

- **[[personal/investments/README|investments]]** — being rebuilt on the monthly **PDF** statements, replacing the CSV pipeline that could not produce market value at all. Phase 1 (ingest and reconciliation) is complete in `app/`: 220 statements, 14 accounts, 8,653 activity rows, 3,770 holdings, zero unacknowledged reconciliation errors, 215 tests. Account value reconciles to $241,739.67 against the $242,019.61 the app showed on 2026-06-30, the $279.94 gap being one private-markets holding whose statement says its valuation is not final. Next: phase 2, the React app. See `personal/investments/log/2026-08-06.md`.

- **[[personal/govt-tenders/README|govt-tenders]]** — bidding on Canadian public sector website work. Market scanned 2026-08-10: the CanadaBuys search for "website" returns 242 open notices of which **10 are about a website**, all municipal, academic or provincial, none federal. Ottawa runs 893 open notices with three touching the web and routes the rest through the TBIPS and SBIPS supply arrangements (qualification open until 2028-07-04). The `tender-digest` skill now emails a title-filtered digest Mon/Wed/Fri at 08:12. Next: register on BC Bid, APC, MERX, bids&tenders and Biddingo, then clear the qualification gates in `personal/govt-tenders/tracking.md`. See `personal/govt-tenders/log/2026-08-10.md`.

## Recent sessions

- **2026-08-10** — Government tender endeavor created and the digest shipped. The headline finding is that the obvious channel does not work: CanadaBuys full text search scores 4% precision on "website", and matching on the **title** instead scores 100% on the same sample. Also learned that CanadaBuys 403s a burst of requests but passes paced ones, that going direct to the provinces is a dead end (Alberta's opportunity API 500s on every filter shape, BC Bid publishes no dataset) because CanadaBuys already mirrors them, and that you can never submit a non federal bid through CanadaBuys — every notice links out to its source portal.

- **2026-08-06** — Investments phase 1 delivered across 66 commits. The PDF statements turn out to be a strict superset of the CSVs: market value, book cost, the month-end FX rate, the RRSP first-60-days split, and Wealthsimple's own money-weighted returns. Hard-won findings now in the spec — USD book cost can never reconcile exactly (the disclosed rate is scoped to market value, so 19 statements warn by design); the account-type descriptor has been renamed twice and paid-in labels once, so classify by structure, never by wording or filename; and the corporate account needs an owner-supplied override because a corporate statement prints "Non-Registered Cash Account" like any other.
- **2026-08-04** — Config consolidated: this vault carries no `config/` folder. Claude Code config, skills, MCP definitions, and git hooks live only in `~/obsidian/obsidian-dev/config/`. Docs here that claimed a standalone config or a pre-commit masking guard were describing something that never existed on disk.
- **2026-07-13** — Vault initialized from the `dev` system: personal-first structure (`personal/`, `projects/`, `orchestrator/`, `knowledge/`). See `standup/2026-07-13.md`.

## Pending

- Fill `~/obsidian/obsidian-dev/config/claude/.env` with this vault's Local REST API key
- **Build the masking guard for real.** The investments rebuild settled this question with evidence: thirteen identifier leaks reached staged or committed files across 66 commits, every one caused by a real value used as an illustration rather than by carelessness about the policy. Manual review caught almost none of them. What worked was a script matching identifier **classes** (vendor account codes, bare digit runs of seven or more, postal codes, the SIN and card shapes, and every token of every configured name) reading its name list from the gitignored config so the guard itself holds no secret. A working version is at `personal/investments/app` history and in the phase 1 ledger. Two traps to carry into it: `git grep` silently ignores `\b` and so always reports clean, and a check must be proven against known present content before its zero means anything.
- Decide the JS/TS complexity standard. `CLAUDE.md` states cyclomatic complexity at most 8, which Biome cannot measure (it scores cognitive complexity) and which has never been enforced anywhere. The investments app now enforces Biome's default of 15 with no offenders; at 8 roughly eighteen functions would fail. Either ratchet and pay the debt down, or reword the clause to name the metric the toolchain actually applies. The stated 100 line limit has never been violated, the longest function being 75 lines.
