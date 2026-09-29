---
title: "TCK-0009 — Investments: count USD cash deposits as money paid in"
tags: [ticket, project/system, type/bug, personal/investments]
created: 2026-09-27
updated: 2026-09-29
type: ticket
id: TCK-0009
status: done
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
session: 84ef9f69-04a1-4e04-b797-30b71ca694d2
---

# TCK-0009 — Investments: count USD cash deposits as money paid in

## Goal

`app/src/analytics/series.ts:80-86` builds each month's deposits from the CAD cash block only, so a USD cash deposit never counts as money paid in. It then reads as market growth on This month, in the year change line, in the fitted rate and in the XEQT benchmark.

## Acceptance criteria

- [x] USD `paidIn.deposits` and `paidOut.withdrawals` are converted with the statement's own `fxRate` and added to the month's deposits and withdrawals
- [x] The two known cases are covered: 2c62 2025-11 $1,431.66 USD (about $2,001 CAD) and 2025-12 $3.31 USD
- [x] Goldens regenerated and the diff read: month review, year change, fitted rate, benchmark difference (the reviewer of TCK-0008 estimated the benchmark gap moves from about −$3,625 to about −$5,925)
- [x] The benchmark callout's note that USD deposits are not yet counted is removed
- [x] `bun run check` clean, contrast pass

## Context

Found by the agent reviewer of TCK-0008 while recomputing the XEQT benchmark. Filed to Backlog per the loop protocol; the owner triages it to Ready.

## Worklog

- 2026-09-29 — Triaged to Ready by the owner as the first ticket of the money flow work (plan Ticket A, Task 1).

- 2026-09-27 08:20 — Created from the TCK-0008 review. Only two USD deposit months exist in the corpus today, both in 2c62.
- 2026-09-29 — Implemented by a Sonnet subagent in `9de104a`, `b97e6b7`, `9959ede`. `series.ts` sums every cash block's deposits and withdrawals converted at the statement's own rate, and `deriveContributionFromActivity` now converts USD contribution credits too (found by the reviewer, same defect one function over).
- 2026-09-29 — Figures, recomputed independently by the reviewer from the datastore: 2c62 deposits 2025-11 +$2,001.32 (US$1,431.66 at 1.3979), 2025-12 +$4.54 (US$3.31 at 1.3706); 2c62 2025 contributions $2,904.29 → $3,475.17; fitted rate 21.19% → 19.73%; benchmark difference −$3,625.40 → −$5,927.65. No room figure or projection input moved.
- 2026-09-29 — Gates: `bun run check` 1631 pass, 14 skip, 0 fail; `bun run build:ui` clean; `bun run contrast` AA pass (worst light 4.61, dark 8.06).
- 2026-09-29 — Opus review: FAIL (stale doc, untested zero guard), FAIL (untested contribution guard), PASS in round 3. Every guard on the new code has a mutation that reddens the suite.
