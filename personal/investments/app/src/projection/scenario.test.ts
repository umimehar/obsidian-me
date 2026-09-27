import { describe, expect, test } from "bun:test";
import { latestMarketValue } from "../analytics/rollup";
import { accountValues } from "../goals/allocation";
import { defaultSelection } from "../ui/chartAccounts";
import { loadAnalytics } from "../ui/data";
import { projectYears } from "./engine";
import { latestCountedPeriod, projectionInputs } from "./inputs";
import { deflate, milestoneYear, retirementIncome, runScenarios } from "./scenario";
import type { ScenarioPoint } from "./scenario";

const analytics = loadAnalytics();
const CRYPTO = "acct_e2d627ff";
/** "Corporate (self)", 8297: a solo selection whose share of its group is not 1, so an
 * off-by-one in which row of `accountValues` a scenario point reads cannot hide behind a
 * share that happens to cancel it out. */
const CORPORATE_SELF = "acct_8297de15";

describe("deflate", () => {
  test("divides by the inflation factor compounded over the years", () => {
    expect(deflate(1000, 10, 0.025)).toBeCloseTo(1000 / 1.025 ** 10, 10);
  });

  test("is the identity at zero years", () => {
    expect(deflate(1000, 0, 0.025)).toBe(1000);
  });
});

describe("runScenarios, the default selection", () => {
  const selected = defaultSelection(analytics.series);
  const set = runScenarios(analytics, selected, {
    rate: 0.06,
    spread: 0.02,
    inflation: 0.025,
    years: 30,
  });

  test("the base scenario's opening point equals the selected accounts' latest values, summed", () => {
    const expected = analytics.series
      .filter((a) => selected.has(a.maskedId))
      .reduce((sum, a) => sum + (latestMarketValue(a) ?? 0), 0);
    expect(set.base.points[0]?.nominal).toBeCloseTo(expected, 2);
    expect(set.base.points[0]?.real).toBeCloseTo(expected, 2);
  });

  test("the opening point sits at the anchor month, the latest counted statement", () => {
    const anchor = latestCountedPeriod(analytics.series);
    if (anchor === null) throw new Error("expected the real corpus to have a counted period");
    expect(set.startPeriod).toBe(anchor);
    expect(set.base.points[0]?.period).toBe(anchor);
  });

  test("low is the rate minus the spread and high is the rate plus it", () => {
    expect(set.low.rate).toBeCloseTo(0.04, 10);
    expect(set.high.rate).toBeCloseTo(0.08, 10);
    expect(set.base.rate).toBe(0.06);
  });

  test("low clamps at zero rather than going negative", () => {
    const clamped = runScenarios(analytics, selected, {
      rate: 0.01,
      spread: 0.02,
      inflation: 0.025,
      years: 30,
    });
    expect(clamped.low.rate).toBe(0);
  });

  test("every scenario runs the same number of years", () => {
    expect(set.low.points.length).toBe(set.base.points.length);
    expect(set.high.points.length).toBe(set.base.points.length);
  });
});

/**
 * The date fix: a point's `period` is the anchor month plus its position in
 * whole calendar years, never the engine's own `year` field re-read as
 * December of a matching year. The corpus's anchor is 2026-08, so a mutant
 * that drops the "+1" (or otherwise shifts every point's year) moves every
 * one of these five checks by one year in the same direction, which a single
 * hardcoded assertion could miss but five spaced ones cannot.
 */
describe("a point's period is the anchor month, some whole years later", () => {
  const anchor = latestCountedPeriod(analytics.series);
  if (anchor === null) throw new Error("expected the real corpus to have a counted period");
  const [anchorYear, anchorMonth] = anchor.split("-");
  const selected = defaultSelection(analytics.series);
  const set = runScenarios(analytics, selected, {
    rate: 0.06,
    spread: 0.02,
    inflation: 0.025,
    years: 31,
  });

  test.each([1, 2, 5, 10, 31])("point %i sits at anchorYear + %i, same month", (k) => {
    const point = set.base.points[k];
    expect(point?.period).toBe(`${Number(anchorYear) + k}-${anchorMonth}`);
    expect(point?.year).toBe(String(Number(anchorYear) + k));
  });

  test("that point is deflated by exactly that many years, not one more or fewer", () => {
    const point = set.base.points[10];
    if (point === undefined) throw new Error("expected a point at index 10");
    // Computed independently of `deflate`: raw exponentiation against the
    // exact elapsed year count the period check above just proved.
    expect(point.real).toBeCloseTo(point.nominal / 1.025 ** 10, 6);
  });
});

/**
 * `accountValues(rows, series, rate, fhsaCloseYear)` is called here directly,
 * the same production function `runScenarios` calls internally, but the
 * INDEXING under test -- which element of `values[]` a scenario point at
 * array position k reads -- is scenario.ts's own arithmetic, not something
 * this second call could get right by coincidence. 8297's 1/11 share of its
 * group makes a shifted index produce a visibly different number rather than
 * one that happens to match by symmetry.
 */
describe("a covered account's points read the matching row of accountValues, not a shifted one", () => {
  const selected = new Set([CORPORATE_SELF]);
  const rate = 0.05;
  const years = 6;
  const set = runScenarios(analytics, selected, { rate, spread: 0.02, inflation: 0, years });

  const inputs = projectionInputs(analytics, { returnRate: rate, years });
  const rows = projectYears(inputs);
  const expected = accountValues(rows, analytics.series, rate, inputs.fhsaCloseYear).find(
    (v) => v.accountId === "8297",
  );
  if (expected === undefined) throw new Error("expected 8297's own allocation");

  test.each([0, 1, 2, 5])("point k+1 (row index %i) matches accountValues at the same row", (i) => {
    expect(set.base.points[i + 1]?.nominal).toBeCloseTo(expected.values[i] ?? Number.NaN, 6);
  });
});

describe("runScenarios, a selection outside the engine's coverage", () => {
  test("a Crypto-only selection grows at exactly the chosen rate, with no contributions", () => {
    const selected = new Set([CRYPTO]);
    const rate = 0.07;
    const set = runScenarios(analytics, selected, { rate, spread: 0.02, inflation: 0, years: 5 });
    const opening = set.base.points[0]?.nominal ?? 0;
    expect(opening).toBeGreaterThan(0);
    set.base.points.forEach((point, index) => {
      expect(point.nominal).toBeCloseTo(opening * (1 + rate) ** index, 6);
    });
    expect(set.uncompounded).toContain("Crypto");
  });

  test("the same selection under nonzero inflation still deflates the uncompounded account", () => {
    const selected = new Set([CRYPTO]);
    const rate = 0.07;
    const inflation = 0.03;
    const set = runScenarios(analytics, selected, { rate, spread: 0.02, inflation, years: 5 });
    set.base.points.forEach((point, index) => {
      expect(point.real).toBeCloseTo(point.nominal / (1 + inflation) ** index, 6);
    });
    // At a positive inflation rate below the return rate, real growth is
    // slower than nominal growth -- the two must actually differ, or this
    // test could pass with `real` silently equal to `nominal` throughout.
    const last = set.base.points.at(-1);
    expect(last?.real).toBeLessThan(last?.nominal ?? Number.NaN);
  });

  test("an empty selection renders a flat opening of zero rather than throwing", () => {
    const set = runScenarios(analytics, new Set(), {
      rate: 0.06,
      spread: 0.02,
      inflation: 0.025,
      years: 5,
    });
    expect(set.base.points.every((p) => p.nominal === 0)).toBe(true);
  });
});

function point(year: string, real: number): ScenarioPoint {
  return { period: `${year}-08`, year, nominal: real, real };
}

describe("milestoneYear", () => {
  const selected = defaultSelection(analytics.series);
  const set = runScenarios(analytics, selected, {
    rate: 0.06,
    spread: 0.02,
    inflation: 0.025,
    years: 30,
  });

  test("finds the first year real value reaches the threshold, against the real corpus", () => {
    const year = milestoneYear(set.base.points, 500_000);
    expect(year).not.toBeNull();
    if (year === null) throw new Error("expected a milestone year");
    const at = set.base.points.find((p) => p.year === year);
    const before = set.base.points.find((p) => Number(p.year) === Number(year) - 1);
    expect(at?.real).toBeGreaterThanOrEqual(500_000);
    // The FIRST year, not just A year that qualifies: the year immediately
    // before it must not.
    expect(before?.real ?? 0).toBeLessThan(500_000);
  });

  test("returns null when the threshold is never reached within the horizon", () => {
    expect(milestoneYear(set.base.points, 1_000_000_000_000)).toBeNull();
  });

  test("returns the FIRST year reached, not the last, when a dip crosses back over it", () => {
    const points = [
      point("2030", 400_000),
      point("2031", 520_000), // first crossing
      point("2032", 480_000), // dips back under
      point("2033", 600_000), // recrosses
    ];
    expect(milestoneYear(points, 500_000)).toBe("2031");
  });

  test("a value exactly equal to the threshold counts as reached", () => {
    const points = [point("2030", 499_999.99), point("2031", 500_000)];
    expect(milestoneYear(points, 500_000)).toBe("2031");
  });
});

describe("retirementIncome", () => {
  test("monthly income is the real balance times the withdrawal rate over twelve months", () => {
    const points = [point("2056", 1_000_000), point("2057", 1_200_000)];
    const income = retirementIncome(points, 2057, 0.04);
    expect(income).not.toBeNull();
    if (income === null) throw new Error("expected a retirement income figure");
    expect(income.balance).toBe(1_200_000);
    // Hand computed, not derived from the function's own arithmetic:
    // $1,200,000 * 4% / 12 months = $4,000.00 a month.
    expect(income.monthly).toBeCloseTo(4_000, 6);
  });

  test("reads the REAL figure, never the nominal one, when the two differ", () => {
    const points: ScenarioPoint[] = [
      { period: "2057-08", year: "2057", nominal: 2_000_000, real: 1_200_000 },
    ];
    const income = retirementIncome(points, 2057, 0.04);
    expect(income?.balance).toBe(1_200_000);
    expect(income?.monthly).toBeCloseTo((1_200_000 * 0.04) / 12, 6);
    expect(income?.monthly).not.toBeCloseTo((2_000_000 * 0.04) / 12, 6);
  });

  test("is null for a year outside the projected window", () => {
    const points = [point("2056", 1_000_000)];
    expect(retirementIncome(points, 3000, 0.04)).toBeNull();
  });
});
