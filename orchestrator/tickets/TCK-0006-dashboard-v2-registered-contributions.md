---
title: "TCK-0006 — Dashboard v2: registered contributions planner and tax fix"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-27
type: ticket
id: TCK-0006
status: review
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
session: 5d58b682-52ea-4755-b750-b787fdc2ed32
human_review_required: true
---

# TCK-0006 — Dashboard v2: registered contributions planner and tax fix

## Goal

Turn the Registered wrappers view into a Registered contributions planner with room, deadlines and next actions, and fix the Tax view's misleading taxable income.

## Acceptance criteria

- [x] Section renamed Registered contributions; per wrapper: contributed this year, room left, deadline (RRSP first 60 days of next year, FHSA and TFSA Dec 31), and a next action line
- [x] RESP shows grant math: contributions needed for the maximum CESG this year and the carry forward
- [x] Multi year history of contributions per wrapper as a compact table
- [x] Tax view no longer presents investment income minus the RRSP deduction as taxable income; it shows investment income by type and the RRSP deduction as separate facts
- [x] Tests; bun run check clean
- [x] Registered contributions, `ContributionsChart` and `CashflowChart` live on a new Contributions tab (id `contributions`); `#wrappers` resolves to it; the interim Plan tab is removed once Future and Contributions both exist
- [x] Investment income for tax is correct: USD sale proceeds converted, same month buy and sell costed, foreign versus Canadian dividends classified, USD dividends converted, lending interest and foreign tax withheld shown, reversals netted, latest year labelled on All time (plan Task 6.0)

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog
- 2026-09-27 01:30 — Owner asked for more meaningful tabs; final set is This month, Portfolio, Holdings, Growth, Income, Contributions, Future, Data. Acceptance criterion added for this ticket's tab; plan updated.
- 2026-09-27 01:45 — Owner asked that personal taxable income be correct and follow the year filter. Audit: the filter already works (2026, 2025, 2024 each render); the figures do not. 2026 realized shows −$4,243.49 and is +$1,740.80 once USD proceeds are converted, before costing 30 same month sales counted as $0; $165.82 of US source dividends labelled Canadian eligible; USD dividends unconverted; lending interest and withholding missing. Plan Task 6.0 added; priority raised to p0 so this runs next.
- 2026-09-27 02:15 — Implementation delegated to a Sonnet subagent, Task 6.0 first.
- 2026-09-27 02:35 — Four commits: fb2e084 (investment income corrected), 890694c (deadlines and next actions), c810bba (registered contributions planner), fa1f6d8 (Contributions tab). 2026 realized −$4,243.49 to +$1,650.10; Canadian distributions $92.59; foreign dividends $189.91; foreign tax withheld $27.95; interest $0.02; 3 sales without a cost basis. 2025 realized −$1,067.39 to −$1,095.55. `bun run check`: 1431 pass, 0 fail; contrast AA pass.
- 2026-09-27 02:36 — Agent review dispatched at Opus with an independent recomputation of the tax figures.
- 2026-09-27 03:00 — Review round 1 FAIL: the method still invented money. A same month split (NFLX 2025) made a phantom −$1,008; unreadable sales vanished; average cost ignored earlier buys that month; Aon and Agilent shared the symbol A; some US dividends were filed Canadian; the FHSA text invited an over contribution. Fixed with one running per symbol ledger (a2216ce, 7fd8ac5, 850829e).
- 2026-09-27 03:40 — Round 2 FAIL: figures confirmed to the cent by the reviewer's independent replica, but Dec 31 deadlines rolled into January, the corpus test could not fail, and an unreadable buy quantity could misprice a later partial sale. Fixed in 960ce9a, 97cef5b (mutation proved), 94664ba, 36c9570.
- 2026-09-27 04:05 — Round 3 FAIL on one line: with the 2025 filter the TFSA planner read "Contributed $25,000.00 of $7,000.00", an apparent over contribution that is really carry forward the statements cannot show. Fixed by the orchestrator (a limit is stated only when assessed), test failed first. `bun run check`: 1470 pass, 14 skip, 0 fail.
- 2026-09-27 04:10 — Three agent review rounds used, so per the loop protocol this goes to human review rather than self closing.

## What a human reviewer should check

Final investment income for tax, taxable accounts 1f9a, 2c62, e2d6, confirmed to the cent by the reviewer's replica:

| Figure | 2025 | 2026 | 2026 before this ticket |
|---|---|---|---|
| Realized gains | +$11.64 | +$1,859.35 | −$4,243.49 |
| Distributions from Canadian listed securities | $0.00 | $90.82 | $256.64 labelled eligible |
| Foreign dividends (CAD) | $21.03 | $191.68 | $18.64 unconverted USD |
| Foreign tax withheld | $2.98 | $27.95 | not shown |
| Interest incl. securities lending | $0.00 | $0.02 | $0.00 |
| Sales without a cost basis | 13 | 7 | silently $0 |

1. The sales without a cost basis (blank descriptions, sales right after a split or reorganization, the ambiguous symbol A, oversold lots) add nothing to realized gains. Their proceeds are listed; your broker's T5008 is the authority for them.
2. USD book cost is converted at month end rates, so USD realized gains are approximate; the page says so.
3. Spin offs (AMRZ, FDXF, MBGL, Q) and stock dividends are listed under corporate actions to check against your slips; a US spin off without a section 86.1 election is a taxable dividend in Canada.
