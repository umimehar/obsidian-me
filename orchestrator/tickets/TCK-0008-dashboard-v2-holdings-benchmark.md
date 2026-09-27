---
title: "TCK-0008 — Dashboard v2: holdings across accounts and a benchmark"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-26
type: ticket
id: TCK-0008
status: ready
project: system
ticket_type: feature
assigned_device: any
claimed_by: null
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0003]
created_by: umar
session: null
---

# TCK-0008 — Dashboard v2: holdings across accounts and a benchmark

## Goal

Show what the owner actually owns across all accounts, and compare the deposit netted return with a single fund benchmark.

## Acceptance criteria

- [ ] Holdings combined by symbol across accounts at the latest period: value, share of portfolio, accounts holding it; S&P 500 exposure groups VFV and VOO
- [ ] Currency split CAD versus USD priced holdings and asset class split
- [ ] Benchmark: a command fetches XEQT.TO monthly closes into data/benchmark.json; Growth shows the portfolio's chained deposit netted return against the same deposits invested in XEQT
- [ ] Tests; bun run check clean

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog

