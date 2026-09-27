---
title: "TCK-0008 — Dashboard v2: holdings across accounts and a benchmark"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-27
type: ticket
id: TCK-0008
status: done
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0003]
created_by: umar
session: 5d58b682-52ea-4755-b750-b787fdc2ed32
---

# TCK-0008 — Dashboard v2: holdings across accounts and a benchmark

## Goal

Show what the owner actually owns across all accounts, and compare the deposit netted return with a single fund benchmark.

## Acceptance criteria

- [x] Holdings combined by symbol across accounts at the latest period: value, share of portfolio, accounts holding it; S&P 500 exposure groups VFV and VOO
- [x] Currency split CAD versus USD priced holdings and asset class split
- [x] Benchmark: a command fetches XEQT.TO monthly closes into data/benchmark.json; Growth shows the portfolio's market value against the same deposits invested in XEQT, as two value lines (amended: the deposit netted return was not built)
- [x] Tests; bun run check clean
- [x] Holdings live on a new Holdings tab (id `holdings`) placed after Portfolio; the benchmark sits first on Growth

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog
- 2026-09-27 01:30 — Owner asked for more meaningful tabs; final set is This month, Portfolio, Holdings, Growth, Income, Contributions, Future, Data. Acceptance criterion added for this ticket's tab; plan updated.
- 2026-09-27 08:00 — Implemented by a Sonnet subagent: 8c8c737, f655baa, 7a29d15, faaabad.
- 2026-09-27 08:15 — Review round 1 FAIL: symbol L merged Loblaw and Loews into one row; no goldens (7 of 13 mutants survived); the benchmark result was only in the aria label; the disclosure hid its biases; stale holdings could enter from older periods. Also surfaced a pre existing gap, USD cash deposits never counted as deposits, filed as Backlog TCK-0009.
- 2026-09-27 09:30 — Fixes 0806a2e, 1175a0d, da09ecc, 6eabdb8. Round 2 PASS: every earlier mutant now killed even without regenerating analytics.json. Orchestrator added which way the USD deposit gap skews the benchmark.
- 2026-09-27 09:45 — Final at 2026-08: holdings $250,450.59 against the portfolio's $250,450.58; S&P 500 through VFV and VOO $51,902.02 (20.72%) across 6 accounts; CAD $157,819.12, USD $92,631.47; same deposits in XEQT $254,075.98, $3,625.40 ahead of the portfolio (a gap the closing price convention and the uncounted USD deposit both understate). `bun run check`: 1626 pass, 14 skip, 0 fail across 1640 tests; `vite build` clean; contrast AA pass, 10,250 runs across 8 tabs.
