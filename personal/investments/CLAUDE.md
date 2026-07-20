# Investments project — instructions for Claude Code

Personal finance dashboard built from Wealthsimple monthly statement CSVs. A bun/TypeScript pipeline turns the raw exports into a masked datastore, analytics, and one self-contained offline HTML page (`notes/index.html`). These instructions capture hard-won findings about the data and the reporting semantics. Read them before changing analytics, prices, or the numbers shown on the page.

## Pipeline and commands

Stages: `parse -> classify -> mask -> datastore -> analytics -> render`, driven by `scripts/src/build.ts`.

- `cd scripts && bun run build` regenerates `data/datastore.json`, `data/analytics.json`, and `notes/index.html`.
- `bun run check` runs biome + `tsc --noEmit` + `bun test`. It must stay clean, zero warnings.
- The page is a single offline file. Chart.js and flatpickr are bundled into the inline client script at build time. Never add a CDN reference.
- The browser client lives in `scripts/src/client/` (`main`, `filter`, `series`, `charts`, `sections`, `format`). It is browser only, so never import `node:` modules there. It defines its own local ledger types rather than importing the node analytics types.

## Money in is net deposits, not coded contributions

This is the single most important reporting rule.

- `series[].contrib` counts only transactions Wealthsimple tagged `CONTRIB`. Most money actually enters as `TRANSFER_IN`, so `contrib` badly undercounts money the owner put in. Do not present `contrib` as total money in.
- `series[].deposits` = `CONTRIB + TRANSFER_IN + TRANSFER_OUT` (TRANSFER_OUT is negative). Summed across all accounts this is the real external money in, because internal transfers between the owner's own accounts cancel out in the total. Reference figure over full history: net deposits about $215,013 versus coded contributions about $133,971.
- The Growth section reports **net deposits** as money in, **portfolio at cost** = adjusted cost base plus cash at the window end, and **gain beyond deposits** = portfolio at cost minus net deposits (about $19,449 over full history). That gain is a cost basis figure (reinvested income and securities transferred in), not a market value.
- `contrib` is still the correct basis for the Contributions and Room section, because CRA contribution room is consumed by contributions and folding transfers in would wrongly count internal transfers between the owner's own registered accounts as fresh room use. Label that section clearly as registered contributions, not total money in.

## There is no market value in this data

The statements are transaction level only. Holdings carry `symbol`, `qty`, and `acb` (adjusted cost base), never a market price.

- A live price fetch (Yahoo chart endpoint) was built and then removed on purpose. It was unreliable: bare tickers resolve to the wrong exchange (for example `PSA` returns Public Storage US at about $315 instead of the Purpose HISA `PSA.TO` at about $50, and `L` returns Loews instead of Loblaw), which inflated market value and growth by multiples. Do not reintroduce live prices without first solving symbol to exchange disambiguation and the USD cost basis gap below.
- Growth is cost basis only by design. If asked for market value or true unrealized gain, explain that the statement data cannot support it and point to the Wealthsimple app.

## The currency field is dirty

- `transactions[].currency` is contaminated with ticker symbols and other junk, not clean ISO codes. Only about 1 of 1325 non CAD transactions carries an `fx_rate`, so per transaction FX conversion is not possible.
- Because of this, ACB and flows are computed from CAD tagged transactions only. Cost basis for USD denominated holdings (for example US stocks in the Direct Indexing or USD non registered accounts) is therefore partial and can be wrong. Do not trust per holding average cost for USD positions.
- Do not try to include non CAD transactions in flows without a real fix, or you will sum unconvertible USD amounts into CAD totals.

## Internal versus external transfers

The statements cannot distinguish an internal transfer between the owner's own accounts from an external deposit or withdrawal. Both are just `TRANSFER_IN` or `TRANSFER_OUT`.

