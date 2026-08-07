# Investments project — instructions for Claude Code

> **Being rebuilt (from 2026-08-05).** Everything below describes the **CSV pipeline** in `scripts/`, which still runs and is still the source of `notes/index.html`. A replacement built on **PDF statements** is under construction in `app/` — see `docs/superpowers/specs/2026-08-04-investments-rebuild-design.md`.
>
> Several findings below are **true of the CSVs and false of the PDFs**. Do not apply them to `app/`:
>
> - *"There is no market value in this data"* — the PDFs state market price, market value and book cost per holding, with the exchange already resolved (`PSA` prices at $50.01 CAD, the Purpose HISA, not the $315 US namesake). The ticker-disambiguation problem does not exist there.
> - *"The currency field is dirty"* — the PDFs print a month-end conversion rate and split cash into CAD and USD columns.
> - *Filename-derived account kind* — the PDFs state the account type in plain text. Note it has been **renamed twice**: the same TFSA reads `Tax-Free Savings Account` in 2023, `Self-directed TFSA Account` in 2026-01, and `Order Execution Only TFSA Account` in 2026-06.
>
> When the rebuild replaces the page, delete `scripts/` and everything below this banner.

## The dashboard app's gates (`app/`)

Two commands, and they are deliberately not one.

- `bun run check` — biome, `tsc --noEmit`, `bun test`. The per-commit gate. It must stay clean and it runs in about ten seconds.
- `bun run contrast` — renders the dashboard in Chromium on all six tabs in both themes and **measures** the WCAG AA contrast of every rendered run of text against the opaque colour actually painted behind it. About fifteen seconds, and it needs a browser: `bunx playwright install chromium` once, then `bun run contrast`. Run it before shipping anything that changes a colour, a font size, a font weight, or adds a badge, a callout or a chart label.

It is out of `bun run check` on purpose. Folding a browser launch and a dev server into the gate that runs on every commit trades ten seconds for twenty-five, on every commit, to catch a class of regression that only a colour change can cause. The cost is that a colour change with no `bun run contrast` behind it can land green; that is what the line above exists to prevent.

`src/ui/App.a11y.test.tsx` asserts that every soft badge carries `highContrast`. That is a **proxy**, and its own comment says so: happy-dom resolves no stylesheet, so no ratio is computable there. It catches the prop being deleted. It cannot catch a Radix accent scale shifting a step, or a new badge in a colour nobody swept. `bun run contrast` is the check that can, and the two are not redundant.

The colour arithmetic lives in `src/tools/contrast/color.ts` and `audit.ts` and is unit tested; only `collect.ts` runs in the page, and it measures nothing — it reports computed strings so the maths stays testable without a browser. Radix paints most surfaces in alpha steps (`--gray-a2`, `--jade-a3`) and every SVG chart label in `--gray-a11`, so reading one parent's `background-color` gives a translucent colour and a wrong answer; the ancestor chain is composited instead. Large text is 24px, or 18.66px at weight 700 — not 18.66px at any weight, which would drop the requirement from 4.5 to 3.0 and pass real failures.

Personal finance dashboard built from Wealthsimple monthly statement CSVs. A bun/TypeScript pipeline turns the raw exports into a masked datastore, analytics, and one self-contained offline HTML page (`notes/index.html`). These instructions capture hard-won findings about the data and the reporting semantics. Read them before changing analytics, prices, or the numbers shown on the page.

## Pipeline and commands

Stages: `parse -> classify -> mask -> datastore -> analytics -> render`, driven by `scripts/src/build.ts`.

- `cd scripts && bun run build` regenerates `data/datastore.json`, `data/analytics.json`, and `notes/index.html`. It reads `~/Downloads/monthly-statements-2022-01-to-2026-07` (`DEFAULT_SOURCE` in `src/build.ts`).
- Filenames carry the account identity, so new statements must be renamed into the stored convention before they land in the source directory: `<Label>-YYYY-MM-01-monthly-statement-transactions-<CODE>.csv`. Fresh Wealthsimple exports put the date last instead (`<Label>-monthly-statement-transactions-<CODE>-YYYY-MM-01.csv`), and `accountCodeFromFilename` matches the trailing `-([A-Za-z0-9]+)\.csv`, so an unrenamed file silently registers a new account keyed on `01` rather than merging into the real one. Credit card exports arrive as a bare `credit-card-statement-transactions-YYYY-MM-01.csv` and belong under the `Wealthsimple-credit-card-YYYY-MM-01-credit-card-statement-transactions-ca-credit-card-<CODE>.csv` name.
- Statement periods do not overlap and must not be made to. Account statements are calendar months; credit card statements run on a billing cycle (roughly the 23rd to the 23rd), so a July card export legitimately contains late-June rows that are absent from the June export. Check the closing and opening balances line up before adding a month.
- `bun run check` runs biome + `tsc --noEmit` + `bun test`. It must stay clean, zero warnings.
- The page is a single offline file. Chart.js and flatpickr are bundled into the inline client script at build time. Never add a CDN reference.
- The browser client lives in `scripts/src/client/` (`main`, `filter`, `series`, `charts`, `sections`, `format`). It is browser only, so never import `node:` modules there. It defines its own local ledger types rather than importing the node analytics types.

