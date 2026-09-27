# Dashboard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the investments dashboard into five tabs and add a This month page, a projection in today's dollars for all or selected accounts, a registered contributions planner, income and cost tracking, holdings across accounts, and a benchmark.

**Architecture:** Figures are computed in pure TypeScript modules under `app/src/analytics/`, `app/src/projection/` and `app/src/goals/`, written into `data/analytics.json` by `bun run analytics` where they need statement detail, and rendered by React components under `app/src/ui/`. Owner assumptions live in a committed `data/plan.json`. Every rendered figure goes through `app/src/ui/format.ts`.

**Tech Stack:** Bun, TypeScript (strict), React 19, Radix Themes 3, d3-scale, bun test with happy-dom and Testing Library, biome.

**Spec:** the owner approved proposal of 2026-09-26, restated in the Spec section below, plus tickets TCK-0003 to TCK-0008 in `orchestrator/tickets/`.

## Spec

The owner asked for all of the following, on top of what exists:

1. Fix the UI: the hero chart repeats above every tab; the USD book cost note is printed six times on Overview; Growth draws a return chart for all 15 accounts including three flat chequing lines; the projection headline is nominal 2056 dollars; the Tax view prints $0.00 taxable income by subtracting the RRSP deduction from investment income alone; goal targets are chosen by the code; the page is capped at 48rem.
2. Tabs become This month, Portfolio, Growth, Plan, Data.
3. This month page: what changed since the previous statement month, split into deposits and market growth, movers, dividends and fees, coverage, checkpoint.
4. Projection: today's dollars with an adjustable inflation rate, a range of three rates, milestone years, retirement at 60 with a 4% monthly income figure, for all or selected accounts.
5. Registered contributions (the owner's correction of "registered wrappers"): room, deadlines, next actions, history.
6. Income and withholding tax, fees and FX conversions.
7. Holdings combined across accounts, currency and asset class split.
8. A benchmark: the same deposits invested in XEQT.

Owner decisions: retire at 60, born 1997 (the RRSP last accrual year 2068 is age 71). Inflation default 2.5% and adjustable. Net worth and the household switch are deferred until the spouse's accounts arrive. Goal targets move to `data/plan.json` and the code defined targets are deleted.

## Global Constraints

- All commands run from `personal/investments/app/`. The gate is `bun run check` (biome, `tsc --noEmit`, `bun test`) with zero failures and zero warnings, including React `act(...)` warnings.
- `bun run contrast` must pass after any task that changes what renders; it needs the dev server (`bun run dev --port 5174 --strictPort`) or starts its own per `src/tools/contrast/run.ts`.
- Every figure shown on the page, in an `aria-label` or a tooltip, comes from one call to `formatCurrency`, `formatShare` or `formatRate` in `src/ui/format.ts`. Never format a figure twice (CLAUDE.md, the precision rule).
- Gains are jade, losses red; the tone is passed by the caller that knows the figure.
- Corpus figures in tests come from `data/goldens.json` via `src/goldens.ts`, never inline literals. Adding a golden means extending `Goldens` and `isGoldens` in `src/goldens.ts` and computing it in `src/tools/goldens.ts` by calling the same production function the test calls; then run `bun run goldens`.
- No `any`, no non-null assertions, named exports only, functions at most 100 lines, at most 5 parameters.
- Page prose: sentence case, no `-` character used as punctuation or in compounds, no "comprehensive", "robust", "seamless" and the rest of the owner's banned list.
- Never commit unmasked account numbers, names or addresses. Account names on screen come from `registry.ts` labels.
- Chequing (`kind === "Chequing"`) and the spousal RRSP (`inTotals: false`) never enter the portfolio total. The spousal RRSP counts toward the owner's RRSP room.
- Commit after each task with a conventional commit message and no AI attribution.

## Review Focus

- A year scope (`#growth/2024`) combined with the new tabs: every tab that honours the year filter must still clip, and Plan must still ignore it for the projection.
- An account selection that excludes every projected account (for example only Crypto): the projection must still render, compounding the opening balance, rather than an empty chart.
- A month with a missing statement (an account whose latest period is behind): This month must list it as missing, not as a $0 account.
- USD activity rows (DIV, NRT on US holdings): converted to CAD with the statement's own `fxRate`, never summed raw with CAD rows.
- A stale `data/plan.json` (missing field, wrong type): the dashboard must render the ErrorBoundary's rebuild message naming the field, not crash or silently default.

Each line has its test in the owning task below.

---

## TCK-0003: Layout shell and tab restructure

### Task 3.1: Tab ids, labels and legacy hash mapping

**Files:** Modify `src/ui/useHashTab.ts`, `src/ui/Tabs.tsx`, `src/ui/useHashTab.test.ts`, `src/ui/Tabs.test.tsx`, `src/tools/contrast/run.ts`.

**Interfaces:**
- Produces: `export type TabId = "month" | "portfolio" | "growth" | "plan" | "data";` and `export const TABS: readonly TabId[] = ["portfolio", "growth", "plan", "data"];` in this task. TCK-0004 inserts `"month"` first and makes it the default.
- Produces: `export const LEGACY_TABS: Readonly<Record<string, TabId>> = { overview: "portfolio", wrappers: "plan", tax: "portfolio", projections: "plan", reconciliation: "data", cards: "data" };` used by `decodeHash`.

- [ ] Write failing tests in `useHashTab.test.ts`: `#overview` decodes to `{ tab: "portfolio", scope: "all" }`; `#wrappers/2025` decodes to `{ tab: "plan", scope: 2025 }`; `#cards` and `#reconciliation` decode to `data`; `#tax` to `portfolio`; unknown tabs fall back to `portfolio`; encoding a decoded legacy hash writes the new id.
- [ ] Run `bun test src/ui/useHashTab.test.ts`, expect failures.
- [ ] Implement: `decodeHash` looks up `TABS` first, then `LEGACY_TABS`, else the default tab. `TabId` keeps `"month"` in the union now so TCK-0004 only edits the array.
- [ ] `Tabs.tsx` LABELS: `{ month: "This month", portfolio: "Portfolio", growth: "Growth", plan: "Plan", data: "Data" }`. Update `Tabs.test.tsx` PANELS and label assertions to the new set.
- [ ] `src/tools/contrast/run.ts`: every place that special cases `"overview"` now uses `"portfolio"`.
- [ ] Run the two test files, expect pass. Commit `refactor(investments): five dashboard tabs with legacy hash mapping`.

### Task 3.2: Panels, summary strip, hero only on Portfolio, 72rem

**Files:** Modify `src/ui/App.tsx`, `src/ui/Overview.tsx`; Create `src/ui/SummaryStrip.tsx`, `src/ui/SummaryStrip.test.tsx`; Modify `src/ui/App.test.tsx`, `src/ui/App.a11y.test.tsx`, `src/ui/App.scope.test.tsx`, `src/ui/App.account.test.tsx`.

**Interfaces:**
- Produces: `export function SummaryStrip({ total, period, figures }: { total: number; period: string | null; figures: ReturnType<typeof latestGroupGain> }): JSX.Element` rendering one line: `Portfolio $250,450.58 as of 2026-08 · +$19,199.07 (+8.30%) against book cost`, using `formatCurrency` and `formatGainWithShare`, marked `data-summary-strip`.
- Consumes: `GroupGainLine`, `latestGroupGain`, `formatGainWithShare`.

Panels record after this task:
- `portfolio`: hero (heading, total, `GroupGainLine`, `YearChangeLine`), controls (`YearFilter`, `AccountFilter`, `ChartModeToggle`), the value or return chart, then `Overview`, then a section `Income and tax` holding `TaxView`.
- `growth`: `ReturnsChart`, `ContributionsChart`, `CashflowChart`, `CostGapChart`.
- `plan`: `RegisteredView`, then `ProjectionsView`.
- `data`: `DataStatus`, `Reconciliation`, `Cards`.

Every tab other than Portfolio renders `SummaryStrip` and `YearFilter` above its panel so the year scope stays reachable. `main` max width becomes `72rem`. Overview group cards sit in a Radix `Grid columns={{ initial: "1", md: "2" }} gap="4"`.

- [ ] Write failing tests: on `#growth` the page has `[data-summary-strip]` and no `[data-portfolio-total]` and no `svg` titled "Portfolio value over time"; on `#portfolio` the reverse; the year filter radio group exists on every tab; `SummaryStrip` renders `formatCurrency(GOLDENS.portfolio.total)`.
- [ ] Implement. Remove the unused `YearScopedPanel` and `YearSelect` (dead in the live UI) and their test, per replace, don't deprecate.
- [ ] Update the flagged tests: `clickTab`/`openTab` helpers use the new labels (Growth, Plan, Data, Portfolio); the Projections assertions open Plan; the Wrappers and Tax ones open Plan and Portfolio; Reconciliation and Cards open Data.
- [ ] Run `bun run check`, expect pass. Commit `feat(investments): hero on Portfolio only, summary strip elsewhere, wider page`.

### Task 3.3: One "About these numbers" note per tab

**Files:** Modify `src/ui/Overview.tsx` (`GroupGainLine`), `src/ui/App.tsx`; Create `src/ui/AboutNumbers.tsx`, `src/ui/AboutNumbers.test.tsx`; Modify tests asserting the caveat text.

**Interfaces:**
- Produces: `export function AboutNumbers({ notes }: { notes: readonly string[] }): JSX.Element` rendering a native `<details data-about-numbers>` with `<summary>About these numbers</summary>` and one paragraph per note.
- `GroupGainLine` loses the always printed "An estimate: book cost for USD holdings is a converted approximation, not a filing figure." line; that sentence moves into the Portfolio tab's `AboutNumbers` notes. The null case ("No market value to compare against book cost.") stays on the card, it is a fact about that card.

- [ ] Failing test: on `#portfolio` the USD note text appears exactly once in the document and inside `[data-about-numbers]`.
- [ ] Implement; move the other tab specific caveats that repeat per card into their tab's `AboutNumbers` only when they repeat; single caveats stay where they are.
- [ ] `bun run check`, commit `feat(investments): one about these numbers note per tab`.

### Task 3.4: Growth returns grid without dead accounts

**Files:** Modify `src/ui/charts/ReturnsChart.tsx`, `src/ui/charts/returnsSeries.ts`, tests.

**Interfaces:**
- Produces: `export function chartedReturnAccounts(accounts: readonly AccountReturns[], series: readonly AccountSeries[]): AccountReturns[]` dropping `kind === "Chequing"` and accounts with zero plotted points.

- [ ] Failing test over the real corpus: no card has a label starting "Chequing"; every rendered card has at least one plotted point; the provenance sentence's counts match the charted accounts.
- [ ] Render cards in `Grid columns={{ initial: "1", md: "2" }}`.
- [ ] `bun run check`, `bun run contrast`, commit `feat(investments): growth return charts in a grid, chequing left out`.

---

## TCK-0004: This month page

### Task 4.1: Activity totals in analytics.json

**Files:** Create `src/analytics/activity.ts`, `src/analytics/activity.test.ts`; Modify `src/analytics/build.ts` (add `activity` to `AnalyticsOutput`), `src/ui/data.ts` (`isAnalyticsOutput` requires `activity`).

**Interfaces:**
- Produces:
```ts
export interface ActivityTotals {
  dividends: number;        // DIV credits, CAD
  interest: number;         // INT credits, CAD
  lendingIncome: number;    // FPLINT credits, CAD
  withholdingTax: number;   // NRT debits, CAD, positive number
  fees: number;             // FEE debits, CAD, positive number
  fxConversions: number;    // count of FXCONVERSION rows
}
export type ActivityByPeriod = Record<string, Record<string, ActivityTotals>>; // period -> maskedId -> totals
export function buildActivity(statements: readonly Statement[]): ActivityByPeriod;
export function sumActivity(rows: readonly ActivityTotals[]): ActivityTotals;
```
- A USD row is converted with its statement's `fxRate`; a USD row on a statement with `fxRate === null` throws naming the statement file. PERFORMANCE statements are skipped. Versions are already deduplicated in the datastore.

- [ ] Before implementing, inspect real rows for each code (`jq` over `data/datastore.json`) to confirm which side (credit or debit) each code uses and the currency field; write the finding as a one line comment on the constant that maps codes.
- [ ] Failing tests with fixture statements: CAD and USD DIV sum correctly with fx; NRT lands as positive withholding; a USD row with null fxRate throws; PERFORMANCE statements ignored; `sumActivity([])` is all zeros. Review Focus line 4 is pinned here.
- [ ] Implement; run `bun run analytics`, confirm the file carries `activity`.
- [ ] `bun run check`, commit `feat(investments): activity totals per account and month`.

### Task 4.2: Month review model

**Files:** Create `src/analytics/monthReview.ts`, `src/analytics/monthReview.test.ts`.

**Interfaces:**
```ts
export interface AccountMove { maskedId: string; label: string; start: number | null; end: number | null; netDeposits: number; growth: number | null; change: number | null; }
export interface MonthReview {
  period: string; previous: string | null;
  start: number | null; end: number; netDeposits: number; growth: number | null;
  moves: AccountMove[];            // inTotals accounts, sorted by |change| desc, nulls last
  missing: string[];               // labels of inTotals accounts with no statement this period
  opened: string[];                // labels whose first period is this period
  activity: ActivityTotals;        // inTotals accounts only
}
export function monthReview(analytics: AnalyticsOutput, period: string): MonthReview;
export function reviewPeriods(analytics: AnalyticsOutput): string[]; // newest first
```
- Portfolio start and end come from `buildPortfolioSeries(analytics.series)`; `netDeposits` sums `deposits - withdrawals` of inTotals accounts with a stated market value that month (same basis as `netFlowsByPeriod`); `growth = end - start - netDeposits`, null when there is no previous point.

- [ ] Failing tests over the real corpus: for the latest period, `end` equals `GOLDENS.portfolio.total` to the cent; `start + netDeposits + growth === end` to the cent; `8297` (label `Corporate (self)`) is in `opened` for 2026-08; a fixture where one account lacks the period lists it in `missing` and not in `moves` with a zero (Review Focus line 3).
- [ ] Implement, `bun run check`, commit `feat(investments): month review model`.

### Task 4.3: This month tab

**Files:** Create `src/ui/ThisMonth.tsx`, `src/ui/ThisMonth.test.tsx`; Modify `src/ui/useHashTab.ts` (TABS gains `"month"` first, default tab `month`), `src/ui/App.tsx`, `src/ui/data.ts` (`loadCheckpoints()` with a shape check), tests that assume the default tab is Portfolio.

Layout: a month picker (Radix Select over `reviewPeriods`), a headline "August 2026: +$15,870.75", the line "$X paid in, $Y market growth" (growth toned), a movers table (account, value, change, deposits, growth), an income and costs row from `activity` (dividends, interest, lending, withholding, fees), a coverage line (missing and opened accounts, link to `#data`), and when a checkpoint has `coversPeriod === period` and a `reconciliation` block, one line: "Wealthsimple app $250,543.54 against statements $250,450.58, $92.96 apart (0.04%)".

- [ ] Failing tests: default route renders This month; headline change equals `end - start` of the model via `formatSignedCurrency`; movers rows equal `moves.length`; the checkpoint line appears for 2026-08 and not for 2026-07; picking 2026-07 in the Select updates the headline (await `act` for Radix, see `App.account.test.tsx`).
- [ ] Implement, `bun run check`, `bun run contrast`, commit `feat(investments): this month page`.

---

## TCK-0005: Projection in today's dollars, for all or selected accounts

### Task 5.1: data/plan.json and its loader; delete goals/config.ts

**Files:** Create `data/plan.json`, `src/plan.ts`, `src/plan.test.ts`; Delete `src/goals/config.ts`; Modify `src/goals/__fixtures__/goals.ts`, `src/ui/projections/GoalsPanel.tsx`, `src/ui/projections/ProjectionsView.tsx`, every import of `GOALS`.

`data/plan.json`:
```json
{
  "birthYear": 1997,
  "retirementAge": 60,
  "inflation": 0.025,
  "withdrawalRate": 0.04,
  "goals": [
    { "id": "house", "label": "House down payment", "scope": { "kind": "purpose", "purpose": "house" }, "target": 40000, "by": "2028", "source": "Owner plan, carried over from the FHSA lifetime cap." },
    { "id": "education", "label": "Education", "scope": { "kind": "purpose", "purpose": "education" }, "target": 50000, "by": "2042", "source": "Owner plan, carried over from the RESP lifetime cap; 2042 is the CESG last year for a 2025 beneficiary." }
  ]
}
```

**Interfaces:**
```ts
export interface Plan { birthYear: number; retirementAge: number; inflation: number; withdrawalRate: number; goals: Goal[]; }
export function parsePlan(raw: unknown): Plan;   // throws "plan.json: <field> ..." naming the first bad field
export function loadPlan(): Plan;                 // parsePlan(import of @data/plan.json)
export function retirementYear(plan: Plan): number; // birthYear + retirementAge
```
`Goal` moves from `goals/config.ts` into `src/plan.ts` unchanged.

- [ ] Failing tests: the committed file parses; missing `inflation` throws naming `inflation`; a goal with a non numeric target throws naming `goals[0].target`; `retirementYear` is 2057 (Review Focus line 5; also a UI test that a bad plan renders the ErrorBoundary message).
- [ ] Implement; `GoalsPanel` takes `goals` as a required prop and `ProjectionsView` passes `loadPlan().goals`; fixtures build from `loadPlan().goals`; update `scope.test.ts` "GOALS, the shipped config" to read the plan.
- [ ] `bun run check`, commit `feat(investments): plan file holds goals and assumptions`.

### Task 5.2: Selection aware projection with real terms

**Files:** Create `src/projection/scenario.ts`, `src/projection/scenario.test.ts`.

**Interfaces:**
```ts
export interface ScenarioPoint { year: string; nominal: number; real: number; }
export interface Scenario { rate: number; points: ScenarioPoint[]; }
export interface ScenarioSet { low: Scenario; base: Scenario; high: Scenario; startYear: string; uncompounded: string[]; }
export function deflate(value: number, years: number, inflation: number): number; // value / (1 + inflation) ** years
export function runScenarios(analytics: AnalyticsOutput, selected: ReadonlySet<string>, opts: { rate: number; spread: number; inflation: number; years: number }): ScenarioSet;
export function milestoneYear(points: readonly ScenarioPoint[], threshold: number): string | null; // first year real >= threshold
export function retirementIncome(points: readonly ScenarioPoint[], year: number, withdrawalRate: number): { balance: number; monthly: number } | null; // real terms
```
- Low and high are `rate - spread` and `rate + spread`, low clamped at 0; spread is 0.02.
- For selected accounts that `projectedAccounts` covers, values come from `projectYears(projectionInputs(analytics, { returnRate, years }))` split per account with `accountValues` (goals/allocation.ts). Selected accounts outside it (NonRegistered, Crypto, the spousal RRSP) compound their latest market value at the rate with no contributions, and their labels are listed in `uncompounded` so the page can say so.
- `years` is `max(30, retirementYear - startYear)`.

- [ ] Failing tests: `deflate(1000, 10, 0.025)` equals `1000 / 1.025 ** 10`; with the default selection the base nominal first point equals the sum of the selected accounts' latest values; a selection of only Crypto returns points that grow at exactly the rate (Review Focus line 2); `milestoneYear` returns null when never reached; `retirementIncome` monthly equals balance times 0.04 over 12.
- [ ] Implement, `bun run check`, commit `feat(investments): projection scenarios for selected accounts in real terms`.

### Task 5.3: Projection UI

**Files:** Modify `src/ui/projections/ProjectionsView.tsx`, `src/ui/charts/ProjectionChart.tsx` and `projectionSeries.ts` (linear axis with a band), `src/ui/App.tsx` (pass the shared `accounts` selection into `ProjectionsView`), tests; update `src/tools/goldens.ts` and `src/goldens.ts` projection goldens to the new model and run `bun run goldens`.

Page, top to bottom:
1. Heading "Where this is heading", with the account selection named ("Portfolio (11 accounts)" or the subject from `chartSubject`) and the `AccountFilter` itself so the selection can change here too.
2. Controls: return rate slider 0% to 12% (default 6%), inflation slider 0% to 5% (default `plan.inflation`), and a `SegmentedControl` "Today's dollars" / "Future dollars", default today's dollars.
3. Three headline tiles: value at retirement (year 2057, age 60) in the chosen dollars; monthly income at 4% in today's dollars; milestone years for $500,000 and $1,000,000 in today's dollars ("not within the horizon" when null).
4. The chart: linear y axis, stated history solid, base projection dashed, low to high as a translucent band, a vertical rule at the retirement year labelled "Age 60".
5. A plain sentence on assumptions: rate, inflation, which accounts receive contributions under CRA rules, and the `uncompounded` list as "grow at the rate with no new money".
6. Fitted rate stated as context only: "Your last N months ran at X% a year after deposits; a short strong run, not a thirty year expectation." No button applies it.
7. `GoalsPanel`, then `RunwayTable` (unchanged logic, goals from the plan).
8. The scenario disclaimer, kept.

- [ ] Failing tests: default shows "Today's dollars" selected and the retirement tile equals `formatCurrency` of `runScenarios(...).base` real value at 2057; toggling Future dollars changes the tile to the nominal figure; moving the inflation slider changes the real tile and not the nominal one; no element carries `data-apply-fitted`; selecting one account in the filter changes the tile to that account's scenario; the year scope does not change the projection (Review Focus line 1).
- [ ] Implement, `bun run goldens`, `bun run check`, `bun run contrast`, commit `feat(investments): projection in today's dollars with range, milestones and retirement income`.

---

## TCK-0006: Registered contributions planner and tax fix

### Task 6.1: Deadlines and next actions

**Files:** Create `src/analytics/contributionPlan.ts`, `src/analytics/contributionPlan.test.ts`.

**Interfaces:**
```ts
export function contributionDeadline(group: RegisteredGroup, year: number): string; // ISO date
export interface NextAction { group: RegisteredGroup; text: string; amount: number | null; deadline: string; }
export function nextAction(line: RoomLine): NextAction;
```
- RRSP deadline is the 60th day of the following year (2027-03-01 for 2026; 2028-02-29 for 2027). TFSA, FHSA, RESP: December 31 of the year.
- Text by case: RRSP with `remaining > 0`: "Up to {remaining} more can be deducted against {year} income, by {deadline}." TFSA with `assessed === false`: "Add your assessed TFSA room to see what is left." FHSA: annual room `limit - used` and lifetime remaining. RESP: when `used < 2500`: "{2500 - used} more by December 31 earns this year's full $500 grant."; else "This year's full basic grant is covered."
- Amounts in `text` are formatted with `formatCurrency` inside the module that builds the text (one call per figure).

- [ ] Failing tests for every case, the leap year deadline, and a RoomLine at exactly zero remaining.
- [ ] Implement, `bun run check`, commit `feat(investments): contribution deadlines and next actions`.

### Task 6.2: Registered contributions view

**Files:** Modify `src/ui/wrappers/RegisteredView.tsx` (heading "Registered contributions, {year}"), `src/ui/wrappers/RoomBar.tsx` (next action line and deadline), Create `src/ui/wrappers/ContributionHistory.tsx` and its test.

- `ContributionHistory` renders a table: rows per wrapper, columns per year in `analytics.rooms`, cells `formatCurrency(line.used)` or "no statement" when the wrapper had no line that year.

- [ ] Failing tests: heading text; each RoomBar shows its `nextAction(line).text`; the history table has one row per wrapper present in any year and one column per year.
- [ ] Implement, `bun run check`, `bun run contrast`, commit `feat(investments): registered contributions planner`.

### Task 6.3: Tax view stops inventing taxable income

**Files:** Modify `src/ui/wrappers/TaxView.tsx`, `src/ui/wrappers/TaxView.test.tsx`, `src/analytics/income.ts` (delete `estimateTax` and `TaxEstimate` if nothing else uses them; check with `rg estimateTax src`), goldens if they reference the estimate.

New content: heading "Investment income, {year}" with Interest, Canadian eligible dividends, Foreign income, Realized gains or losses (non registered accounts only, as today); then a separate line "RRSP deduction available: $39,000.00 contributed in {year}, deductible against your total income, including salary." No taxable income row and no flat rate estimate.

- [ ] Failing tests: no element with `data-hook="taxable-income"` or text "flat 30%"; the RRSP line shows `formatCurrency` of the RRSP room line `used`.
- [ ] Implement, `bun run check`, commit `fix(investments): tax view no longer nets the RRSP deduction against investment income`.

---

## TCK-0007: Income, withholding tax and costs

### Task 7.1: Income and costs section

**Files:** Create `src/analytics/incomeCosts.ts`, `src/analytics/incomeCosts.test.ts`, `src/ui/IncomeCosts.tsx`, `src/ui/IncomeCosts.test.tsx`; Modify `src/ui/App.tsx` (Portfolio tab, under Income and tax).

**Interfaces:**
```ts
export interface YearIncome { year: number; totals: ActivityTotals; byAccount: Record<string, ActivityTotals>; }
export function incomeByYear(analytics: AnalyticsOutput): YearIncome[];     // inTotals accounts, oldest first
export function incomeByMonth(analytics: AnalyticsOutput, year: number): { period: string; totals: ActivityTotals }[];
export function withholdingRecovery(kind: AccountKind): "credit" | "exempt for US listed funds" | "lost";
```
- `withholdingRecovery`: NonRegistered and Corporate "credit"; RRSP and SpousalRRSP "exempt for US listed funds"; TFSA, FHSA, RESP "lost"; Crypto and Chequing "lost".

UI: a year table (dividends, interest, lending, withholding, fees, FX conversions), a bar chart of monthly dividends for the selected year built on the existing chart primitives in `src/ui/charts/` (follow `CashflowChart.tsx`), and a withholding table per account for the selected year with the recovery column.

- [ ] Failing tests: the year totals equal `sumActivity` over the months; withholding rows only for accounts with a nonzero amount; the recovery text per kind; the chart's accessible summary names the year and the total.
- [ ] Implement, `bun run check`, `bun run contrast`, commit `feat(investments): income, withholding tax and costs`.

---

## TCK-0008: Holdings across accounts and a benchmark

### Task 8.1: Holdings summary in analytics.json

**Files:** Create `src/analytics/holdings.ts`, `src/analytics/holdings.test.ts`; Modify `src/analytics/build.ts`, `src/ui/data.ts`.

**Interfaces:**
```ts
export interface HoldingSummary { symbol: string; name: string; value: number; share: number; accounts: string[]; priceCurrency: Currency; assetClass: string; }
export interface HoldingsOutput { period: string; total: number; holdings: HoldingSummary[]; groups: { label: string; symbols: string[]; value: number; share: number }[]; currency: { CAD: number; USD: number }; assetClasses: { name: string; value: number }[]; }
export function buildHoldings(statements: readonly Statement[], accounts: readonly AccountRecord[]): HoldingsOutput;
export const INDEX_GROUPS: Readonly<Record<string, readonly string[]>> = { "S&P 500": ["VFV", "VOO", "ZSP", "XUS", "SPY", "IVV", "VFV.U", "ZSP.U"] };
```
- Latest period of inTotals accounts, BROKERAGE statements only; `share = value / total`; cash is a holding named "Cash" per currency from `cash[].closing` converted with `fxRate`.
- Currency is by `priceCurrency`; note in a comment that `priceCurrency` defaults to CAD on rows whose price the statement omits (the known $0 price quirk), so the USD share is a floor.

- [ ] Failing tests: `total` equals `GOLDENS.portfolio.total` within one cent per account from rounding; VFV and VOO sum into the S&P 500 group; shares sum to 1 within 1e-9; accounts listed by label.
- [ ] Implement, `bun run analytics`, `bun run check`, commit `feat(investments): holdings combined across accounts`.

### Task 8.2: Holdings view

**Files:** Create `src/ui/Holdings.tsx`, `src/ui/Holdings.test.tsx`; Modify `src/ui/App.tsx` (Portfolio tab, after the group cards).

Content: a top holdings table (symbol, name, value, share, accounts) with the first 15 and a "Show all" disclosure; the index group line "S&P 500 through VFV and VOO: $57,970 (23.1%) across 7 accounts" built from the model; a CAD versus USD bar (`ShareBar` is decoration only, figures in text); asset classes list.

- [ ] Tests, implement, `bun run check`, `bun run contrast`, commit `feat(investments): what you own across accounts`.

### Task 8.3: Benchmark data and comparison

**Files:** Create `src/tools/benchmark.ts` (script `"benchmark": "bun run src/tools/benchmark.ts"` in package.json), `data/benchmark.json`, `src/analytics/benchmark.ts`, `src/analytics/benchmark.test.ts`, `src/ui/charts/BenchmarkChart.tsx` and its test; Modify `src/ui/App.tsx` (Growth tab, first), `src/ui/data.ts`, `CLAUDE.md` import section (add `bun run benchmark`).

- The script fetches `https://query1.finance.yahoo.com/v8/finance/chart/XEQT.TO?interval=1mo&range=10y` with a browser user agent, keeps the adjusted close per month as `{ symbol, fetched, closes: Record<period, number> }`, and fails loudly on a non 200 or an empty series. Tests never hit the network.
- `benchmark.ts`:
```ts
export interface BenchmarkPoint { period: string; portfolio: number; benchmark: number; }
export function simulateBenchmark(series: readonly AccountSeries[], closes: Readonly<Record<string, number>>): BenchmarkPoint[];
```
Each month's portfolio net deposits (same `netFlowsByPeriod` basis) buy units at that month's close; the first month buys the opening market value; benchmark value is units times close. Months with no close are skipped and named in the chart's note.
- The chart draws both value lines over time and the summary states both end values and the difference.

- [ ] Failing tests with a fixture closes map: flat closes give benchmark value equal to cumulative deposits plus the opening value; a doubled close doubles the units held before it; a missing month is skipped.
- [ ] Run `bun run benchmark` once to create the file, implement, `bun run check`, `bun run contrast`, commit `feat(investments): benchmark the portfolio against XEQT`.

---

## After all tickets

- [ ] Update `personal/investments/README.md` (tabs, commands), `CLAUDE.md` (tabs, plan.json, benchmark command), today's log `personal/investments/log/2026-09-26.md`, and `hot.md`.
- [ ] Delete this plan file (the owner's instruction for spec and plan files once implementation is done).
