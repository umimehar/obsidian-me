import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PortfolioPoint } from "../../analytics/portfolioSeries";
import type { Scenario, ScenarioSet } from "../../projection/scenario";
import { ProjectionChart } from "./ProjectionChart";
import { tickY } from "./chartTestSupport";
import { type ProjectionSeries, buildProjectionSeries } from "./projectionSeries";

afterEach(cleanup);

function history(period: string, marketValue: number): PortfolioPoint {
  return { period, marketValue, bookCost: marketValue, accountCount: 1 };
}

function scenario(rate: number, years: [string, number][]): Scenario {
  return {
    rate,
    points: [
      { year: "opening", nominal: 0, real: 0 },
      ...years.map(([year, value]) => ({ year, nominal: value, real: value })),
    ],
  };
}

function scenarioSet(base: Scenario, low: Scenario, high: Scenario): ScenarioSet {
  return { base, low, high, startYear: "2026", uncompounded: [] };
}

function renderChart(series: ProjectionSeries, rate = 0.06, retirementYear = 2027) {
  render(
    <ProjectionChart
      series={series}
      rate={rate}
      low={0.04}
      high={0.08}
      retirementYear={retirementYear}
      dollars="nominal"
    />,
  );
}

function chart(): HTMLElement {
  return screen.getByRole("img");
}

function path(name: string): Element | null {
  return document.querySelector(`[data-${name}]`);
}

