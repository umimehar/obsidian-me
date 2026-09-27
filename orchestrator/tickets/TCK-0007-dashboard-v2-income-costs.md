---
title: "TCK-0007 — Dashboard v2: income, withholding tax and costs"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-26
type: ticket
id: TCK-0007
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

# TCK-0007 — Dashboard v2: income, withholding tax and costs

## Goal

Show what the portfolio pays and what it costs: dividends, interest, securities lending, foreign withholding tax by account, fees and FX conversions.

## Acceptance criteria

- [ ] Income by month and year from DIV, INT, FPLINT rows, per account and total
- [ ] Foreign withholding tax (NRT) per account per year, with a note on which account types can recover it
- [ ] Fees (FEE) and FX conversion counts and amounts per year
- [ ] All figures from the datastore through analytics.json; tests over fixtures and the real corpus; bun run check clean

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog

