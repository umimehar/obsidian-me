---
title: "TCK-0007 — Dashboard v2: income, withholding tax and costs"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-27
type: ticket
id: TCK-0007
status: in-progress
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

# TCK-0007 — Dashboard v2: income, withholding tax and costs

## Goal

Show what the portfolio pays and what it costs: dividends, interest, securities lending, foreign withholding tax by account, fees and FX conversions.

## Acceptance criteria

- [ ] Income by month and year from DIV, INT, FPLINT rows, per account and total
- [ ] Foreign withholding tax (NRT) per account per year, with a note on which account types can recover it
- [ ] Fees (FEE) and FX conversion counts and amounts per year
- [ ] All figures from the datastore through analytics.json; tests over fixtures and the real corpus; bun run check clean
- [ ] Income and costs plus the investment income tax view live on a new Income tab (id `income`); `#tax` resolves to it

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog
- 2026-09-27 01:30 — Owner asked for more meaningful tabs; final set is This month, Portfolio, Holdings, Growth, Income, Contributions, Future, Data. Acceptance criterion added for this ticket's tab; plan updated.
- 2026-09-27 06:00 — Implementation delegated to a Sonnet subagent.
- 2026-09-27 06:15 — Four commits d0c0594 to 47857a9: income and costs model on the shared activity totals, monthly dividends chart, year and withholding tables, Income tab with TaxView moved off Portfolio and #tax mapped. 2025: dividends $3,017.06, withholding $298.82, fees $29.65; 2026: dividends $1,657.22, withholding $97.87, fees $212.55. `bun run check`: 1528 pass, 0 fail; contrast AA pass.
- 2026-09-27 06:16 — Agent review dispatched at Opus, asked to explain zero interest and the 2026 fee jump from the raw rows.
