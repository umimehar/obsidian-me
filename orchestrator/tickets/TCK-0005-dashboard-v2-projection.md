---
title: "TCK-0005 — Dashboard v2: projection in today's dollars, for all or selected accounts"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-27
type: ticket
id: TCK-0005
status: review
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

# TCK-0005 — Dashboard v2: projection in today's dollars, for all or selected accounts

## Goal

Make the projection answer where the money is heading in terms the owner thinks in: today's dollars, a range, milestones, retirement income at 60, for all or selected accounts.

## Acceptance criteria

- [x] Inflation slider (default from plan.json, 2.5%) and a nominal / today's dollars toggle, default today's dollars
- [x] Three rate lines (low, base, high around the chosen rate) drawn as a band on a linear axis with the base line
- [x] Milestone years: first $500k and $1M in today's dollars, per the base rate
- [x] Retirement at 60 from plan.json: projected balance and 4% a year as monthly income in today's dollars
- [x] Account selection shared with the Portfolio account filter: projection runs for all or selected accounts
- [x] Fitted rate shown as context only, capped out of the one click apply, with the window caveat
- [x] data/plan.json holds retirement age, birth year, default inflation and goal targets; the code defined goal targets are deleted and goals read the plan file
- [x] Tests: engine inflation deflator, milestone detection, selection, plan parsing errors; bun run check clean
- [x] The projection lives on a new Future tab (id `future`, label Future), moved out of the interim Plan tab; `#projections` and `#plan` resolve to it; Future ignores the year scope and states that

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog
- 2026-09-27 01:30 — Owner asked for more meaningful tabs; final set is This month, Portfolio, Holdings, Growth, Income, Contributions, Future, Data. Acceptance criterion added for this ticket's tab; plan updated.
- 2026-09-27 — Implemented across three commits: `data/plan.json` plus `src/plan.ts` replacing `goals/config.ts`; `src/projection/scenario.ts` (`runScenarios`, `deflate`, `milestoneYear`, `retirementIncome`); the Future tab replacing the interim Plan tab, `ProjectionChart` moved from a log axis to a linear one with a low to high band. `bun run check` clean (1470 tests), `bun run contrast` AA pass. Goldens gained six Future-tab fields, no other figure moved.
