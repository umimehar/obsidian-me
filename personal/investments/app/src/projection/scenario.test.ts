import { describe, expect, test } from "bun:test";
import { latestMarketValue } from "../analytics/rollup";
import { defaultSelection } from "../ui/chartAccounts";
import { loadAnalytics } from "../ui/data";
import { deflate, milestoneYear, retirementIncome, runScenarios } from "./scenario";

const analytics = loadAnalytics();
const CRYPTO = "acct_e2d627ff";

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

describe("milestoneYear", () => {
  const selected = defaultSelection(analytics.series);
  const set = runScenarios(analytics, selected, {
    rate: 0.06,
    spread: 0.02,
    inflation: 0.025,
    years: 30,
  });

  test("finds the first year real value reaches the threshold", () => {
    const year = milestoneYear(set.base.points, 500_000);
    expect(year).not.toBeNull();
    if (year === null) throw new Error("expected a milestone year");
    const point = set.base.points.find((p) => p.year === year);
    expect(point?.real).toBeGreaterThanOrEqual(500_000);
  });

  test("returns null when the threshold is never reached within the horizon", () => {
    expect(milestoneYear(set.base.points, 1_000_000_000_000)).toBeNull();
  });
});

describe("retirementIncome", () => {
  const selected = defaultSelection(analytics.series);
  const set = runScenarios(analytics, selected, {
    rate: 0.06,
    spread: 0.02,
    inflation: 0.025,
    years: 30,
  });
  const startYear = Number(set.startYear);

  test("monthly income is the real balance times the withdrawal rate over twelve months", () => {
    const year = startYear + 10;
    const income = retirementIncome(set.base.points, year, 0.04);
    expect(income).not.toBeNull();
    if (income === null) throw new Error("expected a retirement income figure");
    expect(income.monthly).toBeCloseTo((income.balance * 0.04) / 12, 6);
  });

  test("is null for a year outside the projected window", () => {
    expect(retirementIncome(set.base.points, startYear + 1000, 0.04)).toBeNull();
  });
});
