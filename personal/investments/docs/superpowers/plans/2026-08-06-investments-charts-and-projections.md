---
title: "Investments phase 2c: charts, navigation and projections"
tags: [personal/investments, plan]
created: 2026-08-06
updated: 2026-08-06
status: active
type: spike
personal: investments
---

# Investments Charts and Projections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tab navigation, tooltips, four new charts, and a projection view that re-derives itself from the statements every time it runs, so it stays useful as new months land.

**Architecture:** The app stays a single Vite + React page over the committed `data/analytics.json`. Radix Tabs become the top-level navigation, synced to `location.hash`, so each view is a panel rather than another 4,000px of scroll. Every chart is hand-built SVG on `d3-scale` sharing one plotting module and one visual grammar. The projection engine is **ported unchanged** from `scripts/src/client/projection.ts` with its 31-row fixture; only its input derivation is new.

**Tech Stack:** Bun, Vite, React 19, TypeScript strict, Radix Themes, `d3-scale`, `motion`, happy-dom + `@testing-library/react`.

## Global Constraints

- Bun; never npm. TypeScript strict with `noUncheckedIndexedAccess`; zero `tsc` errors. No `any`, no non-null assertions, no unchecked casts.
- Biome line width 100; cognitive complexity at or under 15. Named exports only. No floating promises. No parent-relative imports past one level.
- `bun run check` clean before every commit. All existing tests keep passing; none may be weakened to pass.
- **Never write a real account number, name or address into a tracked file.** Masked 4-char shortIds only. Thirteen identifier leaks occurred in phase 1.
- **Zero em-dash characters** anywhere in UI copy. Use a comma, a period, or a regular hyphen.
- **Never `window.addEventListener("scroll")`.** Every animation honours `prefers-reduced-motion` by skipping, not shortening.
- Charts are responsive via `viewBox`, never a fixed pixel width. Every chart carries `role="img"` and a text summary.
- Dark and light both supported, system preference with a manual toggle. Keyboard reachable, focus visible, contrast AA in both themes.

## The rule that governs every task here

**Show what is known as a figure, and what is uncertain as uncertain.** Phase 2b built the interface on this and the reviews enforced it five times. Phase 2c adds the two places it is easiest to break: a tooltip, which is where a dashboard normally invents a value for a month that has none, and a projection, which is invented by definition.

**The chart grammar, applied identically in every chart:**

| Visual | Means |
|---|---|
| Solid fill or solid line | Stated on a statement |
| Hatched fill or dashed line | Derived, computed rather than printed |
| A visible break in the line | No statement for that month. Never interpolated across |
| Nothing drawn at all | No data. Never a zero baseline |

## The test bar this project holds

Phase 1 shipped six checks incapable of failing and a green suite wrong on most of 192 real statements. Phase 2b's task 4 shipped three rendered money figures asserted by nothing. The standard is **not** "every test is reddened by some mutation", which is the easy direction. It is:

**Every rendered figure must be reddened by some test.** Before any task reports done, replace each figure its views print with a literal and confirm a test fails. Report that audit.

Assert against the real committed `data/analytics.json`, not hand-made fixtures, wherever the corpus can state the case. A hand-built fixture is correct only for a case the corpus does not contain. `git grep` silently ignores `\b` in this environment; never rely on it to prove an absence.

## Data available, verified against the committed artifact

- `series[]` per account: `maskedId`, `shortId`, `kind`, `style`, `purpose`, `label`, `inTotals`, `contributionsByYear`, and sparse `months[]` with `period`, `marketValue`, `bookCost`, `cashBalance`, `deposits`, `withdrawals`, `grants`, `contributions`, `contributionsSource`, `contributionFirst60Days`, `contributionRestOfYear`.
- `rooms` keyed by year (`"2023"` to `"2026"`), `income` keyed the same, `rollups` per lens.
- `returns[]` per account with `points[]`: `source` is `"stated"` or `"derived"`; `statedMwr` carries six horizons (`currentPeriod`, `oneYear`, `threeYears`, `fiveYears`, `tenYears`, `sinceInception`), any of which may be null; `periodReturn` is the derived figure; `reason` is populated exactly when a derived point is null, and is one of `"no-prior-period"`, `"insufficient-data"`, `"unreconciled-flow"`.

**A constraint that shapes tasks 3 and 8.** Only **2 of the 14 accounts** carry stated money-weighted rates, over **21 points** total. Their `sinceInception` values swing from -3.05% to +10.31% across adjacent months. A portfolio return rate fitted from that base is weakly supported and must never be presented as "your return rate". Its provenance goes on screen beside it, and the adjustable control is what the owner actually steers with.

---

### Task 1: Tab navigation

**Files:**
- Create: `app/src/ui/Tabs.tsx`, `app/src/ui/Tabs.test.tsx`, `app/src/ui/useHashTab.ts`, `app/src/ui/useHashTab.test.ts`
- Modify: `app/src/ui/App.tsx`, `app/src/ui/App.test.tsx`, `app/src/ui/App.a11y.test.tsx`

**Interfaces:**
- Produces: `TABS: readonly TabId[]` where `TabId = "overview" | "growth" | "wrappers" | "tax" | "projections" | "reconciliation"`; `useHashTab(): [TabId, (id: TabId) => void]`.

Six panels holding the views that already exist, plus two empty panels (`growth`, `projections`) that later tasks fill. Moving a view into a panel must not change what it renders.

- [ ] **Step 1: Write the failing test for `useHashTab`.** A hash of `#projections` resolves to `"projections"`. An empty hash resolves to `"overview"`. **An unknown hash resolves to `"overview"` rather than throwing or rendering nothing**, because a hand-edited or truncated URL still has to open, matching `decodeScope`'s totality rule in the CSV-era `url.ts`. Setting a tab writes the hash.
- [ ] **Step 2: Run it, confirm it fails, implement, confirm it passes.**
- [ ] **Step 3: Write the failing test for the tab shell.** All six tabs render. The active panel's content is present and the inactive panels' content is absent. Switching tab changes which is present.
- [ ] **Step 4: Run it, confirm it fails, implement, confirm it passes.**
- [ ] **Step 5: Move the existing views into panels.** Overview into `overview`, `RegisteredView` into `wrappers`, `TaxView` into `tax`, `Reconciliation` into `reconciliation`. The portfolio total and `ValueOverTime` stay above the tabs, since they are the page's subject rather than one view of it.
- [ ] **Step 6: Fix the existing tests that assert on the whole page.** `App.test.tsx` and `App.a11y.test.tsx` currently render everything at once. **Do not weaken an assertion to make it pass**: if a test covered a figure now behind a tab, switch to that tab in the test and keep the assertion.
- [ ] **Step 7: Heading levels.** Phase 2b established one `h1`, sections at `h2`, cards at `h3`, no skipped levels, pinned by `App.a11y.test.tsx`. Panels must preserve that. Confirm the existing level test still passes and covers every panel.
- [ ] **Step 8:** `bun run check` clean. Commit.

---

### Task 2: The shared tooltip

**Files:**
- Create: `app/src/ui/charts/useChartCursor.ts`, `app/src/ui/charts/useChartCursor.test.ts`, `app/src/ui/charts/Tooltip.tsx`, `app/src/ui/charts/Tooltip.test.tsx`
- Modify: `app/src/ui/charts/ValueOverTime.tsx`, `app/src/ui/charts/GroupSparkline.tsx`, and their tests

**Interfaces:**
- Consumes: `plot.ts` (the shared plotting module created alongside `GroupSparkline`) and `PortfolioPoint` from `portfolioSeries.ts`.
- Produces: `useChartCursor(points, innerWidth)` returning the focused point index or null, plus pointer and keyboard handlers.

One hover behaviour shared by the big chart and the group charts.

- [ ] **Step 1: Write the failing test for `useChartCursor`.** Given points at known x positions, a pointer x maps to the **nearest real point**. Assert the boundary explicitly: a position exactly between two points resolves deterministically, and the same x always yields the same index.
- [ ] **Step 2: Write the failing test for the gap case, and this is the one that matters.** The series is sparse: `months[]` omits a period entirely rather than zero-filling it (see `MonthPoint`'s own contract). A cursor over a period with **no point** must report no point, and the tooltip must render **"No statement for this month"**. It must never interpolate between neighbours, and must never show `$0.00`. Mutation-verify this one: replacing the lookup with a nearest-neighbour clamp that always returns a value has to redden it.
- [ ] **Step 3: Run both, confirm they fail, implement, confirm they pass.**
- [ ] **Step 4: Write the failing test for the tooltip's content.** On the big chart it names the period, market value, book cost, and **how many of the eleven counted accounts reported that month**, from `PortfolioPoint.accountCount`, which exists precisely because the early series reflects fewer accounts. Book cost is labelled approximate: converted USD book cost carries up to $218.92 of error and is not a filing figure.
- [ ] **Step 5: Run it, confirm it fails, implement, confirm it passes.**
- [ ] **Step 6: Keyboard access.** The chart is focusable and left/right arrows move the cursor point by point, so the tooltip is not mouse-only. Home and End jump to the first and last point. Assert the accessible summary updates with the focused point.
- [ ] **Step 7: Precision.** The tooltip prints cents via the shared `formatCurrency` in `format.ts`. **This project has shipped the coarse-announcement bug twice** (the chart's `aria-label` announcing $241,740 for $241,739.67, and the group bars announcing 20% for 20.4%), so assert the tooltip's figures at full precision.
- [ ] **Step 8: The single-point group.** In the account lens the Crypto group has exactly one statement, so its card draws one 5px dot on an empty band and reads as a rendering failure at a glance. A single point is honest but illegible as a line. Render it so it reads as data: state the statement count in words next to the chart, rather than leaving the reader to guess. Assert the one-point case renders that note and the multi-point case does not.
- [ ] **Step 9: The share bar, back alongside the sparkline.** Each group card prints its share as text (`20.4% of total`). Add a small bar beside that text showing the share against a full 100%, so the card carries both shapes: the sparkline says how this group moved over time, the bar says how much of the portfolio it is. They answer different questions and both belong.

  **Mind why the previous bar was removed.** The final review found every one of these announcing a coarser figure than the visible text: Radix `Progress` derives `aria-valuetext` from the value and rounds to whole percent, so a card reading `1.6% of total` announced `2%`. `formatShare` carries one decimal specifically "to distinguish two small groups", and rounding collapses exactly that. Either give the bar an `aria-label` plus an `aria-valuetext` matching `formatShare` exactly, or mark it `aria-hidden` because the adjacent text already carries the figure. **Do not ship a third component that announces a rounded number.**
- [ ] **Step 10: Test the share bar.** Assert the bar's width tracks the real share and that its announced value, if it announces one, matches the card's own rendered `formatShare` text character for character. Mutation-verify: rounding the announced value to whole percent must redden the test. Assert against the real corpus, where the purpose lens gives Education 1.6% and Business 21.2%, two shares that a whole-percent rounding visibly distorts.
- [ ] **Step 11:** `bun run check` clean. Commit.

---

### Task 3: Returns over time

**Files:**
- Create: `app/src/ui/charts/ReturnsChart.tsx`, `app/src/ui/charts/ReturnsChart.test.tsx`, `app/src/ui/charts/returnsSeries.ts`, `app/src/ui/charts/returnsSeries.test.ts`
- Modify: `app/src/ui/Tabs.tsx` to mount it in the `growth` panel

**Interfaces:**
- Consumes: `analytics.returns` (`ReturnSeries[]`), `useChartCursor` from task 2.
- Produces: `buildReturnsSeries(returns, series)` returning per-account plottable points carrying their `source` and `reason`.

This closes the last unmet line of phase 2b's definition of done: "derived returns are visibly marked as derived".

- [ ] **Step 1: Write the failing tests, against the real corpus.** Exactly 2 of 14 accounts carry `source: "stated"` points; 12 are derived-only. A `"stated"` point plots from `statedMwr`; a `"derived"` point plots from `periodReturn`.
- [ ] **Step 2: Write the failing test for the null cases, and these are the ones that matter.** A derived point whose `periodReturn` is null carries a `reason` of `"no-prior-period"`, `"insufficient-data"` or `"unreconciled-flow"`. **It must not be plotted as zero**, must break the line rather than being interpolated across, and its reason must be reachable in the UI. A `statedMwr` horizon that is null (a three-year rate on an account younger than three years) is "not applicable", already parsed to null upstream rather than a measured zero, and must not render as 0.00%.
- [ ] **Step 3: Run them, confirm they fail, implement, confirm they pass.** Mutation-verify: coercing a null `periodReturn` to 0 must redden step 2's test.
- [ ] **Step 4: The chart.** Stated points draw solid, derived points draw dashed, per the grammar. A legend states which is which in words, not by colour alone.
- [ ] **Step 5: Provenance on screen.** State plainly that 2 of 14 accounts have statement-stated rates and the rest are computed. A reader must not infer the whole portfolio has audited returns.
- [ ] **Step 6:** `bun run check` clean. Commit.

---

### Task 4: Contributions per year against room

**Files:**
- Create: `app/src/ui/charts/ContributionsChart.tsx`, `app/src/ui/charts/ContributionsChart.test.tsx`, `app/src/ui/charts/contributionsSeries.ts`, `app/src/ui/charts/contributionsSeries.test.ts`
- Modify: `app/src/ui/Tabs.tsx` to mount it in the `growth` panel

**Interfaces:**
- Consumes: `series[].contributionsByYear`, `series[].months[].contributionsSource`, `analytics.rooms`.
- Produces: `buildContributionsSeries(analytics)` returning per-year, per-wrapper contributed totals with a `source` of `"stated"` or `"derived"`.

- [ ] **Step 1: Write the failing tests against the real corpus.** Four years, 2023 to 2026. RESP `contributionsByYear` is `{"2026": 3000}`. RRSP 2026 is 33,000, FHSA 2026 is 8,000, TFSA 2026 is 7,000.
- [ ] **Step 2: Write the failing test for the limit line, and mind the trap phase 2b's task 4 was built around.** RESP's `limit` is **null**: it has no annual contribution limit at all, only the $50,000 lifetime cap. Render **no limit line for RESP**, not a zero and not a placeholder. For a non-assessed wrapper the limit is the generic CRA annual maximum, against which **carry-forward is not visible**, so a bar reaching or passing the line is not an over-contribution and must not be labelled as one. Only RRSP 2026 is assessed (limit 70,752, remaining 37,752).
- [ ] **Step 3: Run them, confirm they fail, implement, confirm they pass.**
- [ ] **Step 4: The derived marker.** A wrapper whose contributions are derived rather than stated draws hatched and says so. Mutation-verify: dropping the source distinction must redden a test.
- [ ] **Step 5:** `bun run check` clean. Commit.

---

### Task 5: Monthly cashflow

**Files:**
- Create: `app/src/ui/charts/CashflowChart.tsx`, `app/src/ui/charts/CashflowChart.test.tsx`, `app/src/ui/charts/cashflowSeries.ts`, `app/src/ui/charts/cashflowSeries.test.ts`
- Modify: `app/src/ui/Tabs.tsx` to mount it in the `growth` panel

**Interfaces:**
- Consumes: `series[].months[].deposits` and `.withdrawals`.
- Produces: `buildCashflowSeries(series)` returning per-period deposits and withdrawals over `inTotals: true` accounts.

- [ ] **Step 1: Write the failing test.** Deposits and withdrawals diverge from a zero axis, deposits up and withdrawals down. Only `inTotals: true` accounts contribute, matching `buildPortfolioSeries`.
- [ ] **Step 2: Write the failing test for the absent month.** `deposits` and `withdrawals` are **zero when unstated** (a CASH-template statement carries no `paidIn`/`paidOut` block), which is not the same as a month with no statement at all. A month absent from `months[]` contributes nothing and leaves a gap; a month present with zero draws a real zero. Assert both, distinctly.
- [ ] **Step 3: Run them, confirm they fail, implement, confirm they pass.** Mutation-verify that treating an absent month as a stated zero reddens step 2.
- [ ] **Step 4:** `bun run check` clean. Commit.

---

### Task 6: Value at market against value at cost

**Files:**
- Create: `app/src/ui/charts/CostGapChart.tsx`, `app/src/ui/charts/CostGapChart.test.tsx`
- Modify: `app/src/ui/Tabs.tsx` to mount it in the `growth` panel

**Interfaces:**
- Consumes: `buildPortfolioSeries` from `portfolioSeries.ts` (already returns both `marketValue` and `bookCost` per period).

- [ ] **Step 1: Write the failing test against the real corpus.** The series ends 2026-06 at market $241,739.67 against book $223,675.08. The gap is the difference between the two, drawn as its own series.
- [ ] **Step 2: Write the failing test for the caveat.** Converted USD book cost is **an approximation**: it diverges on 19 statements by up to $218.92, because each statement discloses one month-end rate scoped to market value while book cost accumulates at each purchase's own historical rate. The chart must label the gap approximate and must not present it as a realized or filing figure. Assert the caveat renders adjacent to the figure, not in a page footnote.
- [ ] **Step 3: Run them, confirm they fail, implement, confirm they pass.**
- [ ] **Step 4:** `bun run check` clean. Commit.

---

### Task 6b: The stated return rates do not reconcile, and one of them is provably wrong

**Run this BEFORE task 8.** Task 8 fits the projection's return rate from the stated money-weighted rates. Only 2 of 14 accounts carry any, and the evidence below says one of those two is unusable. If it is dropped, the fitted rate rests on a single account and that changes what task 8 can honestly claim.

**Files:** `app/src/ingest/performance.ts` and its tests, `app/src/validate/checks.ts`, `app/src/corrections.ts`, `data/reconciliation.json`

**The evidence.** Account `d6d9` (RRSP managed) received one $12,000 deposit at 2025-11 and has had **zero flows since**. With no flows, a since-inception return must move monotonically with market value. It does not:

| Period | Market value | Cumulative vs $12,000 | Stated since-inception |
|---|---|---|---|
| 2025-11 | 11,984.22 | -0.13% | **-4.68%** |
| 2025-12 | 12,006.01 | +0.05% | +0.44% |
| 2026-01 | 11,902.63 | -0.81% | -0.12% |
| 2026-02 | 11,977.14 | -0.19% | **-3.05%** |
| 2026-03 | 12,531.01 | **+4.43%** | **-0.52%** |
| 2026-04 | 12,370.86 | +3.09% | **+10.31%** |

March holds **more** money than April, yet states a **lower** since-inception return. With no flows between them that is arithmetically impossible, so either the parser is reading the wrong figure off the page or Wealthsimple's own statement is internally inconsistent.

A parse fault is the more likely of the two and must be ruled out first. `d6d9`'s statements have unusually many null horizons (`oneYear` null on all six, `currentPeriod` null on three), and a PERFORMANCE statement prints `0.00%` for a horizon shorter than the account's life. A geometry-based reader that mis-associates a value with its horizon label would produce exactly this pattern.

- [ ] **Step 1: Read the source PDFs** for `d6d9` 2025-11 through 2026-04 and record what the returns block literally prints, horizon by horizon. Report the raw text before interpreting it.
- [ ] **Step 2: Route by what you find.** A mis-association is a **parser defect**: fix it, with a fixture test built from the redacted statement, and confirm the corrected series is monotonic against market value. If the statements really do print these figures, it is a **Wealthsimple data error**: record it in `corrections.ts` with its evidence and a dated reason, and leave the figures visible and wrong rather than adjusting them.
- [ ] **Step 3: Write the check that would have caught this.** For an account with no deposits and no withdrawals between two periods, the stated since-inception return must move in the same direction as market value. Add it to `validate/checks.ts` as a reconciliation finding. **Mutation-verify it**: the corpus contains a real violation today, so the check must flag `d6d9` before any fix and stop flagging it after.
- [ ] **Step 4: Re-run `bun run build`** and confirm the finding appears in `data/reconciliation.json` with the right severity.
- [ ] **Step 5: Report the consequence for task 8.** State plainly how many accounts carry usable stated rates after this, and whether a fitted rate is still defensible or whether the projection should seed from market-value history instead.
- [ ] **Step 6:** `bun run check` clean. Commit.

---

### Task 7: Port the projection engine

**Files:**
- Create: `app/src/projection/engine.ts`, `app/src/projection/engine.test.ts`, `app/src/projection/__fixtures__/projection-reference.json`
- Read only: `scripts/src/client/projection.ts` (432 lines), `scripts/src/client/__fixtures__/projection-reference.json` (31 rows)

**Interfaces:**
- Produces: `projectYears(inputs: ProjectionInputs): ProjectionYear[]`, `allocateByAccount(...)`, and the `RegisteredRules`, `ProjectionInputs`, `ProjectionYear`, `AccountAllocation`, `AccountValueSeries` types, all with their existing signatures.

**This is a port, not a rewrite.** The spec is explicit that the engine and its fixture survive the rebuild. It encodes five traps that each cost real debugging.

- [ ] **Step 1: Copy the engine and the fixture across unchanged.** Adjust imports only. Do not restructure, do not rename, do not "improve" the logic.
- [ ] **Step 2: Copy its existing tests across and run them.** The 31-row fixture is a **fixed regression baseline**. Do not regenerate it from live data.
- [ ] **Step 3: Confirm the five traps still have tests, and write any that are missing.** Each of these has bitten once already:
  - **Indexation must compound an UNROUNDED base.** Rounding is a CRA publication rule applied to the figure handed back, never carried forward. Compounding the rounded value pins the TFSA at $7,000 forever, because $7,000 x 1.02 rounds back to $7,000. `roomBase` carries the seed and is not derivable from `contributedThisYear`.
  - **FHSA is statutory, not indexed**, and has two separate endings: contributions stop at the $40,000 lifetime cap, and the account closes 15 years after opening, at which point the whole balance leaves the projection.
  - **RESP contributions counted against the $50,000 lifetime cap are `deposits`, not tagged contributions.** Money arriving as a transfer is still a contribution to CRA. Using tagged contributions undercounts by $450 in the real data.
  - **CESG received is derived from grant rows, never assumed.** The `7200 - received` bound must use total lifetime received, pre-projection plus in-projection.
  - **The RESP contribution target is derived, never a hardcoded rate.** It contributes exactly what claims the grant available that year, floored at $2,500 and ceilinged at $5,000. A flat $5,000 a year exhausts the room early and forfeits roughly $1,700 of grant.
- [ ] **Step 4: Confirm the fixture's known offset is preserved.** The fixture declares integer opening balances ($139,462) while live derivation carries cents ($139,461.37), so a live projection ends about $3 below the fixture. **That is expected. Do not "fix" the engine to close it and do not regenerate the fixture.**
- [ ] **Step 5:** `bun run check` clean. Commit.

---

### Task 8: Derive the projection's inputs from the statements

**Files:**
- Create: `app/src/projection/inputs.ts`, `app/src/projection/inputs.test.ts`, `app/src/projection/fittedRate.ts`, `app/src/projection/fittedRate.test.ts`

**Interfaces:**
- Consumes: `AnalyticsOutput`, `ProjectionInputs` from task 7.
- Produces: `projectionInputs(analytics, overrides): ProjectionInputs`, `fittedReturnRate(returns): { rate: number; statedAccounts: number; statedPoints: number }`.

**This task is what makes the projection stay useful as new statements land.** Every input is derived from `analytics.json` at call time, so a new statement month moves the projection's starting point automatically. Nothing about "today" is hardcoded.

- [ ] **Step 1: Write the failing tests for the derived inputs, against the real corpus.** `opening` per group comes from the latest stated `marketValue` per account rolled to its registration group. `contributedThisYear` comes from `contributionsByYear` for the latest year. `rrspAssessedRemaining` is 37,752, the assessed 2026 figure, and **must come from the assessed line, not from a generic annual maximum**. `lifetimeContributed` for FHSA is 24,000 and for RESP is 3,000. `cesgReceived` is 550.
- [ ] **Step 2: Write the failing test for the seam.** `startYear` is derived from the latest period any counted account reports, which is **2026-06 today, not the calendar date**. Assert that adding a later month to the input moves `startYear`, so the projection tracks the data rather than the clock.
- [ ] **Step 3: Run them, confirm they fail, implement, confirm they pass.** Mutation-verify: sourcing `rrspAssessedRemaining` from the generic maximum instead of the assessed line must redden step 1.
- [ ] **Step 4: Write the failing test for `fittedReturnRate`, which task 6b changed the basis of.** The original plan fitted from the stated money-weighted rates. Task 6b proved `d6d9`'s stated series is a Wealthsimple data error (2026-03 holds more money than 2026-04 and states a lower since-inception return, with no flows between them), leaving **1 of 14 accounts** with a usable stated rate — a single managed TFSA whose product changed mid-history. **Owner decision 2026-08-06: seed from market-value history instead.**

  Derive the rate from the portfolio's own market value over time, net of deposits, across the 37 months and 11 counted accounts in `buildPortfolioSeries`. Return the rate **with its provenance**: how many months and how many accounts it was computed from. The provenance is not decoration; task 9 puts it on screen, and it must say **derived, not stated on any statement**.

- [ ] **Step 5: Write the failing test for the deposit-netting, which is what makes this honest.** A rate computed from market value alone counts deposits as growth. The corpus makes that error large: the portfolio ends at $241,739.67 having received roughly $215,000 of net deposits, so an un-netted figure would read as a spectacular return on a portfolio that mostly grew by being funded. Net the flows, and assert the netted rate against a hand-worked figure on a short synthetic series where the arithmetic is checkable by eye. **Mutation-verify: dropping the deposit netting must redden a test.**

  Also assert the early-series guard. `buildPortfolioSeries`'s first point, 2023-06, is **$0 across 2 accounts** — a real zero, not a gap. A percentage change from a zero base is undefined and must not produce an infinity, a `NaN`, or a silently dropped month.
- [ ] **Step 6: Run them, confirm they fail, implement, confirm they pass.**
- [ ] **Step 7:** `bun run check` clean. Commit.

---

### Task 9: The projections view

**Files:**
- Create: `app/src/ui/projections/ProjectionsView.tsx`, `ProjectionsView.test.tsx`, `app/src/ui/charts/ProjectionChart.tsx`, `ProjectionChart.test.tsx`
- Modify: `app/src/ui/Tabs.tsx` to mount it in the `projections` panel

**Interfaces:**
- Consumes: `projectYears`, `projectionInputs`, `fittedReturnRate`, `useChartCursor`.

- [ ] **Step 1: Write the failing test for the seam, which is this view's whole idea.** History draws **solid** up to the latest statement period; the projection draws **hatched** to the right of it, on one shared x axis. Assert both the join period and that the two are visually distinguished in the DOM, not by colour alone. A reader must be able to see exactly where fact stops and assumption starts.
- [ ] **Step 2: Write the failing test for the provenance block.** The return rate renders with the fitted figure, the fact that it came from stated rates on **2 of 14 accounts over 21 statements**, and the word derived. It must never read as "your return rate". Mutation-verify: dropping the provenance must redden this.
- [ ] **Step 3: Write the failing test for the rate control and its default. Owner decision 2026-08-07, and the default is not the fitted rate.**

  Task 8 fitted **24.84% a year** from 37 months of market-value history, net of deposits. That figure is arithmetically correct and economically implausible as a thirty-year assumption: it compounds to roughly **$188M** on its own, and about **$431M** once contributions are added. It is a three-year window over a strong equity run.

  So the projection **defaults to 6% nominal**, labelled as a conventional long-run assumption and explicitly **not from your data**. The fitted rate renders **beside** it as "your last 37 months ran at 24.84% a year, net of deposits", with the window length stated as the caveat and a control to apply it. The slider moves either way.

  Assert: the default is 6% and not the fitted figure; the fitted figure and its provenance both render; applying it changes the projected end value; and the **history half does not move** when the rate changes. Mutation-verify that defaulting to the fitted rate reddens a test — this is the whole point of the decision and it must not drift back.
- [ ] **Step 4: Run them, confirm they fail, implement, confirm they pass.**
- [ ] **Step 5: The disclaimer, adjacent and not in a footnote.** A projection is the least certain figure in this app: everything else is transcribed from a PDF. Say plainly that it is a scenario, that it assumes a flat return, and that it is not advice or a filing figure. Phase 2b established that a caveat belongs next to the number it qualifies, and that a caveat must not claim more than it can support.
- [ ] **Step 6: The empty and unsupported states.** If no counted account has a stated market value there is nothing to project from, and the view must say so rather than projecting from zero.
- [ ] **Step 7:** `bun run check` clean. Commit.

---

### Task 10: The 2025 assessed RRSP room, and the $1,000 it exposes

**Files:**
- Modify: `app/src/analytics/rooms.ts` (`ASSESSED_ROOM`), `app/src/analytics/rooms.test.ts`
- Possibly: `app/src/corrections.ts`
- Regenerate: `data/analytics.json`

Owner-supplied 2026-08-06: **the 2025 RRSP deduction limit is $60,191.00**, from the notice of assessment. Today `ASSESSED_ROOM` holds only `RRSP: { 2026: 70752 }`, so the 2025 line falls back to the $32,490 generic annual maximum with a correctly null `remaining`.

**Investigate before changing anything.** The figure does not reconcile with our own contributions, and it misses by exactly $1,000. The 2026 entry is documented as $45,191 unused at the end of 2025 plus $25,561 earned, giving $70,752. So $60,191 assessed minus $45,191 unused implies **$15,000 contributed in 2025**. This pipeline computes **$14,000**: $2,000 in 2318 (stated 2025-09) plus $12,000 in d6d9 (stated 2025-11, spanning 11 months). The replaced CSV pipeline also recorded $15,000, so the rebuild has been quietly disagreeing with it.

Prime suspect: **2318 states no contributions figure for 2025-10, 2025-11 or 2025-12** (`contributions: null` for all three). Its last stated year-to-date figure is $2,000 at 2025-09. A contribution in that window is invisible to a delta-of-stated-totals approach, which is how this layer works by design.

- [ ] **Step 1: Read the source statements** for 2318, 2025-10 through 2025-12, and check whether any states a contributions figure the parser is dropping. Report what the documents actually say.
- [ ] **Step 2: Route by what you find.** A stated figure the parser missed is a **parser defect**: fix it, with a fixture test from the redacted statement. No stated figure anywhere means the money arrived in a form the statements do not print, which is a `corrections.ts` entry with its evidence and a dated reason. **Never silently adjust a figure in the parser to make the arithmetic close.**
- [ ] **Step 3: Write the failing test for the 2025 assessed line**, then add `RRSP: { 2025: 60191, 2026: 70752 }` to `ASSESSED_ROOM` with a comment recording the source, matching how the 2026 entry documents its own derivation.
- [ ] **Step 4: Assert the consequences.** The 2025 RRSP line becomes `assessed: true` with `limit: 60191` and a real `remaining`. **Assert `remaining` is a positive figure and never negative**, per the rule no room line ever renders a negative remaining.
- [ ] **Step 5: Regenerate `data/analytics.json`** and confirm only the 2025 RRSP room line and the timestamps moved. The grand total must still be $241,739.67 across all three lenses.
- [ ] **Step 6:** `bun run check` clean. Commit.

---

### Task 11: Browser verification and the accessibility pass

**Files:** whatever the pass turns up.

Every review in phase 2b that read only a diff missed something a browser found: seventeen `h1` elements, a focus ring that did not track the theme, and progress bars announcing a coarser figure than the visible text.

- [ ] **Step 1: Run the app and look at it.** `bun dev` plus Playwright. All six tabs, both themes.
- [ ] **Step 2: Verify the grammar reads.** A derived series must be distinguishable from a stated one **without relying on colour**, since colour alone fails for colour-blind readers and in high-contrast modes.
- [ ] **Step 3: Verify every tooltip.** Hover and keyboard, on the big chart and a group chart, including a gap period. Confirm no interpolated value and no `$0.00` where there is no statement.
- [ ] **Step 4: Measure contrast** for every new colour, size and weight combination against its resolved background, in both themes. AA for normal text. Report the measured numbers, not an impression.
- [ ] **Step 5: Keyboard.** Tab through all six panels. Radix Tabs use a roving tabindex; confirm arrow keys move between tabs and that every chart cursor is reachable.
- [ ] **Step 6: Heading structure.** One `h1`, no skipped levels, in every panel.
- [ ] **Step 7: Reduced motion.** Emulate `prefers-reduced-motion: reduce` and confirm every new animation is **skipped**, not shortened.
- [ ] **Step 8: Fix what you find**, then `bun run check` clean. Commit.

---

## Definition of done

- Six tabs, hash-synced, each keyboard reachable; `#projections` survives a reload.
- Tooltips on the big chart and the group charts, keyboard as well as pointer, reporting "No statement for this month" over a gap and never an interpolated or zero value.
- Returns, contributions against room, cashflow, and the market-versus-cost gap all render, each obeying the chart grammar.
- Derived returns and derived contributions are visibly marked as derived, closing phase 2b's last unmet definition-of-done line.
- No chart plots a null as zero; no chart interpolates across a missing month.
- RESP renders no annual contribution limit; no non-assessed wrapper is labelled over-contributed.
- The projection engine is ported unchanged and its 31-row fixture passes, including the known ~$3 offset.
- The projection derives every input from `analytics.json`, so a new statement month moves its starting point with no code change.
- The fitted rate renders with its provenance (37 months, 11 counted accounts, 35 month to month steps) and is adjustable. The "2 of 14 accounts, 21 points" basis this line carried until 2026-08-07 was the stated money-weighted rates, which the owner decision abandoned as the fitting base; that figure is still correct about the returns chart's provenance and wrong about the fitted rate's.
- The seam between recorded history and projection is visible without relying on colour.
- `bun run check` clean, all tests passing, no tracked file contains a real identifier.

## Deferred

- Goal tracking and room runway, the remaining two phase 3 features.
- Storing past projections to compare a prior forecast against what happened. It needs persistence, which this local read-only tool does not have.
- The TFSA 2025 line showing $21,000 against a $7,000 annual maximum with no signal. Flagged by phase 2b's final review as an owner decision: the no-over-flag rule is right against a generic maximum, but a line at 300% and one at 50% currently render identically.
- Deleting the old `scripts/` CSV pipeline and `notes/index.html`, once the engine port in task 7 is confirmed working.
