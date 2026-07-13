# Personal Investments Analyzer — Design

Date: 2026-07-13
Endeavor: `personal/investments/`
Status: approved design, pre-implementation

## Purpose

Turn ~183 Wealthsimple monthly statement CSVs (2022-01 to 2026-07, spanning ~20 accounts) into a single normalized, privacy-masked JSON datastore, then build styled self-contained HTML pages on top to understand the money and support future investment analysis. The datastore is the source of truth; the HTML pages are views. The design keeps the datastore rich enough that new visualizations are just new views over the same data.

## Source data

Location (outside the vault, never committed): `~/Downloads/monthly-statements-2022-01-to-2026-07/`.

Two CSV schemas:

1. Account statements — `date, transaction, description, amount, balance, currency`. Applies to all investment and cash accounts.
2. Credit card — `transaction_date, post_date, type, details, amount, currency`.

Real account codes live in the filenames (the trailing alphanumeric token). Personal names appear inside descriptions and account labels (owner and family first/last names, and possessive account labels like "<name>'s RRSP").

Accounts observed (by label): Managed (TFSA), TFSA, Home (FHSA), Chequing, RRSP, Direct Indexing (USD), a personal RRSP, PE, Non-registered, xyzbytes, US dollars, Family-RESP, a spousal RRSP, Savings, Crypto, Wealthsimple credit card.

Transaction codes present (counts, whole corpus): BUY 2978, DIV 1147, LOAN 759, RECALL 745, NRT 671, SELL 652, TRFOUT 187, CONT 130, FEE 103, TRFIN 90, FPLINT 76, FXCONVERSION 55, TRFOUTTF 36, AFT_IN 25, TRFINTF 24, E_TRFIN 24, STKREORG 16, EFT 12, STKDIV 6, REIMB 6, SPEND 5, CASHBACK 5, REFER 4, INT 3, GRANT 3, E_TRFOUT 3. Some descriptions contain embedded commas and newlines, so parsing MUST use Python's `csv` module (proper quoted multi-line field handling), never line/awk splitting.

Key signals:
- `CONT` = explicit contribution — contributions are directly coded, not inferred.
- `GRANT` = RESP government grant (CESG) — tracked separately for RESP.
- `LOAN`/`RECALL` = securities lending, zero amount — captured as their own type, excluded from cash flow.

## Folder structure

```
personal/investments/
  README.md              thin index (type: personal, personal: investments, #personal/investments)
  log/2026-07-13.md      session log
  scripts/
    build.py             reusable CSV -> JSON -> HTML pipeline
    redactions.json      configurable name/redaction list
  data/
    datastore.json       normalized source of truth (masked)
    analytics.json       precomputed aggregations for the pages
  notes/
    index.html           overview dashboard
    growth.html          balances / approximate net worth over time
    contributions.html   per-year, per-account contributions + registered rollups
    cash-flow.html       deposits, withdrawals, transfers, savings rate
    income.html          dividends, interest, distributions
    holdings.html        holdings + allocation
personal/_assets/personal.css   shared stylesheet (vault convention)
```

`personal/investments/` is a journal-only personal endeavor: no orchestrator, no board, no `/obsidian-loop`. The build script is a supporting tool, not a tracked code project.

## Privacy and masking

Decision: masked everywhere, real codes never persisted.

- Real account codes -> stable masked id derived by hashing the real code (e.g. `acct_a1b2`). Same account always maps to the same id across rebuilds. The real code is used only in memory during a build and is never written to any committed file.
- Personal names in descriptions and account labels -> redacted to a marker via a data-driven list. The real list lives in `scripts/redactions.json`, which is gitignored so the actual names never enter git; a placeholder `scripts/redactions.example.json` is committed, and the build fails fast if the real file is missing.
- Kept (not sensitive per vault policy, and the analytical value): dates, amounts, balances, quantities, prices, FX rates, holding symbols, merchant names on card purchases. No SIN/passport/card-number patterns occur in this data.
- The vault `pre-commit` guard remains authoritative; nothing here bypasses it.

## Data model — `datastore.json`

- `meta`: `{ generated_at, source_range, schema_version, file_count, txn_count }`
- `accounts[]`: `{ masked_id, kind, currency, first_activity, last_activity, txn_count }`
  - `kind` in { TFSA, FHSA, RRSP, RESP, ManagedTFSA, DirectIndexing, NonRegistered, Chequing, Savings, USD, Crypto, PE, CreditCard, Other }. Registered-type detection comes from account label + code, not guesswork. `Home` -> FHSA (confirm against its transactions during build).
