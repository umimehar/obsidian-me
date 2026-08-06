import { describe, expect, test } from "bun:test";
import type { AccountSeries, MonthPoint } from "../../analytics/types";
import type { AccountKind, ManagementStyle } from "../../store/mask";
import type { Purpose } from "../../store/registry";
import { loadAnalytics } from "../data";
import { buildPortfolioSeries } from "./portfolioSeries";

function month(
  period: string,
  marketValue: number | null,
  bookCost: number | null = marketValue,
): MonthPoint {
  return {
    period,
    marketValue,
    bookCost,
    cashBalance: null,
    deposits: 0,
    withdrawals: 0,
    contributions: null,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: null,
    grants: 0,
  };
}

function account(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    kind: "TFSA" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned" as Purpose,
    inTotals: true,
    months: [month("2026-06", 1000)],
    contributionsByYear: {},
    ...overrides,
  };
}

describe("buildPortfolioSeries", () => {
  test("sums marketValue and bookCost across inTotals accounts for one period", () => {
    const a = account({ maskedId: "a", months: [month("2026-01", 1000, 900)] });
    const b = account({ maskedId: "b", months: [month("2026-01", 500, 400)] });
    const points = buildPortfolioSeries([a, b]);
    expect(points).toEqual([
      { period: "2026-01", marketValue: 1500, bookCost: 1300, accountCount: 2 },
    ]);
  });

  test("excludes inTotals: false accounts from the sum", () => {
    const invested = account({ maskedId: "a", months: [month("2026-01", 1000, 900)] });
    const cash = account({
      maskedId: "cash",
      kind: "Chequing",
      inTotals: false,
      months: [month("2026-01", 5000, 5000)],
    });
    const points = buildPortfolioSeries([invested, cash]);
    expect(points).toEqual([
      { period: "2026-01", marketValue: 1000, bookCost: 900, accountCount: 1 },
    ]);
  });

  test("never zero-fills a period an account has no statement for", () => {
    const early = account({
      maskedId: "early",
      months: [month("2026-01", 100, 100), month("2026-02", 200, 200)],
    });
    const late = account({ maskedId: "late", months: [month("2026-02", 50, 50)] });
    const points = buildPortfolioSeries([early, late]);
    expect(points).toEqual([
      { period: "2026-01", marketValue: 100, bookCost: 100, accountCount: 1 },
      { period: "2026-02", marketValue: 250, bookCost: 250, accountCount: 2 },
    ]);
  });

  test("skips a month where marketValue or bookCost is null", () => {
    const cashTemplate = account({
      maskedId: "a",
      months: [month("2026-01", null, null), month("2026-02", 100, 90)],
    });
    const points = buildPortfolioSeries([cashTemplate]);
    expect(points).toEqual([
      { period: "2026-02", marketValue: 100, bookCost: 90, accountCount: 1 },
    ]);
  });

  test("sorts periods ascending regardless of input order", () => {
    const a = account({
      maskedId: "a",
      months: [month("2026-03", 3, 3), month("2026-01", 1, 1), month("2026-02", 2, 2)],
    });
    const points = buildPortfolioSeries([a]);
    expect(points.map((p) => p.period)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  test("returns an empty array for no accounts", () => {
    expect(buildPortfolioSeries([])).toEqual([]);
  });
});

describe("buildPortfolioSeries against the real committed analytics.json", () => {
  const analytics = loadAnalytics();
  const points = buildPortfolioSeries(analytics.series);

  test("ends at 2026-06 with $241,739.67", () => {
    const last = points[points.length - 1];
    expect(last?.period).toBe("2026-06");
    expect(last?.marketValue).toBeCloseTo(241739.67, 2);
  });

  test("has the observed point count for the real corpus", () => {
    // 2023-06 through 2026-06, the range the inTotals accounts actually
    // cover -- not the 2023-06..2026-07 range of the raw statements, since
    // the three Chequing accounts (inTotals: false) are the only ones that
    // reach 2026-07.
    expect(points.length).toBe(37);
    expect(points[0]?.period).toBe("2023-06");
  });

  test("the earliest period reflects fewer accounts than the latest", () => {
    const first = points[0];
    const last = points[points.length - 1];
    expect(first?.accountCount).toBeLessThan(last?.accountCount ?? 0);
  });
});