function pathPoints(name: string): { x: number; y: number }[] {
  const d = path(name)?.getAttribute("d") ?? "";
  return [...d.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

function announced(): string {
  return document.querySelector("[data-cursor-announcement]")?.textContent ?? "";
}

/** $200,000 stated, then one projected year at $1,000,000 base with a $800k-$1.2m band. */
function onTickSeries(): ProjectionSeries {
  return buildProjectionSeries(
    [history("2026-05", 50000), history("2026-06", 200000)],
    scenarioSet(
      scenario(0.06, [["2027", 1000000]]),
      scenario(0.04, [["2027", 800000]]),
      scenario(0.08, [["2027", 1200000]]),
    ),
    "nominal",
  );
}

describe("the seam is drawn, not described", () => {
  test("a rule stands at the last stated month, naming it", () => {
    renderChart(onTickSeries());
    const seam = path("seam");
    expect(seam?.getAttribute("data-seam-period")).toBe("2026-06");
    expect(seam?.textContent).toContain("Jun 2026, last statement");
  });

  test("the rule sits at the x the last stated point is drawn at", () => {
    renderChart(onTickSeries());
    const seamX = Number(path("seam")?.querySelector("line")?.getAttribute("x1"));
    const historyEnd = pathPoints("history-line").at(-1);
    expect(seamX).toBeCloseTo(historyEnd?.x ?? Number.NaN, 6);
  });

  test("the projected path starts exactly where the stated path ends, on one shared axis", () => {
    renderChart(onTickSeries());
    const historyEnd = pathPoints("history-line").at(-1);
    const projectionStart = pathPoints("projection-line")[0];
    expect(projectionStart?.x).toBeCloseTo(historyEnd?.x ?? Number.NaN, 6);
    expect(projectionStart?.y).toBeCloseTo(historyEnd?.y ?? Number.NaN, 6);
  });

  test("every projected point is right of the seam and every stated point is left of it", () => {
    renderChart(onTickSeries());
    const seamX = Number(path("seam")?.querySelector("line")?.getAttribute("x1"));
    for (const point of pathPoints("history-line")) expect(point.x).toBeLessThanOrEqual(seamX);
    for (const point of pathPoints("projection-line").slice(1)) {
      expect(point.x).toBeGreaterThan(seamX);
    }
  });
});

describe("the two halves are distinguished in the DOM, and never by colour alone", () => {
  test("the stated line is solid and the base projection line is dashed", () => {
    renderChart(onTickSeries());
    expect(path("history-line")?.getAttribute("stroke-dasharray")).toBeNull();
    expect(path("projection-line")?.getAttribute("stroke-dasharray")).toBe("5 4");
  });

  test("the band is a shaded area, not a line", () => {
    renderChart(onTickSeries());
    expect(path("band-area")?.getAttribute("fill")).not.toBe("none");
    expect(path("band-area")?.getAttribute("stroke")).toBe("none");
  });

  test("the legend names all three marks and states the band's rate range", () => {
    renderChart(onTickSeries());
    const legend = document.querySelector("[data-projection-legend]")?.textContent ?? "";
    expect(legend).toContain("Solid, left of the seam: market value your statements state.");
    expect(legend).toContain("Dashed, right of the seam: the base rate");
    expect(document.querySelector("[data-projection-band-note]")?.textContent).toBe(
      "Shaded band: the range between 4.00% and 8.00% a year.",
    );
  });
});

describe("a mark's position is a figure", () => {
  test("a $200,000 stated point sits on the axis's own $200,000 tick", () => {
    renderChart(onTickSeries());
    expect(pathPoints("history-line").at(-1)?.y).toBeCloseTo(tickY("$200,000"), 6);
  });

  test("a $1,000,000 projected point sits on the axis's own $1,000,000 tick", () => {
    renderChart(onTickSeries());
    expect(pathPoints("projection-line").at(-1)?.y).toBeCloseTo(tickY("$1,000,000"), 6);
  });

  test("the axis names its own ends, the first stated month and the last projected year", () => {
    renderChart(onTickSeries());
    const labels = [...document.querySelectorAll("svg text")].map((node) => node.textContent);
    expect(labels).toContain("May 2026");
    expect(labels).toContain("Dec 2027");
  });

  test("one stated point is drawn per stated month", () => {
    const series = buildProjectionSeries(
      [history("2023-06", 10000), history("2023-07", 20000), history("2023-08", 30000)],
      scenarioSet(scenario(0.06, [["2024", 50000]]), scenario(0.04, []), scenario(0.08, [])),
      "nominal",
    );
    renderChart(series);
    expect(pathPoints("history-line").length).toBe(3);
  });

  test("one projected point is drawn per projected year, plus the seam it grows from", () => {
    const series = buildProjectionSeries(
      [history("2026-06", 200000)],
      scenarioSet(
        scenario(0.06, [
          ["2027", 200000],
          ["2028", 300000],
          ["2029", 400000],
        ]),
        scenario(0.04, []),
        scenario(0.08, []),
      ),
      "nominal",
    );
    renderChart(series);
    expect(pathPoints("projection-line").length).toBe(4);
  });
});

describe("the retirement rule", () => {
  test("is drawn and labelled Age 60 at the retirement year", () => {
    renderChart(onTickSeries(), 0.06, 2027);
    const rule = document.querySelector("[data-retirement-rule]");
    expect(rule?.textContent).toBe("Age 60");
  });
});

describe("the readout", () => {
  test("a stated month announces the figure and says it is stated", () => {
    renderChart(onTickSeries());
    fireEvent.keyDown(chart(), { key: "Home" });
    expect(announced()).toContain("May 2026. Market value $50,000.00. Stated, history.");
  });

  test("a projected month announces the rate it assumes and the band either side", () => {
    renderChart(onTickSeries());
    fireEvent.keyDown(chart(), { key: "End" });
    const spoken = announced();
    expect(spoken).toContain("Dec 2027");
    expect(spoken).toContain("Projected value $1,000,000.00");
    expect(spoken).toContain("A scenario at 6.00% a year, not a stated figure");
    expect(spoken).toContain("Range $800,000.00 to $1,200,000.00");
  });

  test("the tooltip, the announcement and the accessible name carry one set of words", () => {
    renderChart(onTickSeries());
    fireEvent.keyDown(chart(), { key: "End" });
    const tooltip = document.querySelector("[data-chart-tooltip]")?.textContent ?? "";
    expect(tooltip).toContain("Projected value $1,000,000.00");
    expect(chart().getAttribute("aria-label")).toContain("reaches $1,000,000.00");
    expect(announced()).toContain("Projected value $1,000,000.00");
  });

  test("the crosshair is absent until the cursor moves, then marks the point", () => {
    renderChart(onTickSeries());
    expect(document.querySelector("[data-cursor-marks]")).toBeNull();
    fireEvent.keyDown(chart(), { key: "End" });
    expect(document.querySelector("[data-cursor-marker]")).not.toBeNull();
  });
});

describe("the accessible summary", () => {
  test("names both halves, the seam, and that the projected half is a scenario", () => {
    renderChart(onTickSeries());
    const label = chart().getAttribute("aria-label") ?? "";
    expect(label).toContain("drawn solid from May 2026 to Jun 2026");
    expect(label).toContain("ending at $200,000.00");
    expect(label).toContain("a dashed base scenario at 6.00% a year reaches $1,000,000.00");
    expect(label).toContain("a scenario, not a figure any statement states");
  });

  test("states the rate it was handed, not a fixed one", () => {
    renderChart(onTickSeries(), 0.24839250232739074);
    expect(chart().getAttribute("aria-label")).toContain("base scenario at 24.84% a year");
  });

  test("names today's dollars when in that mode", () => {
    render(
      <ProjectionChart
        series={onTickSeries()}
        rate={0.06}
        low={0.04}
        high={0.08}
        retirementYear={2027}
        dollars="real"
      />,
    );
    expect(chart().getAttribute("aria-label")).toContain("in today's dollars");
  });
});

describe("the chart is a responsive graphic", () => {
  test("scales by viewBox rather than a fixed pixel width", () => {
    renderChart(onTickSeries());
    expect(chart().getAttribute("viewBox")).toBe("0 0 800 340");
    expect(chart().getAttribute("width")).toBeNull();
  });
});

describe("nothing to draw", () => {
  test("an empty series says so rather than drawing an axis into nothing", () => {
    const series = buildProjectionSeries(
      [],
      scenarioSet(scenario(0.06, []), scenario(0.04, []), scenario(0.08, [])),
      "nominal",
    );
    renderChart(series);
    expect(screen.getByText(/nothing to project from/)).toBeDefined();
    expect(path("history-line")).toBeNull();
    expect(path("projection-line")).toBeNull();
  });
});
