---
title: "TCK-0006 — Dashboard v2: registered contributions planner and tax fix"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-26
type: ticket
id: TCK-0006
status: claimed
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p0
effort: medium
depends_on: [TCK-0003]
created_by: umar
session: null
---

# TCK-0006 — Dashboard v2: registered contributions planner and tax fix

## Goal

Turn the Registered wrappers view into a Registered contributions planner with room, deadlines and next actions, and fix the Tax view's misleading taxable income.

## Acceptance criteria

- [ ] Section renamed Registered contributions; per wrapper: contributed this year, room left, deadline (RRSP first 60 days of next year, FHSA and TFSA Dec 31), and a next action line
- [ ] RESP shows grant math: contributions needed for the maximum CESG this year and the carry forward
- [ ] Multi year history of contributions per wrapper as a compact table
- [ ] Tax view no longer presents investment income minus the RRSP deduction as taxable income; it shows investment income by type and the RRSP deduction as separate facts
- [ ] Tests; bun run check clean
- [ ] Registered contributions, `ContributionsChart` and `CashflowChart` live on a new Contributions tab (id `contributions`); `#wrappers` resolves to it; the interim Plan tab is removed once Future and Contributions both exist
- [ ] Investment income for tax is correct: USD sale proceeds converted, same month buy and sell costed, foreign versus Canadian dividends classified, USD dividends converted, lending interest and foreign tax withheld shown, reversals netted, latest year labelled on All time (plan Task 6.0)

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog
- 2026-09-27 01:30 — Owner asked for more meaningful tabs; final set is This month, Portfolio, Holdings, Growth, Income, Contributions, Future, Data. Acceptance criterion added for this ticket's tab; plan updated.
- 2026-09-27 01:45 — Owner asked that personal taxable income be correct and follow the year filter. Audit: the filter already works (2026, 2025, 2024 each render); the figures do not. 2026 realized shows −$4,243.49 and is +$1,740.80 once USD proceeds are converted, before costing 30 same month sales counted as $0; $165.82 of US source dividends labelled Canadian eligible; USD dividends unconverted; lending interest and withholding missing. Plan Task 6.0 added; priority raised to p0 so this runs next.
