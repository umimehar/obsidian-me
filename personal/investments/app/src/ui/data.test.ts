import { describe, expect, test } from "bun:test";
import { grandTotal, latestPeriod, loadAnalytics, totalsByLens } from "./data";

describe("data.ts against the real committed analytics.json", () => {
  const analytics = loadAnalytics();

  test("carries 14 accounts", () => {
    expect(analytics.series.length).toBe(14);
    expect(analytics.meta.accountCount).toBe(14);
  });

  test("latest period is 2026-06", () => {
    expect(latestPeriod(analytics)).toBe("2026-06");
  });

  test("grand total is 241739.67", () => {
    expect(grandTotal(analytics)).toBeCloseTo(241739.67, 2);
  });

  test("all three lenses agree on the grand total", () => {
    const totals = totalsByLens(analytics);
    expect(totals.registration).toBeCloseTo(241739.67, 2);
    expect(totals.account).toBeCloseTo(totals.registration, 6);
    expect(totals.purpose).toBeCloseTo(totals.registration, 6);
  });

  test("latestPeriod returns null when no account has any months", () => {
    expect(
      latestPeriod({
        meta: analytics.meta,
        series: [],
        rooms: {},
        income: {},
        returns: [],
        rollups: { registration: [], account: [], purpose: [] },
      }),
    ).toBeNull();
  });
});