- inflow and outflow are defined as external money only: inflow = `CONTRIB + TRANSFER_IN`, outflow = `TRANSFER_OUT`. They exclude buys, sells, dividends, interest, and fees.
- Per account, inflow and outflow still include internal transfers, so a single account's figures can overstate external money. The aggregate net (`deposits`) is the trustworthy figure because internal transfers cancel across accounts.

## Accounts are labelled by kind and id, never by name

- Account labels are `kind` plus `short_id` (for example `RRSP 97ab`, `NonRegistered 375f`). The three RRSP and two non registered accounts are distinguished by their `short_id`.
- The account name was previously derived from the statement filename and leaked real names (for example `Umar's RRSP`). Never render a person derived account name. The stored account name is now the kind, and `redactions.json` (gitignored) lists names to scrub from descriptions.

## Masking guard

- Never commit unmasked real names, account numbers, or other sensitive data. The vault pre-commit guard blocks common patterns.
- The guard scans `.html`, and the generated `notes/index.html` inlines minified flatpickr JS, so it false positives on the `sin` substring inside minified code (for example `getDaysInMonth`, `single`) plus long float mantissas. Before using `SKIP_MASK_HOOK=1` on this page, verify the strong signal is clean: the formatted SIN or card pattern check (`grep -E '\b[0-9]{3}[ -][0-9]{3}[ -][0-9]{3}\b|\b[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}[ -][0-9]{4}\b'`) must return zero and no real name from `redactions.json` may appear. Only then bypass, for that one commit.

## Tax and Room sections are filter-aware

- The Tax and Room sections respect the top scope selector, the same as every other section. The tax year they report is derived from the scope, not fixed to the current calendar year: it is the year of the last month in the resolved time window (`scopeYear` in `src/client/series.ts`), so an "All time" scope reports the latest data year and a custom range reports the range's end year.
- Income is split by currency and type: interest, Canadian eligible dividends (CAD dividends), foreign income (USD dividends). Realized gains come from sell proceeds minus average cost in taxable accounts. All four are summed only over the selected accounts, for the scope's tax year (`taxSummary` in `src/client/series.ts`).
- Room bars work the same way: `used` is `contrib` summed for the selected accounts of each registered group (TFSA, FHSA, RRSP, RESP; ManagedTFSA shares the TFSA group) within the scope's tax year, against that year's CRA limit. There is no OVER flag — unused room carries forward from prior years, so a full or over-full bar is not necessarily an over-contribution.
- The estimated tax added subtracts RRSP actually contributed this year (registered room used, for the selected accounts), not unused room. It is a rough estimate with a visible not for filing disclaimer. Never present it as a filing figure. Editing the tax rate input recomputes only the estimate figure from the last-rendered tax summary — it never triggers a full section or chart rerender.

## Cashflow flows and the transaction drill-down

- `ledger.flows` is the transaction-level backing data for the cashflow chart: every `CONTRIB` / `TRANSFER_IN` / `TRANSFER_OUT` row, each carrying `account_id`, `month`, `date`, `type`, a signed `amount` (`TRANSFER_OUT` negative), and the already-redacted `description`. It is separate from `series[].deposits`, which is the same transactions pre-summed per account-month.
- Clicking a bar on the cashflow chart drills into that period: `flowsForPeriod` (`src/client/series.ts`) filters `ledger.flows` to the clicked period and the selected accounts, split into inflow (positive amount) and outflow (negative amount). The clicked bar's label is the period key already — a full month ("YYYY-MM") in month grain, or a bare year ("YYYY") in year grain (the default "All time" view, once the window exceeds 24 months) — and matching is by `flow.month.startsWith(period)`, so a year period matches every month in it. `sections.ts` renders the result into a `<details id="cashflow-drill">` below the chart and opens it. Changing the filter resets the drill-down to collapsed and empty rather than showing a stale period.

## Design and docs

- The spec and implementation plan live in `docs/superpowers/`.
- The shared stylesheet is `../_assets/personal.css`. New investment styles are namespaced (`fbx-` for the filter, `pillar-` and section classes). Do not modify selectors used by other personal pages.
