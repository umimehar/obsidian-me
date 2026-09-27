---
title: "TCK-0005 — Dashboard v2: projection in today's dollars, for all or selected accounts"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-27
type: ticket
id: TCK-0005
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

# TCK-0005 — Dashboard v2: projection in today's dollars, for all or selected accounts

## Goal

Make the projection answer where the money is heading in terms the owner thinks in: today's dollars, a range, milestones, retirement income at 60, for all or selected accounts.

## Acceptance criteria

- [ ] Inflation slider (default from plan.json, 2.5%) and a nominal / today's dollars toggle, default today's dollars
- [ ] Three rate lines (low, base, high around the chosen rate) drawn as a band on a linear axis with the base line
- [ ] Milestone years: first $500k and $1M in today's dollars, per the base rate
- [ ] Retirement at 60 from plan.json: projected balance and 4% a year as monthly income in today's dollars
- [ ] Account selection shared with the Portfolio account filter: projection runs for all or selected accounts
- [ ] Fitted rate shown as context only, capped out of the one click apply, with the window caveat
- [ ] data/plan.json holds retirement age, birth year, default inflation and goal targets; the code defined goal targets are deleted and goals read the plan file
- [ ] Tests: engine inflation deflator, milestone detection, selection, plan parsing errors; bun run check clean
- [ ] The projection lives on a new Future tab (id `future`, label Future), moved out of the interim Plan tab; `#projections` and `#plan` resolve to it; Future ignores the year scope and states that

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog
- 2026-09-27 01:30 — Owner asked for more meaningful tabs; final set is This month, Portfolio, Holdings, Growth, Income, Contributions, Future, Data. Acceptance criterion added for this ticket's tab; plan updated.
