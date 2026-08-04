---
title: "Investments rebuild: PDF statements as the source of truth"
tags: [personal/investments, decision]
created: 2026-08-04
updated: 2026-08-04
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

The PDFs remove all four causes. Summing the eleven investment accounts from their June 2026 statements gives **$241,739.67 against the app's $242,019.61**, a 0.12% gap, with no tuning. Section [Open questions](#open-questions) covers the residual.

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

## Architecture

Six stages, each a module with one job, in a Bun + TypeScript workspace.

| Stage | Input to output | Responsibility |
|---|---|---|
| `extract` | PDF to text | `pdftotext -layout` via poppler, cached by file content hash so re-runs skip unchanged files |
| `parse` | text to `Statement` | Template dispatch on the filename suffix. Transcription only, no interpretation |
| `validate` | `Statement[]` to `ReconciliationReport` | The five checks below. Never drops a statement, never silently corrects one |
| `store` | to `data/datastore.json` | Masked. Account numbers, owner name, and address never leave the extract cache |
| `analytics` | to `data/analytics.json` | Timeline series, room, grants, tax, returns, projections |
| `app` | to the UI | React views over the analytics payload |

Source PDFs stay outside the vault in a gitignored directory. Only masked derived data is committed. This keeps roughly 100MB a year of statements out of git and keeps the owner's address and account numbers out of history permanently.

### Data model

Three levels. Each is derived from the one above it and none is hand-edited.

**`Statement`** — one per account-month, a faithful transcription of one PDF: holdings (symbol, quantity, market price, market value, book cost), cash summary in CAD and USD, contributions with the 60-day split, activity rows, FX rate, stated account type, and the source filename. The parse stage does no classification and no netting.

**`Account`** — identity and classification. Type comes from the statement text. Carries the reviewed display label (keyed by `short_id`, never by account number), a purpose tag for the purpose lens, and an `in_totals` flag.

**`Timeline`** — the monthly series per account: market value, book cost, net deposits, contributions, grants, income split by type, realized gains, and return. Every figure the UI shows is a slice of this.

### Reconciliation

Discrepancies are surfaced as data, not swallowed and not fatal. A wrong number that is visible beats a clean dashboard that is $3,893 off with no way to find out why.

1. **Statement arithmetic.** Opening cash plus total paid in minus total paid out equals closing cash. Holdings sum to their asset-class total. Asset-class totals plus cash equal Total Portfolio. All three are printed on the page, so a drifting parse contradicts itself on the same document.
2. **Month-to-month continuity.** The prior month's closing cash equals this month's opening cash. Catches a missing month, a double-ingested month, and an amended statement replacing an earlier one.
3. **Coverage gaps.** Between an account's first and last statement, every month must be present.
4. **Cross-document agreement.** Where a `PERFORMANCE` statement covers the same account-month as a `BROKERAGE` one, their start balance, deposits, withdrawals, and end balance must agree. Two independent transcriptions checked against each other.
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
| RRSP | First-60-days versus rest-of-year split, assessed room from the notice of assessment, four accounts rolled up |
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

## Non-goals

- Live or intraday prices. Values are month-end, from the statements.
- Filing-grade tax figures. The tax view stays an estimate with a visible disclaimer.
- Trade or order entry. Read-only.
- Any hosted or networked deployment. Local only.

## Testing

Per the project standard: `bun run check` runs Biome, `tsc --noEmit`, and `bun test`, and stays at zero warnings.

- **Parsers** get fixture-based tests from redacted real statements, one per template, plus the edge cases found in the corpus: a zero-value account, a USD-column account, a single-file account, a statement with a pending-valuation disclaimer.
- **Reconciliation checks** are tested by mutation: break a figure, confirm the matching check fails. A check that cannot fail is not a check.
- **The projection engine** keeps its existing fixture as a fixed baseline. It is not regenerated from live data.
- **Full-corpus reconciliation** runs over all 220 PDFs as an integration test, asserting that every statement passes its own arithmetic check, that no unexplained coverage gap exists, and that the June 2026 account-value rollup lands within 0.5% of the recorded ground truth of $242,019.61. The tolerance exists because open question 1 is unresolved; it tightens to exact once the residual is explained.

## Open questions

Resolved during implementation, none blocking:

1. **The residual $279.94** between the summed statements ($241,739.67) and the app ($242,019.61) on 2026-06-30. Candidates: an account with no PDF export, crypto staking held outside the portfolio total, or a timing difference in the app's own figure. The reconciliation view exists to answer questions of exactly this shape.
2. **Purpose tags per account**, owner-supplied.
3. **Goal definitions**, owner-supplied.
4. **Whether the corporate account belongs in the headline total.** It currently reconciles as if included, which is worth confirming against the app.
