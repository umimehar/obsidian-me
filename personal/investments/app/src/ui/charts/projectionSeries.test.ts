import { describe, expect, test } from "bun:test";
import type { PortfolioPoint } from "../../analytics/portfolioSeries";
import type { Scenario, ScenarioSet } from "../../projection/scenario";
import {
  buildProjectionSeries,
  projectionDomain,
  projectionPoints,
  projectionTooltipLines,
} from "./projectionSeries";

function history(period: string, marketValue: number): PortfolioPoint {
  return { period, marketValue, bookCost: marketValue, accountCount: 1 };
}

/** A scenario whose opening point is dropped by `.slice(1)`, matching the real shape. */
function scenario(rate: number, points: [string, number, number][]): Scenario {
  return {
    rate,
    points: [
      { period: "2020-01", year: "2020", nominal: 0, real: 0 },
      ...points.map(([period, nominal, real]) => ({
        period,
        year: period.slice(0, 4),
        nominal,
        real,
      })),
    ],
  };
}

function scenarioSet(base: Scenario, low: Scenario, high: Scenario): ScenarioSet {
  return { base, low, high, startPeriod: "2026-06", uncompounded: [] };
}

describe("the seam", () => {
  test("the last stated month is the seam, and the projection starts after it", () => {
    const scenarios = scenarioSet(
      scenario(0.06, [
        ["2026-12", 1100, 1100],
        ["2027-12", 1200, 1150],
      ]),
      scenario(0.04, [
        ["2026-12", 1080, 1080],
        ["2027-12", 1150, 1100],
      ]),
      scenario(0.08, [
        ["2026-12", 1120, 1120],
        ["2027-12", 1260, 1200],
      ]),
    );
    const series = buildProjectionSeries(
      [history("2026-05", 900), history("2026-06", 1000)],
      scenarios,
      "nominal",
    );
    expect(series.seam?.period).toBe("2026-06");
    expect(series.seam?.value).toBe(1000);
    expect(series.projection.map((point) => point.period)).toEqual(["2026-12", "2027-12"]);
    expect(series.projection[0]?.value).toBe(1100);
    expect(series.projection[0]?.low).toBe(1080);
    expect(series.projection[0]?.high).toBe(1120);
  });

  test("a projected year that does not fall after the seam is dropped", () => {
    const scenarios = scenarioSet(
      scenario(0.06, [
        ["2026-12", 1100, 1100],
        ["2027-12", 1200, 1150],
      ]),
      scenario(0.06, [
        ["2026-12", 1100, 1100],
        ["2027-12", 1200, 1150],
      ]),
      scenario(0.06, [
        ["2026-12", 1100, 1100],
        ["2027-12", 1200, 1150],
      ]),
    );
    const series = buildProjectionSeries([history("2026-12", 1000)], scenarios, "nominal");
    expect(series.projection.map((point) => point.period)).toEqual(["2027-12"]);
  });

  test("a stated zero month stays in the history, since the statements do state it", () => {
    const scenarios = scenarioSet(scenario(0.06, []), scenario(0.04, []), scenario(0.08, []));
    const series = buildProjectionSeries(
      [history("2023-06", 0), history("2023-07", 10)],
      scenarios,
      "nominal",
    );
    expect(series.history.map((point) => point.value)).toEqual([0, 10]);
  });

  test("no history at all leaves no seam and no projected point", () => {
    const scenarios = scenarioSet(
      scenario(0.06, [["2026-12", 1100, 1100]]),
      scenario(0.04, [["2026-12", 1080, 1080]]),
      scenario(0.08, [["2026-12", 1120, 1120]]),
    );
    const series = buildProjectionSeries([], scenarios, "nominal");
    expect(series.seam).toBeNull();
    expect(series.projection).toEqual([]);
  });

  test("each half is labelled, so a point always knows which side of the seam it is on", () => {
    const scenarios = scenarioSet(
      scenario(0.06, [["2027-12", 1200, 1150]]),
      scenario(0.04, [["2027-12", 1150, 1100]]),
      scenario(0.08, [["2027-12", 1260, 1200]]),
    );
    const series = buildProjectionSeries([history("2026-06", 1000)], scenarios, "nominal");
    expect(projectionPoints(series).map((point) => point.half)).toEqual(["history", "projection"]);
  });

  test("the real dollars mode reads the real figure, not the nominal one", () => {
    const scenarios = scenarioSet(
      scenario(0.06, [["2027-12", 1200, 1150]]),
      scenario(0.04, [["2027-12", 1150, 1100]]),
      scenario(0.08, [["2027-12", 1260, 1200]]),
    );
    const series = buildProjectionSeries([history("2026-06", 1000)], scenarios, "real");
    expect(series.projection[0]?.value).toBe(1150);
    expect(series.projection[0]?.low).toBe(1100);
    expect(series.projection[0]?.high).toBe(1200);
  });
});