## Money in is external money, not coded contributions

This is the single most important reporting rule.

- `series[].contrib` counts only transactions Wealthsimple tagged `CONTRIB`. Most money actually enters as `TRANSFER_IN`, so `contrib` badly undercounts money the owner put in. Do not present `contrib` as total money in. It is kept only as a reference figure.
- `series[].external_in` and `series[].external_out` are the classified external money movements, computed by `externalFlow` in `src/analytics.ts` (see "External versus internal transfers" below). `external_in` is GROSS external money into an account (CONTRIB plus external deposits coded TRANSFER_IN). It double counts through a hub account that routes deposits onward, so it drives ONLY the cashflow chart and drill-down, never contributions/room or total money in. It was tried as the room basis and reverted because a routing RRSP inflated 2026 RRSP from the real $33,000 to $52,666.
- `series[].deposits` is the money-in figure and is NOT `external_in + external_out`. It is the net of every transfer: CONTRIB plus all TRANSFER_IN plus all TRANSFER_OUT (`DEPOSIT_TYPES` in `src/analytics.ts`), so internal transfers between the owner's own accounts appear as a matching out and in that cancel across accounts. Summed across all accounts this is the true net external money in, about $214,991, without the hub double counting.
- The Growth section reports **net deposits** (`deposits`, summed across the scope) as money in, **portfolio at cost** = adjusted cost base plus cash at the window end, and **gain beyond deposits** = portfolio at cost minus net deposits. That gain is a cost basis figure (reinvested income and securities transferred in), not a market value.
- Room / contribution figures in the Contributions and Room section use `contrib` (the CONTRIB-tagged contributions), summed for the scoped accounts of each registered group in the tax year (`taxSummary` in `src/client/series.ts`). Reference figure: RRSP `contrib` for 2026 is $33,000 against a $33,810 limit, for 2025 $15,000 ($48,000 total). This deliberately excludes routing-hub deposits, so it stays under the annual limit and matches what actually landed as contributions.

## There is no market value in this data (CSV pipeline only)

**Scope: this section is about the CSV exports read by `scripts/`. The PDF statements read by `app/` do carry market prices — see the banner at the top.**

The CSV exports are transaction level only. Holdings carry `symbol`, `qty`, and `acb` (adjusted cost base), never a market price.

- A live price fetch (Yahoo chart endpoint) was built and then removed on purpose. It was unreliable: bare tickers resolve to the wrong exchange (for example `PSA` returns Public Storage US at about $315 instead of the Purpose HISA `PSA.TO` at about $50, and `L` returns Loews instead of Loblaw), which inflated market value and growth by multiples. Do not reintroduce live prices without first solving symbol to exchange disambiguation and the USD cost basis gap below.
- Growth is cost basis only by design. If asked for market value or true unrealized gain, explain that the statement data cannot support it and point to the Wealthsimple app.

## The currency field is dirty (CSV pipeline only)

- `transactions[].currency` is contaminated with ticker symbols and other junk, not clean ISO codes. Only about 1 of 1325 non CAD transactions carries an `fx_rate`, so per transaction FX conversion is not possible.
- Because of this, ACB and flows are computed from CAD tagged transactions only. Cost basis for USD denominated holdings (for example US stocks in the Direct Indexing or USD non registered accounts) is therefore partial and can be wrong. Do not trust per holding average cost for USD positions.
- Do not try to include non CAD transactions in flows without a real fix, or you will sum unconvertible USD amounts into CAD totals.

## Internal versus external transfers

The coded `type` alone cannot distinguish an internal transfer between the owner's own accounts from an external bank deposit or withdrawal. Both are just `TRANSFER_IN` or `TRANSFER_OUT`. The original statement code, `raw_type`, can, and `externalFlow` in `src/analytics.ts` is the single place this classification happens.

