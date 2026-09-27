import { describe, expect, test } from "bun:test";
import { monthlyClosesFromDaily, parseChartResult } from "./benchmark";

function chartResponse(overrides: {
  timestamp?: unknown;
  adjclose?: unknown;
}): unknown {
  const timestamp = "timestamp" in overrides ? overrides.timestamp : [1, 2, 3];
  const adjclose = "adjclose" in overrides ? overrides.adjclose : [10, 11, 12];
  return {
    chart: {
      result: [{ timestamp, indicators: { adjclose: [{ adjclose }] } }],
      error: null,
    },
  };
}

describe("monthlyClosesFromDaily", () => {
  test("keeps the LAST close seen for a period, since timestamps arrive oldest first", () => {
    // 2026-01-05 and 2026-01-20 are both January; the second write wins.
    const closes = monthlyClosesFromDaily([1767571200, 1769126400], [10, 12]);
    expect(closes["2026-01"]).toBe(12);
  });

  test("skips a null close without breaking the rest of the series", () => {
    const closes = monthlyClosesFromDaily([1767571200, 1769126400], [null, 12]);
    expect(closes["2026-01"]).toBe(12);
  });
});

describe("parseChartResult", () => {
  test("parses a well-formed response", () => {
    const parsed = parseChartResult(chartResponse({}));
    expect(parsed.timestamp).toEqual([1, 2, 3]);
    expect(parsed.adjcloses).toEqual([10, 11, 12]);
  });

  test("throws naming the symbol when there is no result at all", () => {
    expect(() => parseChartResult({ chart: { result: null, error: "no data" } })).toThrow(
      /no result/,
    );
  });

  test("throws when timestamp is missing", () => {
    expect(() => parseChartResult(chartResponse({ timestamp: undefined }))).toThrow(
      /missing timestamp or adjclose/,
    );
  });

  test("throws when adjclose is missing", () => {
    expect(() => parseChartResult(chartResponse({ adjclose: undefined }))).toThrow(
      /missing timestamp or adjclose/,
    );
  });

  test("throws when timestamp and adjclose lengths disagree", () => {
    expect(() => parseChartResult(chartResponse({ adjclose: [10, 11] }))).toThrow(
      /lengths disagree/,
    );
  });
});
