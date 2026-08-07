import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PortfolioPoint } from "../../analytics/portfolioSeries";
import type { ProjectionYear } from "../../projection/engine";
import { ProjectionChart } from "./ProjectionChart";
import { tickY } from "./chartTestSupport";
import { type ProjectionSeries, buildProjectionSeries } from "./projectionSeries";

afterEach(cleanup);

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

/**
 * Two decades of headroom either side of the marks, so a mark that lands on a
 * tick is interior to the plot rather than pinned to its top or bottom edge.
 * A mark drawn at the axis end would agree with its tick even if every mark
 * were clamped.
 */
const DOMAIN = [10000, 10000000] as const;

function renderChart(series: ProjectionSeries, rate = 0.06) {
  render(<ProjectionChart series={series} domain={DOMAIN} rate={rate} />);
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

/** $100,000 stated, then one projected year at $1,000,000: both land on a labelled tick. */
function onTickSeries(): ProjectionSeries {
  return buildProjectionSeries(
    [history("2026-05", 50000), history("2026-06", 100000)],
    [row("2027", 1000000)],
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
    // The projected path's own first point IS the seam, which is why the
    // assumption grows out of the last stated figure rather than beside it.
    for (const point of pathPoints("projection-line").slice(1)) {
      expect(point.x).toBeGreaterThan(seamX);
    }
  });
});

describe("the two halves are distinguished in the DOM, and never by colour alone", () => {
  test("the stated line is solid and the projected line is dashed", () => {
    renderChart(onTickSeries());
    expect(path("history-line")?.getAttribute("stroke-dasharray")).toBeNull();
    expect(path("projection-line")?.getAttribute("stroke-dasharray")).toBe("5 4");
  });

  test("the stated area is a flat fill and the projected area is a hatch pattern", () => {
    renderChart(onTickSeries());
    const hatchId = path("projection-hatch")?.getAttribute("id") ?? "";
    expect(hatchId).not.toBe("");
    expect(path("projection-area")?.getAttribute("fill")).toBe(`url(#${hatchId})`);
    expect(path("history-area")?.getAttribute("fill")).not.toContain("url(");
  });

  test("the hatch is a real pattern with marks in it, not an empty definition", () => {
    renderChart(onTickSeries());
    expect(path("projection-hatch")?.querySelectorAll("line").length).toBe(1);
  });

  /**
   * Colour is the one distinction a reader may not have. Stripping every
   * fill and stroke colour from both halves must still leave them
   * distinguishable, which is what the dash and the hatch are for.
   */
  test("the two halves still differ once colour is ignored", () => {
    renderChart(onTickSeries());
    const historyShape = [
      path("history-line")?.getAttribute("stroke-dasharray"),
      path("history-area")?.getAttribute("fill")?.startsWith("url("),
    ];
    const projectionShape = [
      path("projection-line")?.getAttribute("stroke-dasharray"),
      path("projection-area")?.getAttribute("fill")?.startsWith("url("),
    ];
    expect(historyShape).not.toEqual(projectionShape);
  });

  test("the legend names both halves and its swatches carry the chart's own marks", () => {
    renderChart(onTickSeries());
    const legend = document.querySelector("[data-projection-legend]")?.textContent ?? "";
    expect(legend).toContain("Solid, left of the seam: market value your statements state.");
    expect(legend).toContain("Hatched and dashed, right of the seam: a projection");
    const projectionSwatch = document.querySelector('[data-legend-swatch="projection"]');
    const historySwatch = document.querySelector('[data-legend-swatch="history"]');
    expect(projectionSwatch?.getAttribute("fill")).toBe(
      path("projection-area")?.getAttribute("fill"),
    );
    expect(projectionSwatch?.getAttribute("stroke-dasharray")).toBe("5 4");
    expect(historySwatch?.getAttribute("fill")).toBe(path("history-area")?.getAttribute("fill"));
  });
});

