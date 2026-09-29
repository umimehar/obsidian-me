---
title: "TCK-0011 — Money flow: graph, summary and goldens"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0011
status: done
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0010]
created_by: umar
session: 84ef9f69-04a1-4e04-b797-30b71ca694d2
---

# TCK-0011 — Money flow: graph, summary and goldens

## Goal

Turn `flows.json` into a balanced four column graph for any period, group by and account selection, plus the summary tiles' figures, with headline flows for 2025, 2026 and all time pinned in `data/goldens.json`.

## Acceptance criteria

- [x] All eleven link rules and the mirror rule implemented as the plan states; the balance assertion throws naming the node
- [x] Every month, every year and all time balance on the corpus for all five group bys (test)
- [x] Summary, `missingAccounts` and `depositsByDestination` tested per rule
- [x] Goldens gain `flows` computed by calling the production functions; the diff is read and the 2025, 2026 and all time headline recorded in the worklog
- [x] An independent check that 2b74 2026-05 inflows equal that statement's own `paidIn.deposits`
- [x] The five mutations in Task 5 Step 5 each go red and are restored with `git diff --quiet`
- [x] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

## Context

Plan: `personal/investments/docs/superpowers/plans/2026-09-29-money-flow.md`, Ticket C (Task 5). Spec: `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read `personal/investments/CLAUDE.md` first. Owner decisions 2026-09-29: new Flow tab after This month, chequing is a hub node, PSA and savings ETFs are a cash equivalent node excluded from the invested rate.

## Worklog

- 2026-09-29 — Created from the money flow plan; owner asked to run it end to end with `/obsidian-loop`.
- 2026-09-29 — Implemented by a Sonnet subagent in `c784b8b`, `3954d94`, `5f298e4`, `3aaaa2d`, `992608f` (the first four reworded before any push to strip AI attribution trailers).
- 2026-09-29 — Headline, recomputed to the cent by the Opus reviewer without calling production code:

| | 2025 | 2026 | All time |
|---|---|---|---|
| Paid in from outside | 103,303.30 | 134,880.63 | 253,609.43 |
| Payroll | 24,741.83 | 46,464.63 | 71,206.46 |
| Outside bank | 78,561.47 | 20,816.00 | 114,802.97 |
| Interac received | 0.00 | 12,600.00 | 12,600.00 |
| Business | 0.00 | 55,000.00 | 55,000.00 |
| Invested (net buys) | 67,007.14 | 144,508.82 | 226,201.98 |
| Left in cash | 35,963.72 | −18,285.69 | 17,687.92 |
| Income earned | 3,223.78 | 2,035.26 | 5,597.74 |
| Costs | 327.77 | 321.35 | 686.66 |
| Left Wealthsimple | 3,209.97 | 10,885.85 | 15,126.57 |
| Invested rate | 62.9% | 104.9% | 87.0% |

- 2026-09-29 — Review round 1 FAIL: residual rendered as an extra use and in the wrong direction when negative; balance checked after dropping sub-cent links with a 5 cent tolerance; `depositsByDestination` untested and counting sale proceeds; closed accounts flagged as missing; a silent skip on a rateless USD block. Round 2 FAIL: closure was inferred from a $0 balance, which would hide a missing 8cd3 statement. Round 3 PASS: closure is owner declared in `registry.ts` (`CLOSED_ACCOUNTS`, empty today). Worst unrounded imbalance over every month, year and all time across five group bys: 2.9e-10.
- 2026-09-29 — Known, by design: left in cash differs from the statements' closing cash by $44.70 over all time, the revaluation of held USD cash, because each month's change converts at that month's rate.
- 2026-09-29 — Gates: `bun run check` 1746 pass, 14 skip, 0 fail; `bun run build:ui` clean.