A `CONTRIB` transaction is always external in.

A `TRANSFER_IN` is external in only when its `raw_type` is `EFT`, `AFT_IN`, `E_TRFIN`, `DEP`, or `TRFIN`: a bank EFT, a direct deposit, an e-transfer received, a generic deposit, or a code for a money transfer into the account.

A `TRANSFER_OUT` is external out only when its `raw_type` is `E_TRFOUT` or `P2P_SENT`, or its redacted description matches "money transfer out" or "e-transfer".

Every other `TRANSFER_IN`/`TRANSFER_OUT` is internal and excluded from all external/contribution figures. In practice this is `TRFINTF`, `TRFOUTTF`, and a generic `TRFOUT` ("Transfer out" or "Transfer out to <account>").

`inflow`, `outflow`, and `flows` are external-only: inflow = `external_in`, outflow = `external_out`, and `flows` (the cashflow drill-down data) contains only the external transactions. They exclude buys, sells, dividends, interest, fees, and internal transfers between the owner's own accounts. `deposits` is the exception: it nets all transfers (see the money-in rule above), so it is not external-only and is not `inflow + outflow`.

There is a hub-account caveat worth keeping in mind. Per-account `external_in` counts money that entered that account externally even if it was later moved internally to fund another account. A routing or hub account can therefore look artificially high, because the money it forwarded on internally is not subtracted back out (that onward leg is coded as an internal `TRFOUT` and excluded). The aggregate total for the scoped accounts is still the right figure to read; a single hub account's number in isolation is not.

## Some accounts are visible but not selectable

`isDisabledAccount` in `src/client/filter.ts` marks accounts that stay in the filter list but cannot be selected: the `DISABLED_KINDS` (Chequing, Savings, CreditCard, USD) plus `DISABLED_SHORT_IDS` (375f). Day-to-day banking is not investing, and including it distorts portfolio-at-cost and money-in without saying anything about the portfolio.

- They are **disabled, not hidden**, on purpose. A hidden account reads as missing data; a greyed one shows the ledger is complete and the omission is a choice.
- `allIds` in `createFilter` excludes them, so "All accounts" resolves to the selectable set and every section's scope excludes them by default. The scope summary counts only selectable accounts.
- A group whose every member is disabled has its own header checkbox disabled, and `toggleGroup` skips disabled members.
- A restored URL naming a disabled account is stripped in `withoutDisabled`, not in `url.ts` — the URL module has no business knowing which accounts are selectable.

## Account labels

- Named accounts render their name; everything else falls back to `kind` plus `short_id` (for example `NonRegistered 375f`). `accountLabel` in `src/client/format.ts` is the single place that composes a label, so the filter chips, charts, and detail table cannot drift apart.
- The names live in `ACCOUNT_LABELS` in `src/datastore.ts`, keyed by **`short_id`** — the 4-char hash prefix the page already shows. Never key them by the real account number, which must never reach source control.
- The owner asked for real names (2026-08-04) to tell four RRSPs apart, superseding the earlier blanket ban on person-derived names. Those names now render and are committed with the built page. The ban existed because names were once derived automatically from statement filenames; the point stands that nothing should be **derived** from a filename, but a deliberate, reviewed label is fine. `redactions.json` still scrubs names out of transaction descriptions, which is a separate concern.
- `ACCOUNT_KINDS` in `src/datastore.ts` overrides the filename-derived kind, also keyed by `short_id`. Only one entry today: **91b8 is `Corporate`**, a corporate investing account. It arrived as `Other` because its filename is a company name, and `Other` sits in `TAXABLE_KINDS` — so its investment income was feeding the **personal** tax estimate. Investment income inside a corporation is taxed in the corporation and only reaches the owner when dividended out, so `Corporate` is deliberately absent from `TAXABLE_KINDS` in `analytics.ts` and from the client copies in `sections.ts`/`filter.ts`. It keeps its own filter group rather than falling through to Cash. Correcting this dropped 2026 eligible dividends from $645 to $202.
- The statements whose filenames start with `PE-` are an RRSP, not a taxable account. `detectKind` in `src/mask.ts` maps them to `RRSP` and they are excluded from `TAXABLE_KINDS`. The evidence: the hub account labels its funding transfers to them "Transfer out to RRSP" (the $8,000 on 2026-05-06), and their deposits arrive tagged `CONT`. Without that mapping the 2026 RRSP room bar undercounts by $8,000 and 2025 by $12,000.


## Masking guard