- `transactions[]`: `{ account_id, date, post_date?, type, raw_type, symbol?, quantity?, unit_price?, fx_rate?, amount, balance?, currency, description_redacted }`
  - `type` is normalized: BUY, SELL, DIV, STKDIV, INT (incl. FPLINT), FEE, TAX (NRT), CONTRIB (CONT), GRANT, TRANSFER_IN, TRANSFER_OUT, FX, LENDING (LOAN/RECALL), REORG (STKREORG), CARD_PURCHASE, CARD_PAYMENT, REWARD (CASHBACK/REIMB/REFER/SPEND), OTHER.
  - `symbol`, `quantity`, `unit_price`, `fx_rate` parsed from description via regex where present.

## Analytics — `analytics.json`

Precomputed so pages stay simple (pure render, no heavy JS math):

- Monthly cash flow per account and combined; savings rate.
- Cumulative contributions.
- Contributions block (first-class): per account x per calendar year totals, plus rollups grouped by registered type (TFSA, FHSA, RRSP, RESP) and non-registered separately. Contributions are the explicitly coded `CONT` transactions only; internal transfers between the owner's own accounts are not counted, so registered-room usage is not overstated. RESP `GRANT` tracked as its own line. Yearly totals shown next to the known annual contribution figure for the account type as labelled context (available room depends on prior-year carryforward not present in this data; the RESP figure is the CESG-matched annual amount, not the lifetime limit).
- Income: dividends, interest, distributions by month and by holding; passive-income trend.
- Holdings: current holdings derived from BUY/SELL/STKDIV, allocation by account and asset, and total buy-side outlay per holding (labelled as such, not an adjusted cost base after sells).
- Balance / market-value trend: exact for cash accounts; approximate for investment accounts (only valued-at prices embedded in descriptions are available, not daily marks). Clearly labelled approximate wherever shown.

## HTML output and design

- Direction: high-end premium dashboard (design-taste-frontend / high-end-visual-design). One design skill only, not stacked.
- Self-contained HTML: inline SVG charts + vanilla JS, no external CDNs, renders offline and in-browser.
- Charts follow the `dataviz` skill for palette and accessibility (light/dark safe).
- Light/dark toggle. One shared stylesheet at `personal/_assets/personal.css` referenced as `../../_assets/personal.css`.
- Thin `README.md` index links the pages (relative links + wikilinks) so Obsidian graph, search, and Dataview resolve.

## Pipeline — `scripts/build.py`

- Python 3.13, `uv` venv, standard library only (`csv`, `json`, `hashlib`, `re`, `pathlib`, `datetime`). `ruff` clean, `ty` clean.
- Reusable and idempotent: re-run whenever new statements are dropped into the source directory. Rebuilds `datastore.json` + `analytics.json` and regenerates the HTML pages.
- Steps: discover CSVs -> detect schema -> parse (csv module) -> classify + extract fields -> mask + redact -> deduplicate -> write datastore -> compute analytics -> render HTML.
- No deduplication: monthly statements never overlap in date range, and legitimately identical rows recur within a single statement (repeated NRT/DIV/FEE lines), so a content-based dedup key would drop real transactions. Every parsed data row is kept, guarded by a row-count reconciliation at build time.
- All monetary aggregations are keyed by currency so CAD and USD amounts (the Direct Indexing and US-dollar accounts carry USD rows) are never summed together.
- Fails fast with a clear message on an unrecognized schema, an unmapped account family, or a missing local `redactions.json`. Unmapped transaction codes are collected and reported rather than silently dropped.
- Source directory path is a constant near the top of the script, easy to change.

## Non-goals

- No live brokerage API or price feed; analysis is bounded to what the statements contain.
- No precise daily net-worth line (data does not support it); approximate market value only, labelled as such.
- No orchestrator/board integration; this is a journal-only personal endeavor.

## Verification

- Row-count reconciliation: sum of parsed transactions equals sum of data rows across all CSVs (accounting for multi-line fields).
- Spot-check: contributions total for one account/year matches a manual sum of its `CONT` rows.
- No real account code string appears anywhere under `personal/investments/` after a build (grep check).
- Pages open in a browser and render charts with JS disabled falling back gracefully where feasible.
- `ruff check` and `ty check` clean on `build.py`.