describe("a mark's position is a figure", () => {
  /**
   * A ratio between two marks cannot catch a mutation that scales every mark
   * by one constant, so each half's extent is anchored to the axis's own
   * labelled gridline, drawn by `Gridlines` from the same scale but a separate
   * code path.
   */
  test("a $100,000 stated point sits on the axis's own $100,000 tick", () => {
    renderChart(onTickSeries());
    expect(pathPoints("history-line").at(-1)?.y).toBeCloseTo(tickY("$100,000"), 6);
  });

  test("a $1,000,000 projected point sits on the axis's own $1,000,000 tick", () => {
    renderChart(onTickSeries());
    expect(pathPoints("projection-line").at(-1)?.y).toBeCloseTo(tickY("$1,000,000"), 6);
  });

  test("a $50,000 stated point sits between the $10,000 and $100,000 ticks, in proportion", () => {
    renderChart(onTickSeries());
    const y = pathPoints("history-line")[0]?.y ?? Number.NaN;
    const decade = tickY("$10,000") - tickY("$100,000");
    expect(y).toBeCloseTo(tickY("$100,000") + decade * (1 - Math.log10(5)), 6);
  });

  test("both areas close down to the plot floor rather than to an arbitrary baseline", () => {
    renderChart(onTickSeries());
    const floor = Math.max(...pathPoints("history-area").map((point) => point.y));
    const projectionFloor = Math.max(...pathPoints("projection-area").map((point) => point.y));
    expect(floor).toBe(294);
    expect(projectionFloor).toBe(294);
  });

  test("the ticks are the decades of the domain the caller supplied", () => {
    renderChart(onTickSeries());
    const labels = [...document.querySelectorAll("svg text")].map((node) => node.textContent);
    expect(labels).toContain("$10,000");
    expect(labels).toContain("$100,000");
    expect(labels).toContain("$1,000,000");
    expect(labels).toContain("$10,000,000");
  });

  test("the axis names its own ends, the first stated month and the last projected year", () => {
    renderChart(onTickSeries());
    const labels = [...document.querySelectorAll("svg text")].map((node) => node.textContent);
    expect(labels).toContain("May 2026");
    expect(labels).toContain("Dec 2027");
  });

  test("one stated point is drawn per stated month, and a stated zero is not drawn", () => {
    const series = buildProjectionSeries(
      [history("2023-06", 0), history("2023-07", 20000), history("2023-08", 30000)],
      [row("2024", 50000)],
    );
    renderChart(series);
    expect(pathPoints("history-line").length).toBe(2);
    expect(chart().getAttribute("aria-label")).toContain(
      "1 stated month at or below zero is not drawn",
    );
  });

  test("one projected point is drawn per projected year, plus the seam it grows from", () => {
    const series = buildProjectionSeries(
      [history("2026-06", 100000)],
      [row("2027", 200000), row("2028", 300000), row("2029", 400000)],
    );
    renderChart(series);
    expect(pathPoints("projection-line").length).toBe(4);
  });
});

describe("the readout", () => {
  test("a stated month announces the figure and says it is stated", () => {
    renderChart(onTickSeries());
    fireEvent.keyDown(chart(), { key: "Home" });
    expect(announced()).toContain("May 2026. Market value $50,000.00. Stated, history.");
  });

  test("a projected month announces the rate it assumes and never claims to be stated", () => {
    renderChart(onTickSeries());
    fireEvent.keyDown(chart(), { key: "End" });
    const spoken = announced();
    expect(spoken).toContain("Dec 2027");
    expect(spoken).toContain("Projected value $1,000,000.00");
    expect(spoken).toContain("A scenario at 6.00% a year, not a stated figure");
  });

  test("the tooltip, the announcement and the accessible name carry one set of words", () => {
    renderChart(onTickSeries());
    fireEvent.keyDown(chart(), { key: "End" });
    const tooltip = document.querySelector("[data-chart-tooltip]")?.textContent ?? "";
    expect(tooltip).toContain("Projected value $1,000,000.00");
    expect(chart().getAttribute("aria-label")).toContain("Projected value $1,000,000.00");
    expect(announced()).toContain("Projected value $1,000,000.00");
  });

  /** A figure a reader hears must not be coarser than the one on screen. */
  test("a projected figure keeps its cents", () => {
    const series = buildProjectionSeries([history("2026-06", 100000)], [row("2027", 7636455.38)]);
    renderChart(series);
    fireEvent.keyDown(chart(), { key: "End" });
    expect(announced()).toContain("$7,636,455.38");
    expect(announced()).not.toContain("$7,636,455 ");
  });

  /**
   * Stepping crosses the seam without stopping anywhere invented. The months
   * between two projected Decembers are not missing data, so the keyboard
   * walks the points rather than the calendar.
   */
  test("stepping right from the last stated month lands on the first projected year", () => {
    const series = buildProjectionSeries(
      [history("2026-01", 20000), history("2026-06", 100000)],
      [row("2027", 200000), row("2028", 300000)],
    );
    renderChart(series);
    fireEvent.keyDown(chart(), { key: "Home" });
    fireEvent.keyDown(chart(), { key: "ArrowRight" });
    expect(announced()).toContain("Jun 2026. Market value $100,000.00. Stated, history.");
    fireEvent.keyDown(chart(), { key: "ArrowRight" });
    expect(announced()).toContain("Dec 2027. Projected value $200,000.00");
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
    expect(label).toContain("ending at $100,000.00");
    expect(label).toContain("To the right of Jun 2026 a hatched projection at 6.00% a year");
    expect(label).toContain("reaches $1,000,000.00 by Dec 2027");
    expect(label).toContain("a scenario, not a figure any statement states");
  });

  test("states the rate it was handed, not a fixed one", () => {
    renderChart(onTickSeries(), 0.24839250232739074);
    expect(chart().getAttribute("aria-label")).toContain("hatched projection at 24.84% a year");
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
    render(<ProjectionChart series={buildProjectionSeries([], [])} domain={DOMAIN} rate={0.06} />);
    expect(screen.getByText(/nothing to project from/)).toBeDefined();
    expect(path("history-line")).toBeNull();
    expect(path("projection-line")).toBeNull();
  });

  test("a history of nothing but stated zeros draws no marks either", () => {
    render(
      <ProjectionChart
        series={buildProjectionSeries([history("2023-06", 0)], [])}
        domain={DOMAIN}
        rate={0.06}
      />,
    );
    expect(path("history-line")).toBeNull();
  });
});