- Never commit unmasked account numbers or other sensitive data. There is **no** pre-commit guard in this vault any more, so the check is manual: inspect the staged diff before every commit.
- The guard scans `.html`, and the generated `notes/index.html` inlines minified flatpickr JS, so it false positives on the `sin` substring inside minified code (for example `getDaysInMonth`, `single`) plus long float mantissas. Check the strong signal directly: the formatted SIN or card pattern check (`grep -E '\b[0-9]{3}[ -][0-9]{3}[ -][0-9]{3}\b|\b[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}[ -][0-9]{4}\b'`) must return zero, and no name from `redactions.json` may appear in the built page. Deliberate account labels (see Account labels above) are expected and are not a leak.

## Tax and Room sections are filter-aware

- The Tax and Room sections respect the top scope selector, the same as every other section. The tax year they report is derived from the scope, not fixed to the current calendar year: it is the year of the last month in the resolved time window (`scopeYear` in `src/client/series.ts`), so an "All time" scope reports the latest data year and a custom range reports the range's end year.
- Income is split by currency and type: interest, Canadian eligible dividends (CAD dividends), foreign income (USD dividends). Realized gains come from sell proceeds minus average cost in taxable accounts. All four are summed only over the selected accounts, for the scope's tax year (`taxSummary` in `src/client/series.ts`).
- Room bars work the same way: `used` is `contrib` summed for the selected accounts of each registered group (TFSA, FHSA, RRSP, RESP; ManagedTFSA shares the TFSA group) within the scope's tax year. `contrib` (not gross `external_in`) is used because a routing hub account inflates `external_in` with pass-through deposits.
- There are two kinds of limit and the page distinguishes them. `CONTRIBUTION_LIMITS` in `src/analytics.ts` is the generic CRA annual maximum. `ASSESSED_ROOM` in the same file is this person's actual room transcribed from a notice of assessment, carry-forward already included; where a group/year figure exists there it wins, and `taxSummary` marks the row `assessed: true` so the bar is labelled "assessed" and the footnote changes. Currently the only entry is RRSP 2026 = $70,752, from the 2025 NOA (45,191 unused at the end of 2025 plus 25,561 earned in 2025). Add the new figure after each year's NOA arrives rather than letting the bar fall back to the annual maximum.
- There is no OVER flag. Against the annual maximum a full bar is not necessarily an over-contribution, because unused room carries forward. Against assessed room the comparison is real, but it is still not a filing figure.
- The estimated tax added subtracts RRSP actually contributed this year (registered room used, for the selected accounts), not unused room. It is a rough estimate with a visible not for filing disclaimer. Never present it as a filing figure. Editing the tax rate input recomputes only the estimate figure from the last-rendered tax summary — it never triggers a full section or chart rerender.

## Cashflow flows and the transaction drill-down

