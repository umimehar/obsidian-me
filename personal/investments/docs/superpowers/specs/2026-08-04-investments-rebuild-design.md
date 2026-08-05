---
title: "Investments rebuild: PDF statements as the source of truth"
tags: [personal/investments, decision]
created: 2026-08-04
updated: 2026-08-05
status: active
type: decision
personal: investments
---

# Investments rebuild: PDF statements as the source of truth

Replace the CSV-derived investment tracker with one built on Wealthsimple's PDF statements, add market value and reconciliation, and rebuild the interface as a local Bun + React app with per-wrapper views.

## Why rebuild

The current system reports every figure at cost, because the transaction CSVs carry `symbol`, `quantity`, and adjusted cost base but no market price. On 2026-06-30 the Wealthsimple app showed an account value of $242,019.61 and net deposits of $217,514.00. The current system produces $213,620.71 of net deposits, a $3,893.29 gap, and cannot produce an account value at all.

Four causes of the net-deposits gap were traced in the CSV data:

- In-kind security transfers record `amount = 0`. A row reading `BABA - Transfer of 2.0000 shares into the account` books as nothing. Wealthsimple counts the market value.
- Every non-CAD transfer is excluded: $1,434.97 USD into the USD non-registered account, $766.39 USD into the old USD TFSA. The `currency` column is contaminated with ticker symbols, and only 1 of 1,325 non-CAD rows carries an `fx_rate`, so conversion was impossible.
- RESP grants ($550 across three payments) are not counted as deposits.
- Which accounts belong in the investment total was a guess, never verified against a stated figure.

The PDFs remove all four causes for every account that has statements. Summing the eleven investment accounts from their June 2026 statements gives **$241,739.67 against the app's $242,019.61**, a 0.12% gap, with no tuning, and that residual is explained below.

One qualification: the 2023 USD deposits in cause 2 landed in accounts with no PDF export at all, so a net-deposits total built from PDFs alone cannot recover them. Cause 2 is removed only where statements exist.

## What the PDFs contain that the CSVs do not

Verified against the June 2026 statements:

