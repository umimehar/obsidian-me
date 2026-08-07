import { describe, expect, test } from "bun:test";
import type { PortfolioPoint } from "../../analytics/portfolioSeries";
import type { ProjectionYear } from "../../projection/engine";
import {
  buildProjectionSeries,
  decadeTicks,
  logDecadeDomain,
  projectionPoints,
  projectionTooltipLines,
} from "./projectionSeries";

function history(period: string, marketValue: number): PortfolioPoint {
  return { period, marketValue, bookCost: marketValue, accountCount: 1 };
}

function row(year: string, value: number): ProjectionYear {
  return {
    year,
    contributions: { TFSA: 7000 },
    grant: 500,
    roomRemaining: { TFSA: 0 },
    cumulativeIn: 7000,
    cumulativeGrant: 500,
    withdrawn: 0,
    value,
    notes: [],
  };
}

describe("the seam", () => {
  test("the last stated month is the seam, and the projection starts after it", () => {
    const series = buildProjectionSeries(
      [history("2026-05", 900), history("2026-06", 1000)],
      [row("2026", 1100), row("2027", 1200)],
    );
    expect(series.seam?.period).toBe("2026-06");
    expect(series.seam?.value).toBe(1000);
    expect(series.projection.map((point) => point.period)).toEqual(["2026-12", "2027-12"]);
  });

  /**
   * A statement corpus that already runs to December leaves the start year
   * over. Drawing that year anyway would put a projected point on the same
   * period as a stated one, and the cursor would then resolve one month to two
   * different figures.
   */
  test("a projected year that does not fall after the seam is dropped", () => {
    const series = buildProjectionSeries(
      [history("2026-12", 1000)],
      [row("2026", 1100), row("2027", 1200)],
    );
    expect(series.projection.map((point) => point.period)).toEqual(["2027-12"]);
  });

  test("a stated zero month stays in the history, since the statements do state it", () => {
    const series = buildProjectionSeries([history("2023-06", 0), history("2023-07", 10)], []);
    expect(series.history.map((point) => point.value)).toEqual([0, 10]);
  });

  test("no history at all leaves no seam and no projected point", () => {
    const series = buildProjectionSeries([], [row("2026", 1100)]);
    expect(series.seam).toBeNull();
    expect(series.projection).toEqual([]);
  });

  test("each half is labelled, so a point always knows which side of the seam it is on", () => {
    const series = buildProjectionSeries([history("2026-06", 1000)], [row("2027", 1200)]);
    expect(projectionPoints(series).map((point) => point.half)).toEqual(["history", "projection"]);
  });

  test("a projected point carries the contributions and grant behind it, a stated one carries neither", () => {
    const series = buildProjectionSeries([history("2026-06", 1000)], [row("2027", 1200)]);
    expect(series.history[0]?.contributedToDate).toBeNull();
    expect(series.history[0]?.grantToDate).toBeNull();
    expect(series.projection[0]?.contributedToDate).toBe(7000);
    expect(series.projection[0]?.grantToDate).toBe(500);
  });
});

describe("the decade domain", () => {
  test("widens outward to whole powers of ten", () => {
    expect(logDecadeDomain([1947.54, 180941.35, 7636455.38])).toEqual([1000, 10000000]);
  });

  test("ignores zero and negative values, which a logarithmic axis cannot place", () => {
    expect(logDecadeDomain([0, -5, 250])).toEqual([100, 1000]);
  });

  test("is null when nothing is positive, which is the empty state", () => {
    expect(logDecadeDomain([0, -1])).toBeNull();
  });

  test("a single decade is widened by one, so the axis is never a single line", () => {
    expect(logDecadeDomain([1000])).toEqual([1000, 10000]);
  });

  test("the ticks are the powers of ten inside the domain, inclusive", () => {
    expect(decadeTicks([1000, 1000000])).toEqual([1000, 10000, 100000, 1000000]);
  });
});

describe("what the cursor says", () => {
  test("a stated month says so, at full precision", () => {
    const series = buildProjectionSeries([history("2026-06", 180941.35)], []);
    const lines = projectionTooltipLines("2026-06", series.history[0] ?? null, 0.06);
    expect(lines).toEqual(["Jun 2026", "Market value $180,941.35", "Stated, history"]);
  });

  test("a projected month names the rate it assumes, and never claims to be stated", () => {
    const series = buildProjectionSeries([history("2026-06", 1000)], [row("2056", 7636455.3846)]);
    const lines = projectionTooltipLines("2056-12", series.projection[0] ?? null, 0.06);
    expect(lines[0]).toBe("Dec 2056");
    expect(lines[1]).toBe("Projected value $7,636,455.38");
    expect(lines[2]).toBe("A scenario at 6.00% a year, not a stated figure");
    expect(lines[3]).toBe("Contributions to date $7,000.00, grants $500.00");
  });

  test("the assumed rate is carried at two decimals, the same as every other rate on the page", () => {
    const series = buildProjectionSeries([history("2026-06", 1000)], [row("2056", 100)]);
    const lines = projectionTooltipLines("2056-12", series.projection[0] ?? null, 0.24839250232739);
    expect(lines[2]).toBe("A scenario at 24.84% a year, not a stated figure");
  });

  test("a stated zero says it is a zero and says why nothing is drawn", () => {
    const series = buildProjectionSeries([history("2023-06", 0)], []);
    const lines = projectionTooltipLines("2023-06", series.history[0] ?? null, 0.06);
    expect(lines).toContain("Market value $0.00");
    expect(lines[3]).toBe(
      "A stated zero, which a logarithmic axis cannot place, so no point is drawn",
    );
  });

  test("a month with no point at all prints no figure", () => {
    expect(projectionTooltipLines("2024-03", null, 0.06)).toEqual([
      "Mar 2024",
      "No statement for this month",
    ]);
  });
});
