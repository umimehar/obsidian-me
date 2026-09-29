import { describe, expect, test } from "bun:test";
import type { CashBlock, FlowsData } from "../analytics/flows/types";
import { monthOptions, presetOf, resolvePeriod, yearOptions } from "./flowPeriods";

function block(period: string): CashBlock {
  return {
    accountId: "acct_a",
    period,
    currency: "CAD",
    opening: 0,
    closing: 0,
    fxRate: null,
    rowsNet: 0,
    residual: 0,
  };
}

function flowsWith(periods: readonly string[]): FlowsData {
  return {
    generated: "2026-01-01",
    accounts: [],
    rows: [],
    blocks: periods.map(block),
    suspectSymbols: [],
  };
}

const DATA = flowsWith(["2025-07", "2025-08", "2026-01", "2026-06"]);

describe("flowPeriods", () => {
  test("monthOptions dedupes and sorts", () => {
    expect(monthOptions(flowsWith(["2026-01", "2025-07", "2026-01"]))).toEqual([
      "2025-07",
      "2026-01",
    ]);
  });

  test("yearOptions reads the years out of the months", () => {
    expect(yearOptions(DATA)).toEqual([2025, 2026]);
  });

  test("presetOf reads all time", () => {
    expect(presetOf(DATA, "all")).toBe("allTime");
  });

  test("presetOf reads the corpus's latest month as this month", () => {
    expect(presetOf(DATA, { from: "2026-06", to: "2026-06" })).toBe("thisMonth");
  });

  test("presetOf reads any other single month as month", () => {
    expect(presetOf(DATA, { from: "2025-08", to: "2025-08" })).toBe("month");
  });

  test("presetOf reads a full January-to-December span as a year", () => {
    expect(presetOf(DATA, { from: "2026-01", to: "2026-12" })).toBe("year");
  });

  test("presetOf reads any other span as a custom range", () => {
    expect(presetOf(DATA, { from: "2025-07", to: "2026-01" })).toBe("range");
  });

  test("resolvePeriod resolves all time to the corpus's own full span", () => {
    expect(resolvePeriod(DATA, "all")).toEqual({ from: "2025-07", to: "2026-06" });
  });

  test("resolvePeriod passes a concrete period through untouched", () => {
    const p = { from: "2026-01", to: "2026-06" };
    expect(resolvePeriod(DATA, p)).toEqual(p);
  });
});