- **Market value and market price per holding**, with correct exchange resolution. `PSA` prices at $50.01 CAD, the Purpose High Interest Savings ETF. A previous live-price attempt resolved the bare ticker to Public Storage US at roughly $315 and was removed for that reason. The disambiguation problem does not exist here.
- **Book cost per holding and per asset class**, stated rather than derived.
- **The month's conversion rate**, printed as `$1 USD = $1.421000 CAD`. Self-directed statements additionally split every cash figure into CAD and USD columns.
- **Contributions split into first 60 days and rest of year**, which is the split an RRSP deduction claim needs and which no CSV can produce.
- **A cash summary** — deposits, proceeds from sales, dividends, interest, stock lending income, fees, taxes, cost of investments, withdrawals — that reconciles independently against the activity rows.
- **The account type in plain text**, for example `Order Execution Only Spousal RRSP Account` or `Managed TFSA Account`. The current system infers type from filenames; that inference hid $8,000 of RRSP contributions until 2026-08-04.
- **Money-weighted return rates** on `PERFORMANCE` statements: current period, 1 year, 3 years, 5 years, 10 years, and since inception, alongside start balance, deposits, withdrawals, and change in market value.
- **The official statement code dictionary** on the last page, including codes the current classifier guesses at: `CLB` (Canada Learning Bond), `WDQ` (FHSA qualifying withdrawal), `HBP` (home buyers' plan redemption), `GRTRP` (grant repayment).

## Corpus

220 PDFs covering 2023-06 through 2026-07, across 14 accounts and three templates.

| Template | Files | Layout |
|---|---|---|
| `BROKERAGE` | 171 | Portfolio summary, portfolio cash, portfolio assets, activity. Managed and self-directed share this layout; self-directed adds CAD/USD columns |
| `CASH` | 28 | Consumer chequing layout. Balances and an activity table only, no holdings |
| `PERFORMANCE` | 21 | `BROKERAGE` plus a money-weighted returns block and a start/end balance summary |

Filenames follow `<ACCOUNTNO>_YYYY-MM_<TEMPLATE>.pdf` and already carry account identity and period, so monthly ingest needs no renaming. This removes the current convention where a fresh export puts the date last and silently registers a new account keyed on `01`.

The 14 PDF accounts are the real set. The CSV export produced 18 by splitting USD balances into fake separate accounts (`TFSA USD`, `USD`, `NonRegistered USD`) and carrying one two-transaction remnant. Four of the eighteen do not exist.

**Coverage is not uniform, and the CSVs hold three things the PDFs do not.** Stating it plainly, because the CSV pipeline is being deleted:

- **July 2026 exists only for the three chequing accounts.** All eleven investment accounts stop at 2026-06, while the CSVs run to 2026-07. Exporting the July PDFs before cutover avoids losing a month; until then the rebuild is a month behind the current page.
- **The credit card has no PDF export at all.** Seven CSVs exist (2026-01 to 2026-07); Wealthsimple produces no equivalent statement. It is a non-goal (see [Non-goals](#non-goals)), and the card therefore disappears from the rebuild. Deciding otherwise means keeping a narrow CSV reader for that one account.
- **Three closed accounts have CSV history and no PDFs** — two USD sub-ledgers and a two-transaction remnant. All reached $0.00 before 2025-12, so no value is lost from any current figure, but the 2023 USD deposits behind Wealthsimple's own net-deposits total ($766.39 and $1,434.97) are not recoverable from PDFs.

## Architecture

Seven stages, each a module with one job, in a Bun + TypeScript workspace.

| Stage | Input to output | Responsibility |
|---|---|---|
| `extract` | PDF to word geometry | `pdftotext -bbox-layout` via poppler, cached by file content hash so re-runs skip unchanged files |
| `geometry` | XML to `Page[]` | Words with x-extents and y, grouped per page into rows. The 2D model every parser reads |
| `parse` | rows to `Statement` | Template dispatch on the filename suffix. Transcription only, no interpretation |
| `validate` | `Statement[]` to `ReconciliationReport` | The five checks below. Never drops a statement, never silently corrects one |
| `store` | to `data/datastore.json` | Masked. Account numbers, owner name, and address never leave the extract cache |
| `analytics` | to `data/analytics.json` | Timeline series, room, grants, tax, returns, projections |
| `app` | to the UI | React views over the analytics payload |

Source PDFs stay outside the vault in a gitignored directory. Only masked derived data is committed. This keeps roughly 100MB a year of statements out of git and keeps the owner's address and account numbers out of history permanently.

### Why word geometry rather than flattened text

`pdftotext -layout` renders a statement to space-padded text, discarding coordinates and asking regexes to reconstruct columns from runs of whitespace. That fails on these documents in three ways that are not fixable by better regexes:

- **The summary block is three interleaved panels.** `Last Statement Cash Balance $116.67 · Cash Paid In Deposits $0.00 · Contributions:` is one line. Taking the last money token on the line reads $0.00 as the opening balance; taking the first reads correctly on the managed layout and wrongly on the dual-currency one.
- **The mailing address is interleaved into the table.** The portfolio summary's `Cash` row shares its line with the owner's name, and the asset-class name wraps around two address lines before continuing.
- **Column positions drift.** Sampling one statement per account per year, the market-value column sits at x=340 in 2024-01, x=349 in 2025-01, and x=346 in 2026-01. Any absolute position is wrong somewhere.

`pdftotext -bbox-layout` emits every word with its x-extent and y. Grouped per page into rows, the same block reads unambiguously: the address occupies x=55 to x=166 and the table starts at x=222, a wrapped class name is the same x two rows down, and a label's value is simply the nearest money token to its right. Positions are read relative to the label, never hardcoded, so the column drift above is irrelevant.

### Account type wording is not stable

Wealthsimple has renamed the account-type descriptor twice inside this corpus. The same TFSA reads `Tax-Free Savings Account` in 2023, `Self-directed TFSA Account` in 2026-01, and `Order Execution Only TFSA Account` in 2026-06. Twenty distinct wordings appear across 220 statements.

Two of them are traps: `Tax-Free Savings Managed Cash Account` and `First Home Savings SDI Cash Account` both contain the word "Cash" while being a TFSA and an FHSA, and the 2023 TFSA wording contains no `TFSA` token at all. A mapping keyed on obvious substrings gets both wrong.

The mapping table is therefore derived from the full corpus rather than from a sample, and an unrecognised wording throws rather than defaulting. Because account identity is the account number and an account does not change tax wrapper, kind is taken from the account's **most recent** statement and every earlier statement must agree; a disagreement is a reconciliation finding.

The descriptor also carries a second, orthogonal fact: `Managed` versus `Self-directed` / `Order Execution Only` is the management style, not the tax wrapper. `Account.managementStyle` records it, and it is what reproduces the app's Trading versus Portfolios split ($125,599.68 and $131,606.99 on 2026-06-30).

### Data model

Three levels. Each is derived from the one above it and none is hand-edited.

**`Statement`** — one per account-month, a faithful transcription of one PDF: holdings (symbol, quantity, market price, market value, book cost), cash summary in CAD and USD, contributions with the 60-day split, activity rows, FX rate, stated account type, and the source filename. The parse stage does no classification and no netting.

**`Account`** — identity and classification. Kind comes from the most recent statement's type row; `managementStyle` comes from the same row's prefix. Carries the reviewed display label (keyed by `short_id`, never by account number), a purpose tag for the purpose lens, and an `in_totals` flag.

### One account-month can have more than one document

Three rules the corpus forces, none of which is a special case:

- **Two templates, same month.** The three chequing accounts each produce both a `BROKERAGE` and a `CASH` statement for the same month — 25-plus account-months in this corpus. Continuity and coverage are therefore checked per `(account, period, template)`, never per `(account, period)`. The `CASH` document wins for a chequing account's activity; the `BROKERAGE` one supplies its portfolio total.
- **Amended statements supersede.** The 2026-06 managed RRSP statement states in terms that an amended version will be issued once a private-asset NAV is finalised. A re-issued PDF for an account-month replaces the earlier one; the later `_v_N` suffix or the later file mtime decides, and the supersession is recorded as a finding so it is visible rather than silent.
- **Coverage is per template.** An account whose `CASH` series starts later than its `BROKERAGE` series has no gap.

**`Timeline`** — the monthly series per account: market value, book cost, net deposits, contributions, grants, income split by type, realized gains, and return. Every figure the UI shows is a slice of this.

### Reconciliation

Discrepancies are surfaced as data, not swallowed and not fatal. A wrong number that is visible beats a clean dashboard that is $3,893 off with no way to find out why.

1. **Statement arithmetic.** Opening cash plus total paid in minus total paid out equals closing cash. Holdings sum to their asset-class total. Asset-class totals plus cash equal Total Portfolio. All three are printed on the page, so a drifting parse contradicts itself on the same document.
2. **Month-to-month continuity.** The prior month's closing cash equals this month's opening cash. Catches a missing month, a double-ingested month, and an amended statement replacing an earlier one.
3. **Coverage gaps.** Between an account's first and last statement, every month must be present.
4. **Cross-document agreement.** Where a `PERFORMANCE` statement covers the same account-month as a `BROKERAGE` one, their portfolio totals, cash blocks, and holdings must agree — two independent transcriptions of the same month. The `PERFORMANCE` balance summary is additionally checked against itself: start plus deposits minus withdrawals plus change in market value must equal the end balance, and that end balance must equal its own portfolio total. `BROKERAGE` statements carry no balance summary, so it cannot be compared across the pair.
5. **Ground truth.** A checked-in file of figures observed in the Wealthsimple app on a given date, starting with 2026-06-30: account value $242,019.61 and net deposits $217,514.00. The system reports its own figure, the observed figure, and the delta.

Failures render in a **Reconciliation view** listing account, period, check, expected, actual, delta, and source filename. Parse-level failures — a required field absent from a document that should carry it — fail the build, because they mean the parser is wrong rather than the data.

Genuine Wealthsimple data errors are handled in `corrections.ts`: explicit, dated, individually justified overrides. Never a silent adjustment inside the parser.

## Interface

**Bun + React + TypeScript**, run with `bun dev`. Charts are hand-built SVG on `d3-scale` rather than a chart library, because only four shapes are needed — value-over-time area, stacked contribution bars, room progress, projection lines — and library defaults produce exactly the generic appearance being replaced. Motion handles view transitions and data-change animation. The `design-taste-frontend` skill is invoked before any UI code is written.

Grouping is a toggle over one set of accounts, not three page trees:

- **By registration** — TFSA, RRSP (four accounts rolled up), FHSA, RESP, Non-registered, Corporate, Cash. Room and grants live here because CRA measures this way.
- **By account** — all 14, flat.
- **By purpose** — retirement, house, education, business, spending. Owner-declared in config; not inferable from statements.

Each wrapper view shows what that wrapper needs:

| View | Shows |
|---|---|
| RESP | CESG received, grant room remaining, $50,000 lifetime cap, Canada Learning Bond |
| RRSP | First-60-days versus rest-of-year split, assessed room from the notice of assessment, three accounts rolled up: one self-directed, one managed, one spousal (reported separately, since spousal contributions use the contributor's room) |
| FHSA | $40,000 lifetime cap, the 15-year closure deadline |
| TFSA | Lifetime room, indexed annual limit |
| Non-registered | Realized gains, dividend income by type, foreign income |
| Corporate | Held separately; excluded from the personal tax estimate |
| Cash | Present, excluded from all investment totals |

Cash accounts stay visible and excluded rather than hidden, so the ledger reads as complete and the omission reads as a choice.

## Predictions

Four features over one engine.

- **Scenario projection.** Ported from the existing `src/client/projection.ts`, not rewritten. It encodes five traps that each cost real debugging: indexation must compound an unrounded base or the TFSA pins at $7,000 forever; the FHSA has two separate endings (the $40,000 cap in 2028, closure in 2039); RESP contributions count `deposits` not `contrib`; CESG must be derived from `GRANT` rows; and the RESP annual target must be derived rather than fixed, since a flat $5,000 a year exhausts room early and forfeits roughly $1,700 of grant. A 31-row regression fixture guards it.
- **Fitted returns.** Seeded from the money-weighted return rates printed on `PERFORMANCE` statements and from market-value history, replacing a typed-in rate.
- **Goal tracking.** Goals declared in config, each showing whether current contributions reach the target and what monthly contribution would.
- **Room runway.** When each cap is reached, how much grant remains claimable and until when, and what the FHSA 2039 deadline implies.

## What survives and what is replaced

**Survives:** the projection engine and its fixture, the CRA constants, `ASSESSED_ROOM` transcribed from the 2025 notice of assessment (RRSP 2026 room of $70,752), and their tests.

**Replaced:** CSV parsing, filename-derived account classification, currency inference, the internal-versus-external transfer heuristics in `externalFlow`, and the single rendered HTML page. Those exist to work around lossy CSV exports. With PDFs they have nothing to do.

The CSV pipeline is deleted rather than kept alongside. Two parsers producing different answers for the same month is the failure mode being fixed.

## USD book cost is approximate, and always will be

Found while parsing all 192 statements: holdings plus cash reconcile to the stated portfolio **market value** everywhere except three statements, off by one to three cents from rounding the six-decimal rate. Book cost does not reconcile on 19 statements, by up to $218.92 — and every one of those 19 holds USD securities, while no CAD-only statement diverges at all.

This is a property of the source, not a parser defect. Each statement discloses one month-end rate, and its own footnote scopes that rate to *market value*. Book cost is an accumulated basis recorded at each purchase's own historical rate, so no single current rate can reconstruct it. Converting is much closer than not converting — $99 versus $1,976 of error on one sampled file — and is necessary because `bookCost` carries no currency of its own, but it is not exact.

So `Holding.bookCostConverted` marks every converted figure, and the reconciliation report separates the two cases: a book-cost divergence with no converted holding is an error, because that is a real indexing bug; a divergence with converted holdings is a warning naming the fx limitation. Phase 3's adjusted-cost-base and capital-gains work must treat a converted book cost as an estimate rather than a filing figure.

The old CSV pipeline documented the same limitation from the other direction — it could not convert USD at all, so its cost basis for USD positions was simply partial. The constraint is inherent to the data, and the rebuild narrows it rather than removing it.

## Non-goals

- Live or intraday prices. Values are month-end, from the statements.
- Filing-grade tax figures. The tax view stays an estimate with a visible disclaimer.
- Trade or order entry. Read-only.
- Any hosted or networked deployment. Local only.
- **The Wealthsimple credit card.** No PDF statement exists for it, and the CSV pipeline it currently relies on is being deleted. Spending analysis is not what this system is for.
- **Per-beneficiary RESP tracking.** The statements name no beneficiary, so a multi-beneficiary RESP cannot be split from this data. CESG is tracked at the account level against the $7,200 lifetime cap.

## Testing

Per the project standard: `bun run check` runs Biome, `tsc --noEmit`, and `bun test`, and stays at zero warnings.

- **Parsers** get fixture-based tests from redacted real statements, one per template, plus the edge cases found in the corpus: a zero-value account, a USD-column account, a single-file account, a statement with a pending-valuation disclaimer.
- **Reconciliation checks** are tested by mutation: break a figure, confirm the matching check fails. A check that cannot fail is not a check.
- **The projection engine** keeps its existing fixture as a fixed baseline. It is not regenerated from live data.
- **Full-corpus reconciliation** runs over all 220 PDFs as an integration test, asserting that every statement passes its own arithmetic check, that no unexplained coverage gap exists, and that the June 2026 account-value rollup lands within 0.5% of the recorded ground truth of $242,019.61. The tolerance exists because open question 1 is unresolved; it tightens to exact once the residual is explained.

## Open questions

Resolved during implementation, none blocking:

1. **Purpose tags per account**, owner-supplied.
2. **Goal definitions**, owner-supplied.
3. **Whether the corporate account belongs in the headline total.** It currently reconciles as if included, which is worth confirming against the app.
4. **Whether the July 2026 investment-account PDFs get exported** before the CSV pipeline is deleted.

## Resolved: the $279.94 residual

The gap between the summed statements ($241,739.67) and the app ($242,019.61) on 2026-06-30 is one unpriced holding, not a missing account and not a parsing error.

The managed RRSP's June statement is the only one in the corpus carrying a pending-valuation disclaimer: *"Pricing for this period is not yet available. The value shown reflects the last available valuation... An amended statement will be issued once the updated Net Asset Value is finalized."* The holding is `WSE401`, a private-markets fund, 1,241.7150 units priced at exactly $10.00 — the 2026-05-29 purchase price, carried forward. It was converted out of `WSE300` that day, which had traded at $15.62 in April and $15.78 in May.

If the entire residual is that one stale price, the finalised NAV is **$10.2254**, a 2.25% month. It is the only unpriced asset in the corpus, and the claim is testable: when the amended statement arrives, `WSE401` either reads $10.2254 or the explanation is wrong.

Two consequences. Reconciliation must treat a pending valuation as a known, labelled reason for a ground-truth delta rather than an unexplained error. And amended statements are not hypothetical — this corpus is going to receive one, which is why supersession is specified above rather than deferred.
