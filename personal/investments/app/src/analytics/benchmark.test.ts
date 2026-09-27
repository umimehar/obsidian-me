import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { simulateBenchmark, skippedPeriods } from "./benchmark";
import type { AccountSeries, MonthPoint } from "./types";

function month(
  period: string,
  marketValue: number,
  deposits = 0,
  bookCost = marketValue,
): MonthPoint {
  return {
    period,
    marketValue,
    bookCost,
    cashBalance: null,
    deposits,
    withdrawals: 0,
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
    maskedId: "acct_fixture",
    shortId: "fixt",
    label: "Fixture account",
    kind: "NonRegistered" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "growth" as Purpose,
    inTotals: true,
    months,
    contributionsByYear: {},
  };
}

describe("simulateBenchmark", () => {
  test("flat closes give a benchmark value equal to the opening value plus cumulative deposits", () => {
    const series = [
      account([
        month("2026-01", 1000, 0),
        month("2026-02", 1300, 300),
        month("2026-03", 1500, 200),
      ]),
    ];
    const closes = { "2026-01": 10, "2026-02": 10, "2026-03": 10 };
    const points = simulateBenchmark(series, closes);
    expect(points.map((p) => p.benchmark)).toEqual([1000, 1300, 1500]);
  });

  test("a doubled close doubles the value of units already held, with no new deposit", () => {
    const series = [account([month("2026-01", 1000, 0), month("2026-02", 1000, 0)])];
    const closes = { "2026-01": 10, "2026-02": 20 };
    const points = simulateBenchmark(series, closes);
    expect(points[1]?.benchmark).toBeCloseTo(2000, 6);
  });

  test("a missing month is skipped, not zero-filled", () => {
    const series = [
      account([
        month("2026-01", 1000, 0),
        month("2026-02", 1100, 100),
        month("2026-03", 1300, 100),
      ]),
    ];
    const closes = { "2026-01": 10, "2026-03": 12 };
    const points = simulateBenchmark(series, closes);
    expect(points.map((p) => p.period)).toEqual(["2026-01", "2026-03"]);
    expect(skippedPeriods(series, closes)).toEqual(["2026-02"]);
  });

  test("an entirely unpriced series returns no points", () => {
    const series = [account([month("2026-01", 1000, 0)])];
    expect(simulateBenchmark(series, {})).toEqual([]);
  });

  test("portfolio value passes through unchanged, for the comparison line", () => {
    const series = [account([month("2026-01", 1000, 0)])];
    const points = simulateBenchmark(series, { "2026-01": 10 });
    expect(points[0]?.portfolio).toBe(1000);
  });
});
