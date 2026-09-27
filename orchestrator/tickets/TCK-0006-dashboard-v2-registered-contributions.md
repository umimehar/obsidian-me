---
title: "TCK-0006 — Dashboard v2: registered contributions planner and tax fix"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-26
type: ticket
id: TCK-0006
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

# TCK-0006 — Dashboard v2: registered contributions planner and tax fix

## Goal

Turn the Registered wrappers view into a Registered contributions planner with room, deadlines and next actions, and fix the Tax view's misleading taxable income.

## Acceptance criteria

- [ ] Section renamed Registered contributions; per wrapper: contributed this year, room left, deadline (RRSP first 60 days of next year, FHSA and TFSA Dec 31), and a next action line
- [ ] RESP shows grant math: contributions needed for the maximum CESG this year and the carry forward
- [ ] Multi year history of contributions per wrapper as a compact table
- [ ] Tax view no longer presents investment income minus the RRSP deduction as taxable income; it shows investment income by type and the RRSP deduction as separate facts
- [ ] Tests; bun run check clean

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog

