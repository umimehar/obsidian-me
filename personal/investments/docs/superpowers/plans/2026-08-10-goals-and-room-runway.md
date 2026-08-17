---
title: "Investments phase 3: goals and room runway"
tags: [personal/investments, plan]
created: 2026-08-10
updated: 2026-08-10
status: active
type: spike
personal: investments
---

# Goals and Room Runway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add goal tracking and room runway to the Projections tab, both derived from the rows `projectYears` already returns and both re-judged live when the rate slider moves.

**Architecture:** A new `app/src/goals/` module holds four pure files (config, scope resolution, evaluation, runway) with no React in any of them. Two new components render them inside `ProjectionsView`, which already owns the rate in a `useState` at line 229, so nothing is lifted and no context is introduced. `engine.ts` and its 31-row fixture are not touched.

**Tech Stack:** Bun, Vite, React 19, TypeScript strict, Radix Themes, `d3-scale`, happy-dom + `@testing-library/react`.

## Global constraints

- Bun; never npm. TypeScript strict with `noUncheckedIndexedAccess`; zero `tsc` errors. No `any`, no non-null assertions, no unchecked casts.
- Biome line width 100; cognitive complexity at or under 15. Named exports only. No floating promises. No parent-relative imports past one level.
- Run `bun run build` BEFORE `bun run check`, never after. Phase 2c shipped main red once because a green result predated the change that broke it.
- Never write a real account number, name or address into a tracked file. Masked 4-char shortIds only.
- Zero em-dash characters anywhere in UI copy. Use a comma, a period, or a regular hyphen.
- Every chart or bar is responsive via `viewBox`, carries `role="img"` and a text summary. Dark and light both supported. Contrast AA in both themes.
- Never source anything from `/tmp`. `cp` is aliased to `cp -i` and zsh `noclobber` is set, so both silently refuse rather than erroring: verify every restore by checksum or diff, never by exit code.
- `git grep` silently ignores `\b` here. Never use it to prove an absence.
- **This project has no jest-dom matchers wired in.** `toHaveTextContent`, `toBeInTheDocument` and friends DO NOT EXIST here. Every component test reads `.textContent` or `.getAttribute` and asserts with `toContain`, `toMatch` or `toBe`, the idiom `ProjectionsView.test.tsx` already uses. The test bodies in tasks 4 and 6 below were written with jest-dom matchers by mistake, corrected 2026-08-17 after the task 4 implementer caught it. Treat them as pseudocode for the assertion's intent and write the real idiom.
- **Never assert a coarse money figure absent by plain substring.** `"$50,180.10"` contains `"$50,180"`, so an assertion that the coarse form is absent fails on correct output. Use a lookahead excluding the decimal point, `/\$50,180(?!\.)/`. That is what every precision assertion in this plan means, including the one in task 4 step 1 that was written the unsatisfiable way.

## The test bar this project holds

**Every rendered figure and every drawn mark must be reddened by some test**, including y positions, heights, dashes, strokes and fills. Not "every test is reddened by some mutation", which is the easy direction: three separate charts shipped marks drawable at half height with a fully green suite. Before any task reports done, replace each figure its views print with a literal and confirm a test fails. Report that audit.

**Ratio tests cannot catch a uniform scale error.** Compressing two marks equally preserves every ratio between them. Anchor a mark's extent to the axis's own rendered gridline tick; `chartTestSupport.ts` exports `tickY(label)` for exactly this.

**One formatting call feeds the visible text, the `aria-label` and any live announcement.** Six precision defects of this shape have shipped: $241,740 for $241,739.67, 20% for 20.4%, 2% for 1.6%, 47% for 46.641%. `formatCurrency` and `formatRate` in `src/ui/format.ts` are the only formatters allowed near a rendered figure; the axis formatters are for gridlines.

**Assert against the committed `data/analytics.json`.** A hand-built fixture is correct only for a case the corpus provably cannot reach, and the report must say which case and why.

## Corpus figures, verified 2026-08-10 at 6%

Every number below was produced by running the real engine over the committed artifact. Tasks assert against these.

| Fact | Value |
|---|---|
| `startYear` | 2026 |
| Accounts the projection covers | 2318, 91b8, 9710, 97ab, c2e9, d6d9, d77c, e2ec (8 of 11 counted) |
| Opening by group | TFSA 48,155.28 · RRSP 49,314.45 · FHSA 28,295.25 · RESP 3,943.98 · Corporate 51,232.39 |
| `fhsaCloseYear` | 2039 |
| `cesgLastYear` | 2042 |
| `rrspLastYear` | 2068 |
| FHSA lifetime room reaches 0 | 2028 |
| RESP lifetime room reaches 0 | 2044 |
| CESG at the final row | 6,650 of a 7,200 cap, so 550 is never claimed |
| Final row | 2056, total value 7,636,455.38 |

Allocation shares and openings, from recent-contribution weighting: 2318 RRSP 0.3000 / 14,509.70 · 97ab RRSP 0.2833 / 14,306.21 · d6d9 RRSP 0.4167 / 20,498.54 · 9710 TFSA 0.1383 / 7,580.33 · d77c TFSA 0.8617 / 40,574.95 · c2e9 RESP 1.0 / 3,943.98 · e2ec FHSA 1.0 / 28,295.25 · 91b8 Corporate 1.0 / 51,232.39.

Goal outcomes at 6%: FHSA e2ec reaches **50,180.10** in 2028 against a 40,000 target, and 0.00 in 2039 when the account closes. RESP c2e9 reaches **92,547.67** in 2042 against a 50,000 target.

**Both shipped goals are met at every rate the slider offers.** The FHSA holds 28,295.25 today with 16,000 of lifetime room left, so it clears 40,000 by 2028 even at a 0% return. That means the corpus cannot reach the shortfall branch, and the required-contribution solve is tested by a declared fixture. Say so in the report rather than implying corpus coverage.

---

### Task 1: The goals config and its scope resolver

**Files:**
- Create: `app/src/goals/config.ts`, `app/src/goals/scope.ts`, `app/src/goals/scope.test.ts`

**Interfaces:**
- Consumes: `Purpose` from `src/store/registry.ts`, `ProjectionGroup` and `projectedAccounts` from `src/projection/inputs.ts`, `AccountSeries` from `src/analytics/types.ts`.
- Produces:

```ts
export type GoalScope =
  | { kind: "portfolio" }
  | { kind: "groups"; groups: readonly ProjectionGroup[] }
  | { kind: "purpose"; purpose: Purpose };

export interface Goal {
  id: string;
  label: string;
  scope: GoalScope;
  target: number;
  by: string;
  /** Where the target and the year came from. Rendered, never decorative. */
  source: string;
}

export interface ScopeCoverage {
  /** Counted accounts matching the scope that the projection covers. */
  covered: readonly AccountSeries[];
  /** Counted accounts matching the scope that it does not. */
  uncovered: readonly AccountSeries[];
  /** Latest stated market value across `covered`. */
  coveredValue: number;
  /** Latest stated market value across `covered` plus `uncovered`. */
  scopeValue: number;
}

export function resolveScope(series: readonly AccountSeries[], scope: GoalScope): ScopeCoverage;
export const GOALS: readonly Goal[];
```

`resolveScope` filters `inTotals` accounts by the scope, then splits them on membership in `projectedAccounts(series)`. All three scope kinds go through this one function so a `portfolio` goal and a `groups` goal naming every group cannot disagree.

- [ ] **Step 1: Write the failing test for the three scope kinds against the real corpus.**

```ts
const analytics = await loadAnalytics();

test("a purpose scope resolves to that purpose's counted accounts", () => {
  const c = resolveScope(analytics.series, { kind: "purpose", purpose: "house" });
  expect(c.covered.map((a) => a.shortId)).toEqual(["e2ec"]);
  expect(c.uncovered).toHaveLength(0);
});

test("a groups scope rolls up every kind in the group", () => {
  const c = resolveScope(analytics.series, { kind: "groups", groups: ["RRSP"] });
  expect(c.covered.map((a) => a.shortId).sort()).toEqual(["2318", "97ab", "d6d9"]);
});

test("a portfolio scope covers the eight projected accounts and names the rest", () => {
  const c = resolveScope(analytics.series, { kind: "portfolio" });
  expect(c.covered.map((a) => a.shortId).sort()).toEqual([
    "2318", "91b8", "9710", "97ab", "c2e9", "d6d9", "d77c", "e2ec",
  ]);
  expect(c.uncovered.map((a) => a.shortId).sort()).toEqual(["1f9a", "2c62", "e2d6"]);
});
```

- [ ] **Step 2: Write the failing test for the coverage split, which is the honest part.**

The `growth` purpose spans two TFSAs plus two non-registered accounts and crypto, and the projection covers only the TFSAs. A card built on this must be able to say so.

```ts
test("a growth scope reports the three accounts the projection cannot forecast", () => {
  const c = resolveScope(analytics.series, { kind: "purpose", purpose: "growth" });
  expect(c.covered.map((a) => a.shortId).sort()).toEqual(["9710", "d77c"]);
  expect(c.uncovered.map((a) => a.shortId).sort()).toEqual(["1f9a", "2c62", "e2d6"]);
  expect(c.coveredValue).toBeLessThan(c.scopeValue);
});

test("a scope matching no projected account covers nothing rather than zero", () => {
  const c = resolveScope(analytics.series, { kind: "purpose", purpose: "spending" });
  expect(c.covered).toHaveLength(0);
  expect(c.coveredValue).toBe(0);
});
```

- [ ] **Step 3: Run both, confirm they fail, implement `scope.ts`, confirm they pass.**

- [ ] **Step 4: Write the failing test for the shipped config.** Two goals ship. No retirement or growth goal ships, because their targets are personal figures nobody supplied and a card renders a verdict, so an invented target manufactures a verdict.

```ts
test("the shipped goals are the two with statutory targets", () => {
  expect(GOALS.map((g) => g.id)).toEqual(["house", "education"]);
  const house = GOALS[0];
  expect(house?.target).toBe(40000);
  expect(house?.by).toBe("2028");
  expect(house?.scope).toEqual({ kind: "purpose", purpose: "house" });
  const education = GOALS[1];
  expect(education?.target).toBe(50000);
  expect(education?.by).toBe("2042");
});

test("every goal states where its target came from", () => {
  for (const goal of GOALS) expect(goal.source.length).toBeGreaterThan(20);
});
```

- [ ] **Step 5: Implement `config.ts`.** Each entry carries a `source` string that renders on the card: the house goal's is the FHSA $40,000 lifetime cap, the education goal's is the $50,000 RESP lifetime cap with its 2042 year taken from `cesgLastYear`, which is `DEFAULT_RESP_BIRTH_YEAR` (2025) plus 17 and therefore a documented default rather than a confirmed birth year. Say that in the string.

- [ ] **Step 6: Mutation audit.** Confirm each of these reddens at least one test, and report the counts: swapping the covered/uncovered split so uncovered accounts count as covered; returning `scopeValue` for `coveredValue`; adding a third goal to `GOALS`; changing the house target to 45000.

- [ ] **Step 7:** `bun run build`, then `bun run check` clean. Commit.

---

### Task 2: Per-account allocation over the projection

**Files:**
- Create: `app/src/goals/allocation.ts`, `app/src/goals/allocation.test.ts`

**Interfaces:**
- Consumes: `allocateByAccount`, `AccountAllocation`, `AccountValueSeries`, `ProjectionYear` from `src/projection/engine.ts`; `projectedAccounts` from `src/projection/inputs.ts`.
- Produces:

```ts
export function buildAllocations(series: readonly AccountSeries[]): AccountAllocation[];
export function accountValues(
  rows: readonly ProjectionYear[],
  series: readonly AccountSeries[],
  returnRate: number,
  fhsaCloseYear: string,
): AccountValueSeries[];
```

The engine is per-group because CRA room is assessed per person and per group. A goal scoped to one account inside a shared group needs that group's money split, and `allocateByAccount` already exists for it. This task supplies its inputs and nothing else. `engine.ts` is not edited.

`share` is each account's fraction of its group's contributions from 2025 onward, which is the owner's actual funding pattern rather than an invented split. A group whose accounts contributed nothing in that window splits evenly, so a share is never `NaN` from a zero denominator. `opening` is the account's latest stated `marketValue`, skipping null months, matching how `openingByGroup` reads the registration rollup.

- [ ] **Step 1: Write the failing test for the shares against the real corpus.**

```ts
test("shares are the group's recent contribution split", () => {
  const allocs = buildAllocations(analytics.series);
  const rrsp = allocs.filter((a) => a.group === "RRSP");
  expect(rrsp.map((a) => a.accountId).sort()).toEqual(["2318", "97ab", "d6d9"]);
  const d6d9 = rrsp.find((a) => a.accountId === "d6d9");
  expect(d6d9?.share).toBeCloseTo(0.4167, 4);
  expect(rrsp.reduce((t, a) => t + a.share, 0)).toBeCloseTo(1, 10);
});

test("a sole account in its group takes the whole group", () => {
  const allocs = buildAllocations(analytics.series);
  expect(allocs.find((a) => a.accountId === "e2ec")?.share).toBe(1);
  expect(allocs.find((a) => a.accountId === "e2ec")?.opening).toBeCloseTo(28295.25, 2);
});
```

- [ ] **Step 2: Write the failing invariant test, and this is the one that matters.** Per-account values must sum to the engine's own total in every year. If they do not, a goal card and the chart above it are describing different portfolios.

```ts
test("allocated values sum to the engine total in every single year", () => {
  const inputs = projectionInputs(analytics, { returnRate: 0.06 });
  const rows = projectYears(inputs);
  const values = accountValues(rows, analytics.series, 0.06, inputs.fhsaCloseYear);
  rows.forEach((row, i) => {
    const summed = values.reduce((t, s) => t + (s.values[i] ?? 0), 0);
    expect(summed).toBeCloseTo(row.value, 6);
  });
  expect(rows[rows.length - 1]?.value).toBeCloseTo(7636455.38, 2);
});
```

- [ ] **Step 3: Write the failing test for the FHSA closure, which the allocator handles separately.**

```ts
test("the FHSA is emptied in its closure year, not merely stopped", () => {
  const inputs = projectionInputs(analytics, { returnRate: 0.06 });
  const rows = projectYears(inputs);
  const values = accountValues(rows, analytics.series, 0.06, inputs.fhsaCloseYear);
  const fhsa = values.find((s) => s.accountId === "e2ec");
  const at = (year: string) => fhsa?.values[rows.findIndex((r) => r.year === year)];
  expect(at("2028")).toBeCloseTo(50180.1, 2);
  expect(at("2039")).toBe(0);
});
```

- [ ] **Step 4: Run all three, confirm they fail, implement, confirm they pass.**

- [ ] **Step 5: Mutation audit.** Report the fail counts for: splitting every group evenly instead of by contribution; using the first stated `marketValue` instead of the latest as `opening`; dropping the FHSA closure argument so the account keeps compounding past 2039; summing over all `series` rather than `projectedAccounts` so the three uncovered accounts enter the allocation.

- [ ] **Step 6:** `bun run build`, then `bun run check` clean. Commit.

---

### Task 3: Evaluating a goal

**Files:**
- Create: `app/src/goals/evaluate.ts`, `app/src/goals/evaluate.test.ts`

**Interfaces:**
- Consumes: task 1's `Goal`/`resolveScope`, task 2's `accountValues`.
- Produces:

```ts
export interface GoalVerdict {
  goal: Goal;
  /** Null when the scope covers no projected account, or the target year is past the projection. */
  projected: number | null;
  /** `projected - target`. Null whenever `projected` is. Positive is a surplus. */
  gap: number | null;
  /** Extra contribution per month that closes a shortfall. Null when there is no shortfall or none can. */
  monthlyToClose: number | null;
  /** Set when a shortfall cannot be closed by contributing, with the reason in words. */
  blocked: string | null;
  coverage: ScopeCoverage;
}

export function evaluateGoal(
  goal: Goal,
  analytics: AnalyticsOutput,
  rows: readonly ProjectionYear[],
  returnRate: number,
  fhsaCloseYear: string,
): GoalVerdict;
```

**The solve must mirror the engine's own convention.** `engine.ts` grows the opening balance and lands contributions at year end, where they earn nothing in their own year. So an extra annual amount `E` contributed over `n` years is worth `E * ((1 + r)^n - 1) / r` at the end, and `E / 12` is the monthly figure the card prints. A textbook annuity-due formula assumes start-of-year contributions, returns a smaller `E`, and would have the card quietly contradict the chart beside it. At `r` of exactly 0 the closed form divides by zero, so that case returns `gap / n` directly.

- [ ] **Step 1: Write the failing tests for the two shipped goals against the real corpus, both of which are met.**

```ts
test("the house goal clears its 40,000 target in 2028", () => {
  const v = evaluateGoal(GOALS[0]!, analytics, rows6, 0.06, "2039");
  expect(v.projected).toBeCloseTo(50180.1, 2);
  expect(v.gap).toBeCloseTo(10180.1, 2);
  expect(v.monthlyToClose).toBeNull();
  expect(v.blocked).toBeNull();
});

test("the education goal clears its 50,000 target in 2042", () => {
  const v = evaluateGoal(GOALS[1]!, analytics, rows6, 0.06, "2039");
  expect(v.projected).toBeCloseTo(92547.67, 2);
  expect(v.gap).toBeGreaterThan(0);
  expect(v.monthlyToClose).toBeNull();
});
```

- [ ] **Step 2: Write the failing test for the shortfall solve. DECLARE THIS AS A FIXTURE CASE.**

The corpus cannot reach a shortfall: the FHSA holds 28,295.25 with 16,000 of room left, so it clears 40,000 by 2028 at a 0% return, and the RESP clears 50,000 with room to spare. The fixture raises one goal's target above the projection. State in the report that this branch has no corpus coverage and why, the way phase 2c's task 8 declared its RESP fixture rather than claiming a corpus kill.

```ts
test("a shortfall solves to a monthly figure that, fed back, lands on the target", () => {
  const stretch: Goal = { ...GOALS[0]!, id: "stretch", target: 90000 };
  const v = evaluateGoal(stretch, analytics, rows6, 0.06, "2039");
  expect(v.gap).toBeLessThan(0);
  expect(v.monthlyToClose).not.toBeNull();

  // Feed it back through the engine's own convention and land on the target.
  const years = 2028 - 2026 + 1;
  const annual = (v.monthlyToClose ?? 0) * 12;
  const grown = annual * (1.06 ** years - 1) / 0.06;
  expect((v.projected ?? 0) + grown).toBeCloseTo(90000, 2);
});

test("a zero return rate solves without dividing by zero", () => {
  expect(Number.isFinite(contributionToClose(-50000, 3, 0))).toBe(true);
});
```

- [ ] **Step 3: Write the failing test for the null cases, which must never render as zero.**

```ts
test("a scope covering no projected account is unprojectable, not zero", () => {
  const g: Goal = { ...GOALS[0]!, id: "x", scope: { kind: "purpose", purpose: "spending" } };
  const v = evaluateGoal(g, analytics, rows6, 0.06, "2039");
  expect(v.projected).toBeNull();
  expect(v.gap).toBeNull();
  expect(v.monthlyToClose).toBeNull();
});

test("a target year past the projection's last row is unprojectable, not clamped", () => {
  const g: Goal = { ...GOALS[0]!, id: "x", by: "2099" };
  const v = evaluateGoal(g, analytics, rows6, 0.06, "2039");
  expect(v.projected).toBeNull();
});
```

- [ ] **Step 4: Write the failing test for the room bound.** A shortfall that contributing cannot close must say so rather than print a figure CRA would refuse. The FHSA's lifetime room is exhausted in 2028, so an extra contribution into it is not permitted.

```ts
test("a shortfall the wrapper has no room to close is blocked with a reason", () => {
  const stretch: Goal = { ...GOALS[0]!, id: "stretch", target: 90000 };
  const v = evaluateGoal(stretch, analytics, rows6, 0.06, "2039");
  expect(v.blocked).toContain("room");
  expect(v.monthlyToClose).toBeNull();
});
```

Reconcile this with step 2: the solve is computed either way, and `monthlyToClose` is surfaced only when the room exists to use it. BOTH of step 2's assertions on the returned figure therefore read it off an exported helper rather than off `monthlyToClose`. Name that helper `contributionToClose(gap, years, rate)` and export it, so every test reads the same arithmetic.

Corrected 2026-08-17, mid-execution, after the task 3 implementer caught it: step 2's zero-rate test as first written asserted `monthlyToClose` is finite, which cannot pass for the FHSA fixture at ANY rate. The engine's contribution and room schedule never reads `returnRate`, so FHSA lifetime room is exhausted in 2028 at 0% exactly as it is at 6%, leaving that fixture room-blocked and `monthlyToClose` null in both. The plan was wrong, not the implementation.

- [ ] **Step 5: Run every test, confirm they fail, implement, confirm they pass.**

- [ ] **Step 6: Mutation audit.** Report fail counts for: an annuity-due formula (contributions at start of year) instead of the engine's year-end one; coercing a null `projected` to 0; dropping the room check so a blocked goal prints a figure; taking the target year's row by index rather than by matching `year`.

- [ ] **Step 7:** `bun run build`, then `bun run check` clean. Commit.

---

### Task 4: The goals panel

**Files:**
- Create: `app/src/ui/projections/GoalsPanel.tsx`, `app/src/ui/projections/GoalsPanel.test.tsx`

**Interfaces:**
- Consumes: task 3's `evaluateGoal` and `GoalVerdict`, `formatCurrency` and `formatRate` from `src/ui/format.ts`.
- Produces: `GoalsPanel({ analytics, rows, rate, fhsaCloseYear, goals })`, where `goals` is an optional `readonly Goal[]` defaulting to `GOALS`. It exists so a test can render a scope the shipped config does not carry, not as a runtime feature: nothing passes it in the app.

One card per goal. Headings at `h3` under the view's `h2`, matching the level structure `App.a11y.test.tsx` pins across every panel.

Each card prints: the goal label and its target with the target year, the projected value in that year, the gap in words that name their direction ("ahead of target" or "short of target"), the coverage line, and the goal's `source`. A shortfall card additionally prints the monthly contribution that closes it, or the blocked reason.

**The precision rule.** Whatever a card prints and whatever its `aria-label` announces come from one `formatCurrency` call each. Six defects of this shape have shipped. Do not round for display anywhere.

- [ ] **Step 1: Write the failing test for the met case against the real corpus.**

```ts
test("the house card prints its projected figure at full precision", () => {
  render(<GoalsPanel analytics={analytics} rows={rows6} rate={0.06} fhsaCloseYear="2039" />);
  const card = screen.getByTestId("goal-house");
  expect(card).toHaveTextContent("$50,180.10");
  expect(card).toHaveTextContent("$40,000.00");
  expect(card).toHaveTextContent(/ahead of target/i);
  expect(card).not.toHaveTextContent("$50,180");  // never the coarse form
});
```

- [ ] **Step 2: Write the failing test that the announcement cannot drift from the text.**

```ts
test("the card's accessible name carries the same figure the card prints", () => {
  render(<GoalsPanel analytics={analytics} rows={rows6} rate={0.06} fhsaCloseYear="2039" />);
  const card = screen.getByTestId("goal-house");
  const label = card.getAttribute("aria-label") ?? "";
  expect(label).toContain("$50,180.10");
  expect(label).not.toMatch(/\$50,180(?!\.)/);
});
```

- [ ] **Step 3: Write the failing test for coverage disclosure.** The two shipped goals each cover a single account, so assert the general mechanism on a growth-scoped goal rendered through the same component.

```ts
test("a card whose scope outruns the projection names what it left out", () => {
  render(<GoalsPanel analytics={analytics} rows={rows6} rate={0.06} fhsaCloseYear="2039"
                     goals={[{ ...GOALS[0], id: "growth", scope: { kind: "purpose", purpose: "growth" }, by: "2028" }]} />);
  const card = screen.getByTestId("goal-growth");
  expect(card).toHaveTextContent("2 of 5");
  expect(card).toHaveTextContent(/does not forecast/i);
});
```

- [ ] **Step 4: Write the failing test for the rate coupling, which is the owner's decision made observable.**

```ts
test("raising the rate raises the projected figure and the history is untouched", () => {
  const { rerender } = render(<GoalsPanel analytics={analytics} rows={rows6} rate={0.06} fhsaCloseYear="2039" />);
  const at6 = screen.getByTestId("goal-education").textContent ?? "";
  rerender(<GoalsPanel analytics={analytics} rows={rows12} rate={0.12} fhsaCloseYear="2039" />);
  const at12 = screen.getByTestId("goal-education").textContent ?? "";
  expect(at12).not.toBe(at6);
});
```

- [ ] **Step 5: Write the failing test for the unprojectable card.** It must say so and must never print `$0.00`.

```ts
test("an unprojectable goal says so rather than reading zero", () => {
  render(<GoalsPanel analytics={analytics} rows={rows6} rate={0.06} fhsaCloseYear="2039"
                     goals={[{ ...GOALS[0], id: "none", scope: { kind: "purpose", purpose: "spending" } }]} />);
  const card = screen.getByTestId("goal-none");
  expect(card).toHaveTextContent(/cannot be projected/i);
  expect(card).not.toHaveTextContent("$0.00");
});
```

- [ ] **Step 6: Run them, confirm they fail, implement, confirm they pass.**

- [ ] **Step 7: The figure audit this project requires.** Replace each money figure the panel prints with a literal, one at a time, and confirm a test fails for each. Report the list with pass/fail counts. Any figure with no test gets one before the task is done.

- [ ] **Step 8:** `bun run build`, then `bun run check` clean. Commit.

---

### Task 5: Deriving the room runway

**Files:**
- Create: `app/src/goals/runway.ts`, `app/src/goals/runway.test.ts`

**Interfaces:**
- Consumes: `ProjectionYear` and `ProjectionInputs` from the projection module.
- Produces:

```ts
export interface RunwayRow {
  id: string;
  wrapper: string;
  bound: string;
  /** Null when the bound is never reached inside the projection, which is itself a finding. */
  year: string | null;
  /** What is left when the projection ends, for a bound never reached. Null otherwise. */
  unclaimed: number | null;
  note: string;
}

export function buildRunway(rows: readonly ProjectionYear[], inputs: ProjectionInputs): RunwayRow[];
```

Read structurally from `roomRemaining`, `cumulativeGrant` and the three deadline fields on `ProjectionInputs`. **Never parse `ProjectionYear.notes`.** Those strings are prose for a reader; matching them would make a rendered sentence load-bearing and would break silently the first time one is reworded.

- [ ] **Step 1: Write the failing tests for the cap years against the real corpus.**

```ts
test("the FHSA fills its lifetime cap in 2028 and closes in 2039", () => {
  const runway = buildRunway(rows6, inputs6);
  expect(runway.find((r) => r.id === "fhsa-cap")?.year).toBe("2028");
  expect(runway.find((r) => r.id === "fhsa-close")?.year).toBe("2039");
});

test("the RESP fills its 50,000 cap in 2044", () => {
  expect(buildRunway(rows6, inputs6).find((r) => r.id === "resp-cap")?.year).toBe("2044");
});

test("the RRSP accrues room through 2068", () => {
  expect(buildRunway(rows6, inputs6).find((r) => r.id === "rrsp-last")?.year).toBe("2068");
});
```

- [ ] **Step 2: Write the failing test for the CESG, and this is the row that carries a real finding.** The grant never reaches its $7,200 cap: it stops at $6,650 because the beneficiary ages out in 2042, so $550 is forfeited. A row reporting only "2042" would hide that.

```ts
test("the CESG stops 550 short of its cap because the beneficiary ages out", () => {
  const row = buildRunway(rows6, inputs6).find((r) => r.id === "cesg");
  expect(row?.year).toBe("2042");
  expect(row?.unclaimed).toBeCloseTo(550, 2);
});
```

- [ ] **Step 3: Write the failing test for the TFSA row.** A wrapper absent from the table reads as an oversight; one stating it has no cap reads as an answer.

```ts
test("the TFSA is present and states that it has no lifetime cap", () => {
  const row = buildRunway(rows6, inputs6).find((r) => r.id === "tfsa");
  expect(row).toBeDefined();
  expect(row?.year).toBeNull();
  expect(row?.bound).toMatch(/no lifetime cap/i);
});
```

- [ ] **Step 4: Write the failing test that the derivation is structural, not string-matched.**

```ts
test("rewording the engine's notes cannot move a single runway year", () => {
  const reworded = rows6.map((r) => ({ ...r, notes: r.notes.map(() => "lorem ipsum") }));
  expect(buildRunway(reworded, inputs6)).toEqual(buildRunway(rows6, inputs6));
});
```

- [ ] **Step 5: Write the failing test that the table moves with the rate.** A higher return fills a lifetime cap sooner, so the table sits inside the rate control's blast radius exactly as the goals do.

```ts
test("a higher rate does not move a statutory deadline", () => {
  const r12 = buildRunway(rows12, inputs12);
  expect(r12.find((x) => x.id === "fhsa-close")?.year).toBe("2039");
  expect(r12.find((x) => x.id === "rrsp-last")?.year).toBe("2068");
});
```

The contribution-driven rows may move and the statutory ones must not, which is the distinction this table exists to hold. Assert the deadlines pinned; do not assert a specific moved year unless you verify it by running the engine.

- [ ] **Step 6: Run them, confirm they fail, implement, confirm they pass.**

- [ ] **Step 7: Mutation audit.** Report fail counts for: reading the cap year from `notes` instead of `roomRemaining`; dropping the TFSA row; reporting `cesgLastYear` with no `unclaimed`; using `>` instead of `>=` on the room-reaches-zero test.

- [ ] **Step 8:** `bun run build`, then `bun run check` clean. Commit.

---

### Task 6: The runway table

**Files:**
- Create: `app/src/ui/projections/RunwayTable.tsx`, `app/src/ui/projections/RunwayTable.test.tsx`

**Interfaces:**
- Consumes: task 5's `buildRunway` and `RunwayRow`, `formatCurrency` from `src/ui/format.ts`.
- Produces: `RunwayTable({ rows, inputs })`.

A real `<table>` with a caption and header cells, not a grid of divs, because this is tabular data and a screen reader reading it as a table is the whole point. Heading at `h3`.

- [ ] **Step 1: Write the failing test for the rendered rows against the real corpus.**

```ts
test("the table renders every bound with its year", () => {
  render(<RunwayTable rows={rows6} inputs={inputs6} />);
  const table = screen.getByRole("table");
  expect(within(table).getByText("2028")).toBeInTheDocument();
  expect(within(table).getByText("2039")).toBeInTheDocument();
  expect(within(table).getByText("2044")).toBeInTheDocument();
  expect(within(table).getByText("2068")).toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing test for the two FHSA rows sitting together and reading distinctly.**

```ts
test("the FHSA's cap and its closure are two separate rows", () => {
  render(<RunwayTable rows={rows6} inputs={inputs6} />);
  const cap = screen.getByTestId("runway-fhsa-cap");
  const close = screen.getByTestId("runway-fhsa-close");
  expect(cap).toHaveTextContent("2028");
  expect(close).toHaveTextContent("2039");
  expect(cap.textContent).not.toBe(close.textContent);
});
```

- [ ] **Step 3: Write the failing test for the forfeited CESG at full precision.**

```ts
test("the CESG row prints the 550 that is never claimed", () => {
  render(<RunwayTable rows={rows6} inputs={inputs6} />);
  expect(screen.getByTestId("runway-cesg")).toHaveTextContent("$550.00");
});
```

- [ ] **Step 4: Write the failing test for the no-cap row rendering as words, never as a blank cell or a dash.**

```ts
test("the TFSA row says it has no lifetime cap rather than leaving a cell empty", () => {
  render(<RunwayTable rows={rows6} inputs={inputs6} />);
  const row = screen.getByTestId("runway-tfsa");
  expect(row).toHaveTextContent(/no lifetime cap/i);
  expect(row.textContent?.trim()).not.toBe("");
});
```

- [ ] **Step 5: Run them, confirm they fail, implement, confirm they pass.**

- [ ] **Step 6: The figure audit.** Replace each figure and year the table prints with a literal, one at a time, confirm a test fails for each, and report the list.

- [ ] **Step 7:** `bun run build`, then `bun run check` clean. Commit.

---

### Task 7: Mount both in the Projections tab

**Files:**
- Modify: `app/src/ui/projections/ProjectionsView.tsx`, `app/src/ui/projections/ProjectionsView.test.tsx`

Both components render as siblings below `<ProjectionChart>`, taking `rows`, `rate` and the inputs the view already computes. Nothing is lifted: the rate lives in `ProjectionsView`'s `useState` at line 229 and both new children read it as a prop.

**Phase 2c's task 4 shipped a chart mounted nowhere with the full suite green**, and its own brief's only Modify instruction was the untested one. Do not repeat it.

- [ ] **Step 1: Write the failing mount tests.**

```ts
test("the projections tab renders the goals panel", () => {
  render(<ProjectionsView analytics={analytics} />);
  expect(screen.getByTestId("goal-house")).toBeInTheDocument();
});

test("the projections tab renders the runway table", () => {
  render(<ProjectionsView analytics={analytics} />);
  expect(screen.getByTestId("runway-fhsa-close")).toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing test that the slider re-judges a goal.** This is the owner's decision, made observable end to end rather than only at the unit level.

```ts
test("moving the rate slider changes a goal's projected figure", async () => {
  render(<ProjectionsView analytics={analytics} />);
  const before = screen.getByTestId("goal-education").textContent ?? "";
  const slider = screen.getByRole("slider", { name: /annual return assumed/i });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  await waitFor(() => {
    expect(screen.getByTestId("goal-education").textContent).not.toBe(before);
  });
});
```

If Radix's slider does not respond to synthetic key events under happy-dom, drive the change through the view's own `onRateChange` instead and say in the report that the keyboard path is covered by the browser pass in task 8, rather than deleting the assertion.

- [ ] **Step 3: Write the failing test for the empty state.** `ProjectionsView` returns `<EmptyState />` when `openingTotal <= 0`. Neither new child may render in that branch, and neither may throw reaching it.

```ts
test("neither goals nor runway render when there is nothing to project from", () => {
  const empty = { ...analytics, series: analytics.series.map((s) => ({ ...s, months: [] })) };
  render(<ProjectionsView analytics={empty} />);
  expect(screen.queryByTestId("goal-house")).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
});
```

- [ ] **Step 4: Run them, confirm they fail, implement, confirm they pass.**

- [ ] **Step 5: Heading levels.** The view's `h2` is "Thirty year projection". Both new sections sit at `h3`, no level skipped. Confirm `App.a11y.test.tsx`'s per-panel level loop still passes with both mounted.

- [ ] **Step 6: Mutation audit.** Deleting each component from the view must redden a test. Report both counts.

- [ ] **Step 7:** `bun run build`, then `bun run check` clean. Commit.

---

### Task 8: Browser verification and the accessibility pass

**Files:** whatever the pass turns up.

Five times in this build a browser found what a diff could not: seventeen `h1` elements, a focus ring that ignored the theme, a legend swatch clipped so the mark teaching "derived" was itself unreadable, three unmeasured contrast failures, and a dark-mode bug where Radix ships no `prefers-color-scheme` query so `inherit` always rendered light. Read the page, do not infer it.

- [ ] **Step 1: Run the app and look at it.** `bun dev` plus Playwright, the Projections tab, both themes. Screenshot both.
- [ ] **Step 2: Measure contrast.** `bun run contrast` over all six tabs in both themes. Report the measured worst ratios, not an impression. Every new badge, callout, table cell and caption is a new colour/size/weight combination and each needs a number.
- [ ] **Step 3: Keyboard.** Tab to the rate slider, move it with arrow keys, and confirm every goal card and the runway table update. Confirm the table is reachable and that its header cells are announced as headers.
- [ ] **Step 4: Verify the disclosure reads.** A goal card's coverage line and the CESG row's forfeited $550 must be legible without hovering anything and without relying on colour.
- [ ] **Step 5: Reduced motion.** Emulate `prefers-reduced-motion: reduce` and confirm any new animation is skipped, not shortened.
- [ ] **Step 6: Heading structure.** One `h1` on the page, `h2` for the view, `h3` for both new sections, no skipped levels.
- [ ] **Step 7: Fix what you find.** Then `bun run build`, `bun run check` clean, `bun run contrast` clean. Kill the dev server and commit no Playwright artifacts.
- [ ] **Step 8:** Commit.

---

## Definition of done

- Goals config supports portfolio, groups and purpose scopes, with two goals shipped and their targets sourced in words on screen.
- Every goal card prints its projected value, its gap, and its coverage against the scope's real total, all at full precision, with the announcement fed by the same formatting call as the text.
- A goal the projection cannot reach renders unprojectable and never `$0.00`.
- The required-contribution solve mirrors the engine's year-end convention, is bounded by room, and its fixture-only coverage is declared rather than implied.
- Per-account allocated values sum to the engine's own total in every year of the projection.
- The runway table carries six bounds, derived structurally and never from `notes`, with the FHSA's cap and closure as separate rows and the CESG's forfeited $550 stated.
- Both render inside the Projections tab, both re-judge when the rate slider moves, and both are absent in the empty state.
- `bun run build` then `bun run check` clean; `bun run contrast` clean on all six tabs in both themes; browser pass done with measured numbers reported.
- No tracked file contains a real identifier.

## Deferred

- The TFSA assessed room figure and the `ASSESSED_ROOM` entry it enables. Owner input outstanding.
- A retirement or growth goal. Both need an owner-supplied target.
- Storing past projections to compare a prior forecast against what happened. Needs persistence this tool does not have.
- The TFSA 2025 line reading $25,000 against a $7,000 generic maximum with no signal, still an owner decision.
- Deleting `scripts/` and `notes/index.html`.
