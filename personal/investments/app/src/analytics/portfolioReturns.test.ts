import { describe, expect, test } from "bun:test";
import { GOLDENS } from "../goldens";
import { fittedReturnRate } from "../projection/fittedRate";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { loadAnalytics } from "../ui/data";
import { buildPortfolioReturns, endingCumulative, returnsWithin } from "./portfolioReturns";
import type { AccountSeries, MonthPoint } from "./types";

function month(period: string, marketValue: number, deposits = 0, withdrawals = 0): MonthPoint {
  return {
    period,
    marketValue,
    bookCost: marketValue,
    cashBalance: null,
    deposits,
    withdrawals,
    contributions: null,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: null,
    grants: 0,
  };
}

function account(months: MonthPoint[]): AccountSeries {
  return {
    maskedId: "acct_a",
    shortId: "aaaa",
    label: "Test",
    kind: "TFSA" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "growth" as Purpose,
    inTotals: true,
    months,
    contributionsByYear: {},
  };
}

describe("buildPortfolioReturns nets money in from growth", () => {
  test("a month that only received a deposit returned nothing", () => {
    // The single most important property. $100 becomes $200 because $100 was
    // paid in: that is a 0% month, and an un-netted reading calls it +100%.
    const points = buildPortfolioReturns([
      account([month("2026-01", 100), month("2026-02", 200, 100)]),
    ]);
    expect(points[1]?.rate).toBeCloseTo(0, 10);
    expect(points[1]?.netFlow).toBe(100);
  });

  test("a withdrawal is added back, so taking money out is not a loss", () => {
    const points = buildPortfolioReturns([
      account([month("2026-01", 200), month("2026-02", 100, 0, 100)]),
    ]);
    expect(points[1]?.rate).toBeCloseTo(0, 10);
  });

  test("real growth on top of a deposit is measured against the opening balance", () => {
    // $100 opens, $100 arrives, closes at $210: the $10 of growth was earned
    // on the $100 that was there, so 10%.
    const points = buildPortfolioReturns([
      account([month("2026-01", 100), month("2026-02", 210, 100)]),
    ]);
    expect(points[1]?.rate).toBeCloseTo(0.1, 10);
  });

  test("the first month has no return, and a zero opening balance yields none either", () => {
    // The corpus really does open at $0.00 across two unfunded accounts. A
    // percentage change from zero is undefined, not flat, and an Infinity here
    // would compound through everything downstream.
    const points = buildPortfolioReturns([
      account([month("2026-01", 0), month("2026-02", 0), month("2026-03", 50, 50)]),
    ]);
    expect(points[0]?.rate).toBeNull();
    expect(points[1]?.rate).toBeNull();
    expect(points[0]?.cumulative).toBeNull();
    expect(points.every((p) => p.rate === null || Number.isFinite(p.rate))).toBe(true);
  });

  test("cumulative compounds the months rather than adding them", () => {
    // Two 10% months are 21%, not 20%.
    const points = buildPortfolioReturns([
      account([month("2026-01", 100), month("2026-02", 110), month("2026-03", 121)]),
    ]);
    expect(points[2]?.cumulative).toBeCloseTo(0.21, 10);
  });
});

describe("returnsWithin re-bases to the window's own start", () => {
  const points = buildPortfolioReturns([
    account([
      month("2025-11", 100),
      month("2025-12", 200),
      month("2026-01", 220),
      month("2026-02", 242),
    ]),
  ]);

  test("a window's return divides the factors rather than subtracting the percentages", () => {
    // Cumulative reaches +100% by Dec and +142% by Feb. Subtracting says the
    // window returned 42 points; dividing says 21%, which is what two 10%
    // months actually are.
    const window = returnsWithin(points, (period) => period.startsWith("2026-"));
    expect(endingCumulative(window)).toBeCloseTo(0.21, 10);
    expect(endingCumulative(points)).toBeCloseTo(1.42, 10);
  });

  test("the window keeps its own first month, computed against the month before it", () => {
    // Clipping BEFORE computing would leave January with no December to
    // measure against, so the window would silently start in February and its
    // percentage would cover a different span than its dollar figure.
    const window = returnsWithin(points, (period) => period.startsWith("2026-"));
    expect(window.map((p) => p.period)).toEqual(["2026-01", "2026-02"]);
    expect(window[0]?.rate).toBeCloseTo(0.1, 10);
    expect(window[0]?.cumulative).toBeCloseTo(0.1, 10);
  });

  test("a window starting at the very beginning has nothing to re-base against", () => {
    const window = returnsWithin(points, (period) => period.startsWith("2025-"));
    expect(window.map((p) => p.period)).toEqual(["2025-11", "2025-12"]);
    expect(endingCumulative(window)).toBeCloseTo(1, 10);
  });

  test("a window matching no month is empty rather than the whole series", () => {
    expect(returnsWithin(points, (period) => period.startsWith("2099-"))).toEqual([]);
  });
});

describe("against the real committed corpus", () => {
  const analytics = loadAnalytics();

  test("the netting is the projection's own, so the two cannot disagree about a deposit", () => {
    // Both read `netFlowsByPeriod`. They are not expected to produce the same
    // number -- the fit is capital-weighted for a thirty-year projection while
    // this chains each month -- but they must agree on sign and on being far
    // below the un-netted reading, which on this corpus is 486.9%/yr.
    const chained = endingCumulative(buildPortfolioReturns(analytics.series));
    expect(chained).not.toBeNull();
    expect(chained ?? 0).toBeGreaterThan(0);
    expect(fittedReturnRate(analytics.series).rate).toBeGreaterThan(0);
  });

  test("every year's window return is finite and computable", () => {
    const points = buildPortfolioReturns(analytics.series);
    for (const year of [2023, 2024, 2025, 2026]) {
      const window = returnsWithin(points, (period) => period.startsWith(`${year}-`));
      expect(window.length).toBeGreaterThan(0);
      const ending = endingCumulative(window);
      expect(ending).not.toBeNull();
      expect(Number.isFinite(ending ?? Number.NaN)).toBe(true);
    }
  });

  test("the corpus's own months are all covered, none dropped or invented", () => {
    const points = buildPortfolioReturns(analytics.series);
    expect(points).toHaveLength(GOLDENS.portfolio.seriesPointCount);
    expect(points[0]?.period).toBe(GOLDENS.corpus.firstPeriod);
    expect(points[points.length - 1]?.period).toBe(GOLDENS.corpus.latestPeriod);
  });
});
