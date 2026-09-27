---
title: "TCK-0004 — Dashboard v2: This month page"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-26
type: ticket
id: TCK-0004
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

# TCK-0004 — Dashboard v2: This month page

## Goal

Add a This month landing tab that answers what changed since the previous statement month.

## Acceptance criteria

- [ ] Month over month change of the portfolio split into net deposits and market growth, same netting as yearChange
- [ ] Per account movers table: value, change, deposits, growth, sorted by absolute change
- [ ] Dividends, interest and fees received in the month, from activity rows
- [ ] New accounts opened in the month and accounts missing a statement, from coverage
- [ ] Latest checkpoint comparison summary when a checkpoint covers the month
- [ ] A month picker defaults to the latest period; all figures via the existing formatters
- [ ] Tests over the real corpus and fixtures; bun run check clean

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog
- 2026-09-27 00:50 — Implementation delegated to a Sonnet subagent with the plan's TCK-0004 section.
- 2026-09-27 01:05 — Three commits: 9b32a22 (activity totals per account and month in analytics.json), b189b67 (month review model), 182006b (This month tab, now the default). `bun run check`: 1388 pass, 14 skip, 0 fail. `bun run contrast`: AA pass, the month tab swept with 87 runs of text. Mutation checked: null fxRate throw, FEE debit reading, missing account filter.
- 2026-09-27 01:06 — Agent review dispatched at Opus, high effort.
