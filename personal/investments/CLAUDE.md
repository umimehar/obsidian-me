# Investments project — instructions for Claude Code

Personal finance dashboard built from Wealthsimple monthly statement CSVs. A bun/TypeScript pipeline turns the raw exports into a masked datastore, analytics, and one self-contained offline HTML page (`notes/index.html`). These instructions capture hard-won findings about the data and the reporting semantics. Read them before changing analytics, prices, or the numbers shown on the page.

## Pipeline and commands

Stages: `parse -> classify -> mask -> datastore -> analytics -> render`, driven by `scripts/src/build.ts`.

- `cd scripts && bun run build` regenerates `data/datastore.json`, `data/analytics.json`, and `notes/index.html`.
- `bun run check` runs biome + `tsc --noEmit` + `bun test`. It must stay clean, zero warnings.
- The page is a single offline file. Chart.js and flatpickr are bundled into the inline client script at build time. Never add a CDN reference.
- The browser client lives in `scripts/src/client/` (`main`, `filter`, `series`, `charts`, `sections`, `format`). It is browser only, so never import `node:` modules there. It defines its own local ledger types rather than importing the node analytics types.

## Money in is external money, not coded contributions

This is the single most important reporting rule.

- `series[].contrib` counts only transactions Wealthsimple tagged `CONTRIB`. Most money actually enters as `TRANSFER_IN`, so `contrib` badly undercounts money the owner put in. Do not present `contrib` as total money in. It is kept only as a reference figure.
- `series[].external_in` and `series[].external_out` are the classified external money movements, computed by `externalFlow` in `src/analytics.ts` (see "External versus internal transfers" below). `external_in` is the true contribution basis, the money genuinely added from outside, including CONTRIB plus every external deposit that Wealthsimple coded as TRANSFER_IN. `series[].deposits` = `external_in + external_out` (external_out is negative), the net external money in for that account-month.
- The Growth section reports **net deposits** (`deposits`, summed across the scope) as money in, **portfolio at cost** = adjusted cost base plus cash at the window end, and **gain beyond deposits** = portfolio at cost minus net deposits. That gain is a cost basis figure (reinvested income and securities transferred in), not a market value.
- Room / contribution figures in the Contributions and Room section use `external_in`, not `contrib`, summed for the scoped accounts of each registered group in the tax year (`taxSummary` in `src/client/series.ts`). Reference figure: RRSP `external_in` for 2026 is about $44,666, for 2025 about $47,000.

## There is no market value in this data

The statements are transaction level only. Holdings carry `symbol`, `qty`, and `acb` (adjusted cost base), never a market price.

- A live price fetch (Yahoo chart endpoint) was built and then removed on purpose. It was unreliable: bare tickers resolve to the wrong exchange (for example `PSA` returns Public Storage US at about $315 instead of the Purpose HISA `PSA.TO` at about $50, and `L` returns Loews instead of Loblaw), which inflated market value and growth by multiples. Do not reintroduce live prices without first solving symbol to exchange disambiguation and the USD cost basis gap below.
- Growth is cost basis only by design. If asked for market value or true unrealized gain, explain that the statement data cannot support it and point to the Wealthsimple app.

## The currency field is dirty

- `transactions[].currency` is contaminated with ticker symbols and other junk, not clean ISO codes. Only about 1 of 1325 non CAD transactions carries an `fx_rate`, so per transaction FX conversion is not possible.
- Because of this, ACB and flows are computed from CAD tagged transactions only. Cost basis for USD denominated holdings (for example US stocks in the Direct Indexing or USD non registered accounts) is therefore partial and can be wrong. Do not trust per holding average cost for USD positions.
- Do not try to include non CAD transactions in flows without a real fix, or you will sum unconvertible USD amounts into CAD totals.

## Internal versus external transfers

The coded `type` alone cannot distinguish an internal transfer between the owner's own accounts from an external bank deposit or withdrawal. Both are just `TRANSFER_IN` or `TRANSFER_OUT`. The original statement code, `raw_type`, can, and `externalFlow` in `src/analytics.ts` is the single place this classification happens.

A `CONTRIB` transaction is always external in.

A `TRANSFER_IN` is external in only when its `raw_type` is `EFT`, `AFT_IN`, `E_TRFIN`, `DEP`, or `TRFIN`: a bank EFT, a direct deposit, an e-transfer received, a generic deposit, or a code for a money transfer into the account.

A `TRANSFER_OUT` is external out only when its `raw_type` is `E_TRFOUT` or `P2P_SENT`, or its redacted description matches "money transfer out" or "e-transfer".

Every other `TRANSFER_IN`/`TRANSFER_OUT` is internal and excluded from all external/contribution figures. In practice this is `TRFINTF`, `TRFOUTTF`, and a generic `TRFOUT` ("Transfer out" or "Transfer out to <account>").

