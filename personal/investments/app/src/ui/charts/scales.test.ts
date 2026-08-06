import { describe, expect, test } from "bun:test";
import { buildScales, periodToDate } from "./scales";

describe("periodToDate", () => {
  test("parses a YYYY-MM period to the first of that month, UTC", () => {
    const date = periodToDate("2026-06");
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(5); // zero-based
    expect(date.getUTCDate()).toBe(1);
  });
});

describe("buildScales", () => {
  const width = 600;
  const height = 300;

  test("returns null for an empty points array -- the empty-data guard", () => {
    expect(buildScales([], width, height)).toBeNull();
  });

  test("builds an x domain spanning the first and last period", () => {
    const points = [
      { period: "2023-06", value: 100 },
      { period: "2024-01", value: 200 },
      { period: "2026-06", value: 300 },
    ];
    const scales = buildScales(points, width, height);
    expect(scales).not.toBeNull();
    const [start, end] = scales?.x.domain() ?? [];
    expect(start?.getTime()).toBe(periodToDate("2023-06").getTime());
    expect(end?.getTime()).toBe(periodToDate("2026-06").getTime());
  });

  test("maps the first period to the left edge and the last to the right edge", () => {
    const points = [
      { period: "2023-06", value: 100 },
      { period: "2026-06", value: 300 },
    ];
    const scales = buildScales(points, width, height);
    expect(scales?.x(periodToDate("2023-06"))).toBeCloseTo(0, 5);
    expect(scales?.x(periodToDate("2026-06"))).toBeCloseTo(width, 5);
  });

  test("y domain starts at zero and is niced to cover the max value", () => {
    const points = [
      { period: "2023-06", value: 10 },
      { period: "2024-01", value: 91 },
    ];
    const scales = buildScales(points, width, height);
    const [low, high] = scales?.y.domain() ?? [];
    expect(low).toBe(0);
    expect(high).toBeGreaterThanOrEqual(91);
  });

  test("y=0 maps to the bottom of the range and the max value maps near the top", () => {
    const points = [
      { period: "2023-06", value: 0 },
      { period: "2024-01", value: 100 },
    ];
    const scales = buildScales(points, width, height);
    expect(scales?.y(0)).toBeCloseTo(height, 5);
    // niced domain may extend past 100, so the top isn't necessarily 0,
    // but it must be strictly above the y=0 pixel position.
    expect(scales?.y(100)).toBeLessThan(scales?.y(0) ?? Number.NaN);
  });

  test("produces tick values that stay within the niced y domain", () => {
    const points = [
      { period: "2023-06", value: 5 },
      { period: "2024-01", value: 247 },
    ];
    const scales = buildScales(points, width, height, 4);
    expect(scales?.yTicks.length).toBeGreaterThan(0);
    const [, high] = scales?.y.domain() ?? [];
    for (const tick of scales?.yTicks ?? []) {
      expect(tick).toBeGreaterThanOrEqual(0);
      expect(tick).toBeLessThanOrEqual(high ?? 0);
    }
  });

  test("a single point produces a degenerate but non-crashing domain", () => {
    const points = [{ period: "2025-01", value: 50 }];
    const scales = buildScales(points, width, height);
    expect(scales).not.toBeNull();
    const [start, end] = scales?.x.domain() ?? [];
    expect(start?.getTime()).toBe(end?.getTime());
  });
});
