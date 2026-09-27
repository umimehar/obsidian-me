import { describe, expect, test } from "bun:test";
import { buildPortfolioSeries } from "../analytics/portfolioSeries";
import { GOLDENS } from "../goldens";
import { loadAnalytics } from "./data";
import { clipReturns, clipSeries, inScope, scopeYears, yearChange } from "./scope";

const analytics = loadAnalytics();

describe("inScope", () => {
  test("all time takes every period, a year takes only its own", () => {
    expect(inScope("2023-06", "all")).toBe(true);
    expect(inScope("2026-07", 2026)).toBe(true);
    expect(inScope("2025-12", 2026)).toBe(false);
    // The hyphen matters: without it, 2026 would also match a hypothetical
    // "20260" and, more practically, nothing would stop a prefix collision.
    expect(inScope("2026-01", 202)).toBe(false);
  });
});

describe("scopeYears", () => {
  test("the years the corpus covers, oldest first, never the calendar's", () => {
    const years = scopeYears(analytics);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(years[0]).toBe(Number(GOLDENS.corpus.firstPeriod.slice(0, 4)));
    expect(years[years.length - 1]).toBe(Number(GOLDENS.corpus.latestPeriod.slice(0, 4)));
    // The clock is well past the corpus in this project's life; a year the
    // statements do not cover must never be offered as a filter.
    expect(years).not.toContain(new Date().getUTCFullYear() + 1);
  });
});

describe("clipSeries", () => {
  test("all time is the series untouched", () => {
    expect(clipSeries(analytics.series, "all")).toEqual([...analytics.series]);
  });

  test("a year keeps only that year's months, on every account", () => {
    const clipped = clipSeries(analytics.series, 2025);
    for (const account of clipped) {
      expect(account.months.every((m) => m.period.startsWith("2025-"))).toBe(true);
    }
    const kept = clipped.reduce((n, a) => n + a.months.length, 0);
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(analytics.series.reduce((n, a) => n + a.months.length, 0));
  });

  test("an account with no month in the year is kept, not dropped", () => {
    // Dropping it would make the account vanish from a lens, which reads as
    // "you do not have this account" rather than "it has no statement in
    // 2023" -- the absence-versus-zero distinction this project is built on.
    const clipped = clipSeries(analytics.series, 2023);
    expect(clipped).toHaveLength(analytics.series.length);
    expect(clipped.some((a) => a.months.length === 0)).toBe(true);
  });

  test("clipping does not mutate the payload it was given", () => {
    const before = analytics.series.reduce((n, a) => n + a.months.length, 0);
    clipSeries(analytics.series, 2024);
    expect(analytics.series.reduce((n, a) => n + a.months.length, 0)).toBe(before);
  });

  test("the year's clipped total is the portfolio value at that year's last month", () => {
    const full = buildPortfolioSeries(analytics.series);
    for (const year of scopeYears(analytics)) {
      const clipped = buildPortfolioSeries(clipSeries(analytics.series, year));
      const lastOfYear = full.filter((p) => p.period.startsWith(`${year}-`)).at(-1);
      expect(clipped.at(-1)?.marketValue).toBeCloseTo(lastOfYear?.marketValue ?? -1, 2);
    }
  });
});

describe("clipReturns", () => {
  test("keeps only the year's points, on every account", () => {
    const clipped = clipReturns(analytics.returns, 2026);
    for (const entry of clipped) {
      expect(entry.points.every((p) => p.period.startsWith("2026-"))).toBe(true);
    }
    expect(clipReturns(analytics.returns, "all")).toEqual([...analytics.returns]);
  });
});

describe("yearChange", () => {
  test("growth is netted, so deposits are never counted as performance", () => {
    // The one number a year filter can most easily lie with. 2026 took the
    // portfolio up by roughly $149,000, of which the great majority was money
    // paid in rather than growth.
    const change = yearChange(analytics.series, 2026);
    if (change === null) throw new Error("expected a 2026 change");
    expect(change.end - change.start).toBeGreaterThan(change.growth);
    expect(change.growth).toBeCloseTo(change.end - change.start - change.netDeposits, 2);
    expect(change.netDeposits).toBeGreaterThan(change.growth);
  });

  test("it measures from the month BEFORE the year, not the year's first month", () => {
    // Starting inside the year silently discards January's growth.
    const full = buildPortfolioSeries(analytics.series);
    const change = yearChange(analytics.series, 2026);
    if (change === null) throw new Error("expected a 2026 change");
    const priorMonth = full.filter((p) => p.period < change.firstPeriod).at(-1);
    expect(change.start).toBeCloseTo(priorMonth?.marketValue ?? -1, 2);
    expect(change.firstPeriod).toBe("2026-01");
  });

  test("the first year opens at zero, because before it there was no portfolio", () => {
    const change = yearChange(analytics.series, 2023);
    expect(change?.start).toBe(0);
  });

  test("the stated return is the chained one, never growth over the opening balance", () => {
    // `growth / start` reads a whole year's growth against the balance it
    // opened with. On 2026 that reported 22.61% where the chained figure is
    // 10.50% -- and the chart beside it drew the chained one.
    const change = yearChange(analytics.series, 2026);
    if (change === null || change.returnRate === null) throw new Error("expected a 2026 return");
    expect(change.returnRate).not.toBeCloseTo(change.growth / change.start, 4);
    expect(change.returnRate).toBeGreaterThan(0);
    expect(change.returnRate).toBeLessThan(change.growth / change.start);
  });

  test("a year the corpus does not cover has no change rather than a fabricated zero", () => {
    expect(yearChange(analytics.series, 1999)).toBeNull();
  });

  test("every covered year states a start, an end and a return", () => {
    for (const year of scopeYears(analytics)) {
      const change = yearChange(analytics.series, year);
      if (change === null) throw new Error(`expected a ${year} change`);
      expect(change.lastPeriod.startsWith(`${year}-`)).toBe(true);
      expect(Number.isFinite(change.growth)).toBe(true);
      expect(change.returnRate).not.toBeNull();
    }
  });
});
