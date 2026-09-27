---
title: "TCK-0004 — Dashboard v2: This month page"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-26
updated: 2026-09-26
type: ticket
id: TCK-0004
status: done
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

- [x] Month over month change of the portfolio split into net deposits and market growth, same netting as yearChange
- [x] Per account movers table: value, change, deposits, growth, sorted by absolute change
- [x] Dividends, interest and fees received in the month, from activity rows
- [x] New accounts opened in the month and accounts missing a statement, from coverage
- [x] Latest checkpoint comparison summary when a checkpoint covers the month
- [x] A month picker defaults to the latest period; all figures via the existing formatters
- [x] Tests over the real corpus and fixtures; bun run check clean

## Context

Owner request in session on 2026-09-26, after reviewing a proposal for the investments dashboard (`personal/investments/app`). Owner decisions: retirement age 60 (owner born 1997, from the RRSP last accrual year 2068 at 71), inflation adjustable on the page, net worth and the household switch deferred until the spouse's accounts arrive, goal targets move to a committed `data/plan.json` and the code defined targets are deleted. Gates: `bun run check` clean, `bun run contrast` pass, owner's CLAUDE.md voice and no hyphen rules for any prose on the page.

## Worklog
- 2026-09-27 00:50 — Implementation delegated to a Sonnet subagent with the plan's TCK-0004 section.
- 2026-09-27 01:05 — Three commits: 9b32a22 (activity totals per account and month in analytics.json), b189b67 (month review model), 182006b (This month tab, now the default). `bun run check`: 1388 pass, 14 skip, 0 fail. `bun run contrast`: AA pass, the month tab swept with 87 runs of text. Mutation checked: null fxRate throw, FEE debit reading, missing account filter.
- 2026-09-27 01:06 — Agent review dispatched at Opus, high effort.
- 2026-09-27 01:20 — Review round 1 FAIL: reversal rows ignored (d6d9 2026-04 dividends doubled to $81.80), a late statement read as market loss, year filter ignored, movers untoned, malformed checkpoints dropped silently, tests unable to fail. Five fix commits 9de5946 to 1aa5f4e, including the owner's spacing request.
- 2026-09-27 01:50 — Round 2 FAIL: the fix dropped newly opened accounts from paid in (August showed $6,547 against a true $11,547, $5,033.46 unexplained). Fixed in 91e5e8d; missing accounts' last value rendered in 366e29f.
- 2026-09-27 02:10 — Round 3 PASS. Every one of 39 months splits exactly into deposits plus growth; 2026 monthly deposits sum to yearChange. `bun run check`: 1411 pass, 14 skip, 0 fail; contrast AA pass.
