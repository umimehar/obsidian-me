import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { loadAnalytics } from "../ui/data";
import { buildCashflowSeries, cashflowPeriodExtent } from "./cashflowSeries";
import type { AccountSeries, MonthPoint } from "./types";

function month(period: string, deposits: number, withdrawals = 0): MonthPoint {
  return {
    period,
    marketValue: null,
    bookCost: null,
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

function account(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "TFSA 0001",
    kind: "TFSA" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned" as Purpose,
    inTotals: true,
    months: [month("2026-06", 1000)],
    contributionsByYear: {},
    ...overrides,
  };
}

describe("buildCashflowSeries", () => {
  test("sums deposits and withdrawals across inTotals accounts for one period", () => {
    const a = account({ maskedId: "a", months: [month("2026-01", 1000, 200)] });
    const b = account({ maskedId: "b", months: [month("2026-01", 500, 0)] });
    const points = buildCashflowSeries([a, b]);
    expect(points).toEqual([
      { period: "2026-01", deposits: 1500, withdrawals: 200, accountCount: 2 },
    ]);
  });

  test("excludes inTotals: false accounts from the sum", () => {
    const invested = account({ maskedId: "a", months: [month("2026-01", 1000, 0)] });
    const cash = account({
      maskedId: "cash",
      kind: "Chequing",
      inTotals: false,
      months: [month("2026-01", 5000, 0)],
    });
    const points = buildCashflowSeries([invested, cash]);
    expect(points).toEqual([
      { period: "2026-01", deposits: 1000, withdrawals: 0, accountCount: 1 },
    ]);
  });

  test("sorts periods ascending regardless of input order", () => {
    const a = account({
      maskedId: "a",
      months: [month("2026-03", 3), month("2026-01", 1), month("2026-02", 2)],
    });
    const points = buildCashflowSeries([a]);
    expect(points.map((p) => p.period)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  test("returns an empty array for no accounts", () => {
    expect(buildCashflowSeries([])).toEqual([]);
  });

  /**
   * The distinction this task exists for. A CASH-template statement carries
   * no `paidIn`/`paidOut` block, so `MonthPoint.deposits`/`withdrawals` read
   * a stated zero -- that month is still present in `months[]`, and the
   * built point must draw it as a real `{ deposits: 0, withdrawals: 0 }`,
   * not omit it. A month `months[]` never mentions at all is a different
   * fact and must not appear in the output.
   */
  test("a month present with zero deposits and withdrawals draws a real zero, not a gap", () => {
    const a = account({
      maskedId: "a",
      months: [month("2026-01", 0, 0), month("2026-02", 500, 0)],
    });
    const points = buildCashflowSeries([a]);
    expect(points).toEqual([
      { period: "2026-01", deposits: 0, withdrawals: 0, accountCount: 1 },
      { period: "2026-02", deposits: 500, withdrawals: 0, accountCount: 1 },
    ]);
  });

  test("a month absent from months[] entirely leaves a gap, contributing nothing", () => {
    const early = account({
      maskedId: "early",
      months: [month("2026-01", 100), month("2026-02", 200)],
    });
    const late = account({ maskedId: "late", months: [month("2026-02", 50)] });
    const points = buildCashflowSeries([early, late]);
    // 2026-01 is stated by exactly one account. It is not zero-filled to a
    // combined { deposits: 100, accountCount: 2 } by inventing a statement
    // for "late", nor dropped for being partially covered.
    expect(points).toEqual([
      { period: "2026-01", deposits: 100, withdrawals: 0, accountCount: 1 },
      { period: "2026-02", deposits: 250, withdrawals: 0, accountCount: 2 },
    ]);
  });

  test("no account states a month at all, so it never appears in the series", () => {
    const a = account({ maskedId: "a", months: [month("2026-01", 100), month("2026-03", 300)] });
    const points = buildCashflowSeries([a]);
    expect(points.map((p) => p.period)).toEqual(["2026-01", "2026-03"]);
    expect(points.find((p) => p.period === "2026-02")).toBeUndefined();
  });
});

describe("cashflowPeriodExtent", () => {
  test("the first and last period of a built series", () => {
    const points = buildCashflowSeries([
      account({ months: [month("2026-01", 1), month("2026-03", 3)] }),
    ]);
    expect(cashflowPeriodExtent(points)).toEqual(["2026-01", "2026-03"]);
  });

  test("null for an empty series", () => {
    expect(cashflowPeriodExtent([])).toBeNull();
  });
});

describe("against the real committed analytics.json", () => {
  const analytics = loadAnalytics();
  const points = buildCashflowSeries(analytics.series);

  test("2023-06, the first period, is a real stated zero across two accounts", () => {
    const first = points[0];
    expect(first?.period).toBe("2023-06");
    expect(first).toEqual({ period: "2023-06", deposits: 0, withdrawals: 0, accountCount: 2 });
  });

  test("2023-07 has both deposits and withdrawals", () => {
    const point = points.find((p) => p.period === "2023-07");
    expect(point).toEqual({
      period: "2023-07",
      deposits: 3445,
      withdrawals: 1280.75,
      accountCount: 2,
    });
  });

  test("ends at 2026-06 with $9,500 deposited and nothing withdrawn", () => {
    const last = points[points.length - 1];
    expect(last).toEqual({
      period: "2026-06",
      deposits: 9500,
      withdrawals: 0,
      accountCount: 11,
    });
  });
});