describe("projectionDomain", () => {
  test("spans zero to the largest figure either half draws", () => {
    const scenarios = scenarioSet(
      scenario(0.06, [["2027-12", 1200, 1150]]),
      scenario(0.04, [["2027-12", 1150, 1100]]),
      scenario(0.08, [["2027-12", 1500, 1200]]),
    );
    const series = buildProjectionSeries([history("2026-06", 1000)], scenarios, "nominal");
    expect(projectionDomain(series)).toEqual([0, 1500]);
  });

  test("is null when there is no seam to project from", () => {
    const scenarios = scenarioSet(scenario(0.06, []), scenario(0.04, []), scenario(0.08, []));
    expect(projectionDomain(buildProjectionSeries([], scenarios, "nominal"))).toBeNull();
  });
});

describe("what the cursor says", () => {
  test("a stated month says so, at full precision", () => {
    const scenarios = scenarioSet(scenario(0.06, []), scenario(0.04, []), scenario(0.08, []));
    const series = buildProjectionSeries([history("2026-06", 180941.35)], scenarios, "nominal");
    const lines = projectionTooltipLines("2026-06", series.history[0] ?? null, 0.06, "nominal");
    expect(lines).toEqual(["Jun 2026", "Market value $180,941.35", "Stated, history"]);
  });

  test("a projected month names the rate it assumes and the band either side", () => {
    const scenarios = scenarioSet(
      scenario(0.06, [["2056-12", 7636455.3846, 3636455.3846]]),
      scenario(0.04, [["2056-12", 6000000, 3000000]]),
      scenario(0.08, [["2056-12", 9000000, 4000000]]),
    );
    const series = buildProjectionSeries([history("2026-06", 1000)], scenarios, "nominal");
    const lines = projectionTooltipLines("2056-12", series.projection[0] ?? null, 0.06, "nominal");
    expect(lines[0]).toBe("Dec 2056");
    expect(lines[1]).toBe("Projected value $7,636,455.38, in future dollars");
    expect(lines[2]).toBe("A scenario at 6.00% a year, not a stated figure");
    expect(lines[3]).toBe("Range $6,000,000.00 to $9,000,000.00, in future dollars");
  });

  test("the today's dollars mode names itself in the readout", () => {
    const scenarios = scenarioSet(
      scenario(0.06, [["2056-12", 7636455.3846, 3636455.3846]]),
      scenario(0.04, [["2056-12", 6000000, 3000000]]),
      scenario(0.08, [["2056-12", 9000000, 4000000]]),
    );
    const series = buildProjectionSeries([history("2026-06", 1000)], scenarios, "real");
    const lines = projectionTooltipLines("2056-12", series.projection[0] ?? null, 0.06, "real");
    expect(lines[1]).toContain("in today's dollars");
  });

  test("a month with no point at all prints no figure", () => {
    expect(projectionTooltipLines("2024-03", null, 0.06, "nominal")).toEqual([
      "Mar 2024",
      "No statement for this month",
    ]);
  });
});
