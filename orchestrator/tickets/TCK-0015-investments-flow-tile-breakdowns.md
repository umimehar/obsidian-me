---
title: "TCK-0015 — Money flow: explain every tile and show its breakdown"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0015
status: in-progress
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0014]
created_by: umar
session: 84ef9f69-04a1-4e04-b797-30b71ca694d2
---

# TCK-0015 — Money flow: explain every tile and show its breakdown

## Goal

Every summary tile on the Flow tab says in one line what it means, and clicking it opens a popover with the parts that make up its figure, each part linking to the statement rows behind it. A line under the tiles shows how the tiles fit together.

## Acceptance criteria

- [ ] Each tile carries a one line explanation beneath its figure (owner approved wording below, sentence case, no hyphens), also in its accessible name
- [ ] Clicking or pressing Enter on a tile opens a Radix popover with its parts: label, amount, share of the tile; the parts sum exactly to the tile (test on every month, year and all time of the corpus)
- [ ] Each part with rows has "Show rows", which opens the existing drill down with exactly those rows and a title naming the tile and part
- [ ] A "How the tiles fit" line: paid in + CESG + income − costs − left Wealthsimple − currency conversion = invested + left in cash, each term from one formatter call, equal to the cent
- [ ] Breakdown figures for 2026 pinned in goldens, computed by the production function
- [ ] Works at 72rem and 390px in both themes; popover inside the viewport; keyboard: focus moves into the popover and Escape returns it to the tile
- [ ] `bun run check`, `bun run build:ui`, `bun run contrast` (popover opened and swept) clean
- [ ] Reviewed by an Opus subagent that recomputes every breakdown from `data/flows.json` and the datastore and mutation tests the code; up to 3 review rounds, then human review

## Context

Owner request 2026-09-29, with the popover chosen over a panel. Definitions come from `app/src/analytics/flows/summary.ts`. The parts, with 2026 figures the coordinator computed as a check:

- Paid in from outside, $134,880.63: "New money that arrived from outside Wealthsimple. Moves between your own accounts are not counted." Parts by source: payroll deposited $46,464.63, outside bank $20,816.00, Interac received $12,600.00, business $55,000.00. A second section "Of which contributions to registered accounts" by account type (not part of the sum).
- Invested, $144,420.23: "What you bought, minus what you sold. Cash like funds are not counted." Parts: purchases $259,942.17, less sales −$115,521.93. Optionally net by account type beneath.
- Left in cash, −$18,197.11: "The change in money not invested: cash balances plus cash like funds such as PSA." Parts: change in cash per account (chequing 8cd3 −$26,618.77, chequing 2b74 −$8,165.82, ...), then cash like funds per symbol (PSA $11,127.59, PSU.U $88.20, ...). Sum −$29,409.79 + $11,212.68.
- Income earned, $2,035.26: "What your money earned inside Wealthsimple. Not salary, and not price gains." Parts: dividends (DIV) $1,745.69, interest (INT, CASH_INTEREST) $65.64, securities lending (FPLINT) $1.73, cash back (CASHBACK) $142.20, rewards (REFER, GIVEAWAY, CASH_REWARD) $80.00, other refunds (REIMB not a fee refund).
- Costs, $321.35: "Management fees and foreign withholding tax, less fee rebates. The currency conversion spread is not in the statements." Parts: management fees (FEE) $234.25, withholding tax (NRT) $97.87, fee rebates (REIMB fee refunds) −$10.77.
- Left Wealthsimple, $10,885.85: "Money that went to somewhere outside Wealthsimple, such as bill and card payments." Parts by kind: transfers out (TRFOUT, TRFOUTTF, CASH_TRANSFER unpaired debits) , Interac sent (CASH_INTERAC_OUT), withdrawals (WD) $700.00, card purchases (SPEND) $38.49, sent to a person (P2P_OUT) $1.00; and by account beneath (2b74 $10,337.91, 8cd3 $547.94).
- Invested rate, 104.9%: "Invested divided by what came in (paid in, CESG and income). Over 100% means earlier cash was invested." Parts: the numerator and the three denominator terms.
- Identity check for 2026: 134,880.63 + 800.00 + 2,035.26 − 321.35 − 10,885.85 − 285.57 = 126,223.12 = 144,420.23 − 18,197.11.

## Worklog

- 2026-09-29 — Created at the owner's request after the Flow tab shipped.
