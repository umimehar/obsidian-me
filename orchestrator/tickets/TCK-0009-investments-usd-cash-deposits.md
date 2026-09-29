---
title: "TCK-0009 — Investments: count USD cash deposits as money paid in"
tags: [ticket, project/system, type/bug, personal/investments]
created: 2026-09-27
updated: 2026-09-29
type: ticket
id: TCK-0009
status: claimed
project: system
ticket_type: bug
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: small
depends_on: []
created_by: agent:mac-studio
session: 5d58b682-52ea-4755-b750-b787fdc2ed32
---

# TCK-0009 — Investments: count USD cash deposits as money paid in

## Goal

`app/src/analytics/series.ts:80-86` builds each month's deposits from the CAD cash block only, so a USD cash deposit never counts as money paid in. It then reads as market growth on This month, in the year change line, in the fitted rate and in the XEQT benchmark.

## Acceptance criteria

- [ ] USD `paidIn.deposits` and `paidOut.withdrawals` are converted with the statement's own `fxRate` and added to the month's deposits and withdrawals
- [ ] The two known cases are covered: 2c62 2025-11 $1,431.66 USD (about $2,001 CAD) and 2025-12 $3.31 USD
- [ ] Goldens regenerated and the diff read: month review, year change, fitted rate, benchmark difference (the reviewer of TCK-0008 estimated the benchmark gap moves from about −$3,625 to about −$5,925)
- [ ] The benchmark callout's note that USD deposits are not yet counted is removed
- [ ] `bun run check` clean, contrast pass

## Context

Found by the agent reviewer of TCK-0008 while recomputing the XEQT benchmark. Filed to Backlog per the loop protocol; the owner triages it to Ready.

## Worklog

- 2026-09-29 — Triaged to Ready by the owner as the first ticket of the money flow work (plan Ticket A, Task 1).

- 2026-09-27 08:20 — Created from the TCK-0008 review. Only two USD deposit months exist in the corpus today, both in 2c62.