`inflow`, `outflow`, `deposits`, and `flows` are now external-only: inflow = `external_in`, outflow = `external_out`, deposits = `external_in + external_out`, and `flows` (the cashflow drill-down data) contains only the external transactions. They exclude buys, sells, dividends, interest, fees, and internal transfers between the owner's own accounts.

There is a hub-account caveat worth keeping in mind. Per-account `external_in` counts money that entered that account externally even if it was later moved internally to fund another account. A routing or hub account can therefore look artificially high, because the money it forwarded on internally is not subtracted back out (that onward leg is coded as an internal `TRFOUT` and excluded). The aggregate total for the scoped accounts is still the right figure to read; a single hub account's number in isolation is not.

## Accounts are labelled by kind and id, never by name

- Account labels are `kind` plus `short_id` (for example `RRSP 97ab`, `NonRegistered 375f`). The three RRSP and two non registered accounts are distinguished by their `short_id`.
- The account name was previously derived from the statement filename and leaked real names (for example `Umar's RRSP`). Never render a person derived account name. The stored account name is now the kind, and `redactions.json` (gitignored) lists names to scrub from descriptions.

## Masking guard

- Never commit unmasked real names, account numbers, or other sensitive data. The vault pre-commit guard blocks common patterns.
- The guard scans `.html`, and the generated `notes/index.html` inlines minified flatpickr JS, so it false positives on the `sin` substring inside minified code (for example `getDaysInMonth`, `single`) plus long float mantissas. Before using `SKIP_MASK_HOOK=1` on this page, verify the strong signal is clean: the formatted SIN or card pattern check (`grep -E '\b[0-9]{3}[ -][0-9]{3}[ -][0-9]{3}\b|\b[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}[ -][0-9]{4}\b'`) must return zero and no real name from `redactions.json` may appear. Only then bypass, for that one commit.

## Tax and Room sections are filter-aware

- The Tax and Room sections respect the top scope selector, the same as every other section. The tax year they report is derived from the scope, not fixed to the current calendar year: it is the year of the last month in the resolved time window (`scopeYear` in `src/client/series.ts`), so an "All time" scope reports the latest data year and a custom range reports the range's end year.
- Income is split by currency and type: interest, Canadian eligible dividends (CAD dividends), foreign income (USD dividends). Realized gains come from sell proceeds minus average cost in taxable accounts. All four are summed only over the selected accounts, for the scope's tax year (`taxSummary` in `src/client/series.ts`).
- Room bars work the same way: `used` is `external_in` summed for the selected accounts of each registered group (TFSA, FHSA, RRSP, RESP; ManagedTFSA shares the TFSA group) within the scope's tax year, against that year's CRA limit. Using `external_in` rather than `contrib` means an external deposit that Wealthsimple coded as TRANSFER_IN rather than CONTRIB still counts as room used. There is no OVER flag — unused room carries forward from prior years, so a full or over-full bar is not necessarily an over-contribution.
- The estimated tax added subtracts RRSP actually contributed this year (registered room used, for the selected accounts), not unused room. It is a rough estimate with a visible not for filing disclaimer. Never present it as a filing figure. Editing the tax rate input recomputes only the estimate figure from the last-rendered tax summary — it never triggers a full section or chart rerender.

## Cashflow flows and the transaction drill-down

- `ledger.flows` is the transaction-level backing data for the cashflow chart: every external `CONTRIB` / `TRANSFER_IN` / `TRANSFER_OUT` row (see "External versus internal transfers" above; internal transfers between the owner's own accounts are excluded), each carrying `account_id`, `month`, `date`, `type`, a signed `amount` (`TRANSFER_OUT` negative), and the already-redacted `description`. It is separate from `series[].deposits`, which is the same external transactions pre-summed per account-month.
- Clicking a bar on the cashflow chart drills into that period: `flowsForPeriod` (`src/client/series.ts`) filters `ledger.flows` to the clicked period and the selected accounts, split into inflow (positive amount) and outflow (negative amount). The clicked bar's label is the period key already — a full month ("YYYY-MM") in month grain, or a bare year ("YYYY") in year grain (the default "All time" view, once the window exceeds 24 months) — and matching is by `flow.month.startsWith(period)`, so a year period matches every month in it. `sections.ts` renders the result into a `<details id="cashflow-drill">` below the chart and opens it. Changing the filter resets the drill-down to collapsed and empty rather than showing a stale period.

## Design and docs

- The spec and implementation plan live in `docs/superpowers/`.
- The shared stylesheet is `../_assets/personal.css`. New investment styles are namespaced (`fbx-` for the filter, `pillar-` and section classes). Do not modify selectors used by other personal pages.