- `ledger.flows` is the transaction-level backing data for the cashflow chart: every external `CONTRIB` / `TRANSFER_IN` / `TRANSFER_OUT` row (see "External versus internal transfers" above; internal transfers between the owner's own accounts are excluded), each carrying `account_id`, `month`, `date`, `type`, a signed `amount` (`TRANSFER_OUT` negative), and the already-redacted `description`. It is separate from `series[].deposits`, which nets all transfers per account-month for the money-in figure, not just the external ones.
- Clicking a bar on the cashflow chart drills into that period: `flowsForPeriod` (`src/client/series.ts`) filters `ledger.flows` to the clicked period and the selected accounts, split into inflow (positive amount) and outflow (negative amount). The clicked bar's label is the period key already — a full month ("YYYY-MM") in month grain, or a bare year ("YYYY") in year grain (the default "All time" view, once the window exceeds 24 months) — and matching is by `flow.month.startsWith(period)`, so a year period matches every month in it. `sections.ts` renders the result into a `<details id="cashflow-drill">` below the chart and opens it. Changing the filter resets the drill-down to collapsed and empty rather than showing a stale period.

## The scope lives in the query string

`src/client/url.ts` owns the URL contract, and it is the only place that reads or writes `location`. Params, each omitted at its default so a default view has a bare URL: `accts` (comma-separated account `short_id`s), `t` (`ytd`/`1y`/`3y`), `from`+`to` (`YYYY-MM`, both required, and they beat `t`), `period` (the expanded cashflow drill-down, `YYYY` or `YYYY-MM`).

- Writes go through `replaceState`, never `pushState`: a filter toggle must not cost a Back press to leave the page. It is wrapped in a try/catch so a browser that refuses the call degrades to an unlinkable filter rather than a broken page. `history.replaceState` with a query string does work on the `file://` document this page is opened as, verified in Chrome.
- The URL carries `short_id`s, not the masked `acct_*` hashes, so it stays readable. They are unique across the 16 accounts; a collision would select both, widening the scope rather than picking the wrong account.
- `decodeScope` is total. Unknown presets, half-specified or inverted ranges, unknown `short_id`s, and malformed periods all fall back to the default instead of throwing, because a hand-edited or truncated URL still has to open. An `accts` list where every id is unknown decodes to "all accounts", not "none".
- A restored `period` is only reopened when it still exists in the current scope's cashflow labels; a stale one is dropped and scrubbed from the URL. Changing the filter clears it, matching `resetCashflowDrilldown`.
- Unticking one of 16 accounts writes the other 15 into the URL. That is verbose but correct; there is deliberately no "exclude" form, since two ways to express one selection is not worth the readability.

## The thirty year projection

`src/client/projection.ts` is a pure engine: `projectYears(inputs)` returns one row per year. `src/client/series.ts`'s `projectionInputs()` derives its inputs from the ledger and the current scope. Rendering is a fourth pillar in `sections.ts`. The spec is `docs/superpowers/specs/2026-08-04-registered-projection-design.md`, and `src/client/__fixtures__/projection-reference.json` is the 31-row regression baseline.

Five traps, each of which has bitten once:

- **Indexation compounds an UNROUNDED base.** Rounding is a CRA publication rule applied to the figure handed back, never carried into the next year. Compounding the rounded value silently pins the TFSA at $7,000 forever, because $7,000 × 1.02 rounds back to $7,000. `roomBase` on `ProjectionInputs` carries the seed; it is not derivable from any other field, since `contributedThisYear` is money already put in.
- **FHSA is statutory, not indexed**, and has two separate endings: contributions stop at the $40,000 lifetime cap (2028), and the account itself closes 15 years after opening (2039, from `first_activity`), at which point the whole balance leaves the projection as a home purchase.
- **RESP contributions counted against the $50,000 lifetime cap are `deposits`, not `contrib`.** Money arriving as a `TRANSFER_IN`/`DEP` is still a contribution to CRA. Using `contrib` undercounts by $450 in the real data.
- **CESG received is derived from `series[].grant`, not assumed.** `GRANT` transactions are real but were unreachable client-side until `grant` was added to the series row: `ledger.flows` filters on `externalFlow()`, which never classifies `GRANT`. `accounts[].first_activity` was added for the same reason. The `7200 − received` bound must use TOTAL lifetime received (pre-projection plus in-projection), which is what makes 2039's grant $200 rather than $500.
- **The projection covers one more group than the room bars do.** `PROJECTION_GROUP_ORDER` in `src/client/series.ts` is `ROOM_GROUP_ORDER` plus `Corporate`. The corporate account has no CRA room, so it must stay out of `ROOM_GROUP_ORDER` and `REGISTERED_GROUPS` or it would appear as a room bar; it contributes a flat `CORPORATE_ANNUAL` ($1,000 biweekly = $26,000/yr, an owner plan, deliberately not indexed) and its `roomRemaining` is always 0.
- **The categorical palette has exactly 8 slots and the drawable account count must not exceed it.** Slots are assigned over drawable accounts computed against the full ledger. Twice now, adding an account silently pushed the largest TFSA past the end of the palette and dropped it from the chart with no error. If a ninth account ever becomes drawable, add a validated hue — do not let the guard quietly discard a line.
- **The RESP contribution target is derived, never a hardcoded rate.** It contributes exactly what claims the grant available that year, floored at $2,500 and ceilinged at $5,000. A flat $5,000/yr exhausts the $50,000 room by 2035 and forfeits about $1,700 of grant; the real catch-up available was only $450.

The fixture declares integer opening balances ($139,462) while live derivation carries cents ($139,461.37), so the live projection ends about $3 below the fixture. That is expected. Do not "fix" the engine to close it and do not regenerate the fixture from live data — its value is being a fixed baseline.

`RESP_BENEFICIARY_BIRTH_YEAR` in `analytics.ts` is the one owner-supplied figure in a file otherwise made of published CRA numbers. It reaches the client as an explicit parameter, never an import.

## Design and docs

- The spec and implementation plan live in `docs/superpowers/`.
- The shared stylesheet is `../_assets/personal.css`. New investment styles are namespaced (`fbx-` for the filter, `pillar-` and section classes). Do not modify selectors used by other personal pages.
