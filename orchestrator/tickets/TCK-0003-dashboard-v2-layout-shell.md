---
title: "TCK-0003 — Dashboard v2: layout shell and tab restructure"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-26
type: ticket
id: TCK-0003
status: claimed
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: []
created_by: umar
session: null
---

# TCK-0003 — Dashboard v2: layout shell and tab restructure

## Goal

Restructure the investments dashboard into five tabs (This month, Portfolio, Growth, Plan, Data), keep the hero chart only on Portfolio with a compact summary strip on the other tabs, widen the page, and consolidate the repeated approximation notes.

## Acceptance criteria

- [ ] Tabs are This month, Portfolio, Growth, Plan, Data; old hashes (#overview, #wrappers, #tax, #projections, #reconciliation, #cards) resolve to the new tab that now holds that content
- [ ] Hero chart, year filter, account filter and chart mode toggle render on Portfolio only; every other tab shows a one line summary strip (total, gain, as of period)
- [ ] Page max width 72rem with a two column card grid where cards sit side by side
- [ ] The USD book cost note renders once per tab behind an About these numbers disclosure instead of on every card
- [ ] Growth return charts exclude chequing and accounts with no derived or stated rate, and render in a grid
- [ ] Data tab holds Reconciliation, statement coverage and Cards
- [ ] bun run check clean, bun run contrast pass (updated for the new tabs)

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog

