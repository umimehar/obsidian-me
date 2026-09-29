---
title: "Money flow: a Sankey of where the money came from, went and sits now"
tags: [personal/investments, decision]
created: 2026-09-29
updated: 2026-09-29
status: active
type: decision
personal: investments
---

# Money flow

A new Flow tab, placed after This month, answering three questions in one picture: where the money came from, where it went and where it sits now, and what leaked out. Modelled on Monarch's Cash Flow report, drawn in this app's own language (Radix Themes, jade accent, slate gray, both themes, hand built SVG).

Owner decisions, 2026-09-29: a new tab named Flow rather than a redesign of This month; chequing is a hub node; PSA and other savings ETFs are a cash equivalent node, excluded from the invested rate; the rest of this design approved as presented. TCK-0009 lands first because every figure here depends on USD deposits counting.

## What the data supports

Measured over `data/datastore.json` on 2026-09-29: 225 statements after `dedupeToLatestVersion`, PERFORMANCE skipped.

### Chequing arrives twice, then once

Every chequing month through 2026-06 has a BROKERAGE and a CASH statement with identical rows (same count, same credit and debit totals). From 2026-07 only the CASH statement arrives, and its rows carry code `""` with a description. The flow selects BROKERAGE where one exists for that account and period and CASH only where none does. Taking both counts every chequing dollar twice.

CASH descriptions map to a code by pattern: `Direct deposit from` is payroll, `Interac e-Transfer® Received` is an Interac receipt, `Interac e-Transfer® Out` an Interac send, `Interest earned` interest, `Cash back`, `Referral bonus` and `Giveaway received` rewards, and every other `Transfer in` or `Transfer out` a transfer. The description itself never leaves the build: several name people.

### Internal transfers pair on date and amount

A pair is one debit and one credit in two different accounts, same currency, same date, same amount to the cent. On the corpus that rule pairs 192 legs from BROKERAGE codes at zero days of slack, and the July and August CASH rows pair the same way (2b74 `Transfer out` to 2318 `CONT`, to 97ab `CONT`, to c2e9 `DEP`; 18a3 `Transfer out to Chequing` to 2b74 `Transfer in from Savings`). About $192,000 moved between the owner's own accounts over all time, each pair counted once.

Matching runs in two passes. Exact date first. Then a second pass allowing up to three days, whose pairs carry `lagDays` and are listed on the page. A leg with no partner after both passes is treated as crossing the boundary: a credit is new money from outside, a debit left Wealthsimple. Every unpaired leg is counted on the page ("n legs not paired") and visible in the drill down, so a missed match is findable rather than silently inflating new money.

Cross currency legs do not pair by amount. 2b74 sent $2,000 CAD on 2025-07-30 with `FX Rate: 1.4094` in the description and no USD leg exists in any account; 2c62's USD $1,431.66 on 2025-11-25 has no CAD leg. Both stay unpaired and visible. Pairing them by converted amount is not in scope: two cases do not justify a tolerance rule that could pair unrelated money.

### Codes mean different things in different accounts

Source classification reads account kind, code and description together.

| Account | Code | What it is | Source |
|---|---|---|---|
| Chequing | `AFT_IN`, CASH `Direct deposit from` | payroll direct deposit | Payroll |
| 2b74 | `DEP` | biweekly deposit, $2,342 from 2025-10, the payroll before it was coded `AFT_IN` | Payroll, by owner reviewed override |
| Chequing | `CONT`, `DEP`, `EFT`, unpaired `TRFIN`/`TRFINTF` | money from an outside bank ($18,165 on 2b74, $44,000 on 8cd3) | Outside bank |
| Chequing | `E_TRFIN`, CASH Interac received | Interac receipt | Interac received |
| Corporate | `CONT`, `EFT` | the business bank funding the account ($55,000 in 2026) | Business |
| RESP | `GRANT` | CESG | Government grant |
| Any other | unpaired `CONT`, `DEP`, `TRFIN` | outside money straight into the account (the TFSA from 2023 before chequing existed) | Outside bank |

The 2b74 payroll override lives in `registry.ts` beside `KIND_OVERRIDES`, keyed by shortId and code, with a comment that the owner confirmed it. It is never inferred from the amount's regularity.

Contributions and deposits stay distinct. "Paid in from outside" is a cash movement across the boundary. Contributions are a registered account concept, and `CONT` rows on TFSA, RRSP, spousal RRSP, FHSA and RESP are summed separately and shown beneath the headline by account type, the same codes `rooms.ts` counts.

### The cash summaries reconcile

With a plain code to bucket mapping, the activity rows reproduce the statement's own `paidIn` and `paidOut` exactly on 219 of 249 cash blocks, CAD and USD. All 30 misses are classification, not missing money: `REIMB` netted into fees on 9710 and d6d9, RESP grants filed under `other`, a reversed dividend on d6d9 2026-04 (81.80 credited against 40.90 debited), and $23.87 of fees on 2c62 across 2026-03 to 2026-05 that the statement states and the `BUY` rows fold into their amounts.

The balance identity per account, currency and period is `opening + in = closing + out`, with in and out from the rows. Any gap between that and the statement's closing balance is a residual, carried as an Unreconciled node rather than absorbed.

### Salary is partly visible, spending is not

Payroll deposited to 2b74 is about $24,700 in 2025 and $46,500 in 2026 to August. That is only what reached Wealthsimple. Spending shows only as money leaving chequing to people and other institutions, about $14,100 over all time. The page shows "Payroll deposited here" as a source and says in one line that total income and spending are not in these statements. No savings rate on salary is computed.

### Asset class needs our own table

Statements print only "Canadian/US Equities and Alternatives", "Canadian-Listed/US-Listed Securities and Alternatives" and "Crypto Assets". PSA ($4,250.80 in 2318, $6,877.37 in d77c at 2026-08) sits inside the equities label. Group by asset class therefore reads a symbol table in `src/analytics/flows/assetClass.ts` with five classes: equity, fixed income, cash equivalent, crypto, private markets. An unlisted symbol falls to equity and is named in the tab's note, so a new holding surfaces rather than hides. The table seeds cash equivalent with PSA and the savings ETFs the owner may buy later (CASH, HISA, ZMMK, CBIL, HSAV), and private markets with the d6d9 funds.

### What the rows cannot show

In kind transfers carry $0 cash: four rows in 2023 (BABA out of d77c, BABA, JEPQ and SCHD in). They appear in the flows table with "no cash value on the statement" and stay out of the Sankey. FX conversion spread is not stated anywhere; the page shows the stated fee gap only (`statedFees.ts`) and says the conversion spread is not in the statements. `LOAN`, `RECALL`, `STKDIV`, `STKDIS`, `STKREORG` and `ROC` rows are all $0 and are skipped.

## The Sankey

Four columns, left to right.

1. Came from: Payroll, Outside bank, Interac received, Business, Government grant, Portfolio income (dividends net of reversals, interest, securities lending, rewards), Sale proceeds, and Drawn from cash when balances fell over the period.
2. Landed in: Chequing, or Straight into an account. Chequing is the hub: money that entered chequing and moved on flows through it.
3. Group by, default account type: TFSA, RRSP, spousal RRSP, FHSA, RESP, non registered, corporate, crypto. Swappable to account, purpose, asset class or holding.
4. Where it is now: Invested (net buys), Cash, Cash equivalents, Fees and withholding, Left Wealthsimple, Unreconciled.

Links may span columns: chequing money that left Wealthsimple goes from column 2 straight to column 4, and sale proceeds and portfolio income skip column 2 and link straight to the account group they arose in.

Sources in a period sum to uses exactly. Recycled money (sale proceeds, income) is drawn in a lighter tone of its band and excluded from "Paid in from outside". The spousal RRSP is labelled "Spousal RRSP (spouse's asset)". The credit card is not in the flow at all: it is a debt, and its own pipeline.

In the Sankey, Invested is gross buys, balanced by Sale proceeds on the left; the Invested tile is buys less sale proceeds, the new money that went into securities. Group by holding or asset class splits column 3 by what was bought, read off the `BUY` rows; money still in cash sits under Cash in column 4 regardless.

Every node label carries its amount and its share of the period's total in, from one `formatCurrency` and one `formatShare` call. Hovering a band highlights it and its two nodes and shows a readout; clicking pins it and opens the drill down below the chart. Keyboard: bands are focusable in column order, Enter pins, and the chart's accessible summary lists the five largest flows in words.

Layout is hand rolled in `src/ui/charts/sankeyLayout.ts`, a pure function from nodes and links to rectangles and paths, unit tested. d3-sankey 0.12.3, last published 2022-06, was considered and rejected: it brings d3-array 2 and d3-shape 1 for iterative placement this fixed four column graph does not need.

Below 40rem the chart collapses to two columns (Came from to Where it is now) and the flows table leads.

## The rest of the tab

Controls, one row: period (this month, a chosen month, a year, a custom range, all time), group by, and the shared `AccountFilter`. The period lives in the hash (`#flow/2026`, `#flow/2025-07..2026-06`) like `YearScope`. A period whose last month has an account without a statement names that account as missing, never as $0; a newly opened account starts from $0.

Summary tiles for the period: Paid in from outside, Invested, Left in cash (cash plus cash equivalents change), Income earned, Costs (fees plus withholding), Invested rate (invested over paid in from outside plus income; cash equivalents count as not invested, footnoted). Beneath the first tile, contributions by registered account type.

A stacked bar chart of new money by destination per month, or per year when the period spans more than 24 months, stacked by the current group by.

A flows table: source, destination, amount, share of the period's total in. Sorted by amount.

A drill down: the statement rows behind the selected band, with date, account label, code, amount in CAD and, for USD rows, the original amount and rate. Paired rows show their partner.

## Architecture

Browser safe analytics, no Node imports, under `src/analytics/flows/`:

- `select.ts` picks the statements (dedupe, skip PERFORMANCE, CASH only where no BROKERAGE).
- `classify.ts` turns a row into a `FlowRow`: id, period, date, account id, code (CASH codes resolved), category, signed CAD amount, currency, original amount, rate.
- `match.ts` pairs internal legs and returns pairs plus unpaired legs.
- `reconcile.ts` checks the balance identity per account, currency and period and returns residuals.
- `graph.ts` builds nodes and links for a period, a group by and an account selection, and asserts sources equal uses.
- `assetClass.ts` holds the symbol table.

`analytics/build.ts` writes `data/flows.json`: the classified rows, pairs, residuals and the latest cash equivalent positions. No descriptions, no account numbers, labels from the registry. Goldens gain the headline flows for 2025, 2026 and all time, computed by calling `graph.ts` on the datastore.

UI: `src/ui/Flow.tsx`, `src/ui/charts/Sankey.tsx`, `src/ui/charts/StackedBars.tsx` if none exists to reuse, added to `TABS` after This month. `bun run contrast` gains the Flow tab and a band hover.

## Testing

Fixture tests for each rule: duplicate chequing templates, an exact pair, a lagged pair, an unpaired leg each way, a USD row, a reversal, the payroll override, a residual. Corpus tests read `data/goldens.json`. The graph test asserts sources equal uses for every month, every year and all time on the real corpus. Mutation proofs on the matcher, the template selection, USD conversion and the balance assertion, each by commit, mutate, red, `git checkout`, `git diff --quiet`.
