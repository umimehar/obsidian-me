import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { loadAnalytics } from "../data";
import { ValueOverTime } from "./ValueOverTime";
import { tickY } from "./chartTestSupport";

/**
 * These render against the real committed corpus (`data/analytics.json`), the
 * same data `portfolioSeries.test.ts` verifies ends 2023-06..2026-06 at
 * $241,739.67 -- not a hand-made fixture, so they catch a real regression
 * rather than fixture drift.
 */
describe("ValueOverTime", () => {
  test("the chart's accessible name states the real ending value and period range", () => {
    const analytics = loadAnalytics();
    render(<ValueOverTime series={analytics.series} />);

    const chart = screen.getByRole("img", { name: /portfolio market value/i });
    expect(chart.getAttribute("aria-label")).toContain("$241,739.67");
    expect(chart.getAttribute("aria-label")).toContain("Jun 2023");
    expect(chart.getAttribute("aria-label")).toContain("Jun 2026");
  });

  test("the visible axis labels are the real domain, not a placeholder scale", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    const ticks = [...document.querySelectorAll("text")].map((t) => t.textContent);
    // The corpus tops out at $241,739.67, so the scale runs to $250,000.
    expect(ticks).toContain("$250,000");
    expect(ticks).toContain("$0");
    expect(ticks).toContain("Jun 2023");
    expect(ticks).toContain("Jun 2026");
  });

  test("an empty series says so instead of drawing an axis with no line", () => {
    render(<ValueOverTime series={[]} />);
    expect(screen.getByText(/no value history yet/i)).toBeDefined();
    expect(document.querySelector("svg")).toBeNull();
  });
});

/** The chart svg, with a stub box so a client x lands somewhere in viewBox space. */
function chart(): SVGSVGElement {
  const node = document.querySelector("svg");
  if (node === null) throw new Error("expected the portfolio chart to render");
  node.getBoundingClientRect = () => new DOMRect(0, 0, 800, 320);
  return node;
}

function label(): string {
  return chart().getAttribute("aria-label") ?? "";
}

describe("ValueOverTime cursor", () => {
  test("draws no tooltip until the reader asks for one", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    expect(document.querySelector("[data-chart-tooltip]")).toBeNull();
  });

  test("is keyboard reachable, so the tooltip is not mouse-only", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    expect(chart().getAttribute("tabindex")).toBe("0");
  });

  test("End jumps to the last point and states it to the cent", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    fireEvent.keyDown(chart(), { key: "End" });
    const tooltip = document.querySelector("[data-chart-tooltip]");
    if (tooltip === null) throw new Error("expected a tooltip on the focused point");
    expect(tooltip.textContent).toContain("Jun 2026");
    // Not $241,740, which is what the axis formatter says for this point.
    expect(tooltip.textContent).toContain("$241,739.67");
    expect(tooltip.textContent).toContain("$223,675.08");
    expect(tooltip.textContent).toContain("11 of 11 accounts reported this month");
  });

  test("Home jumps to the first point, a real zero across two of the eleven accounts", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    fireEvent.keyDown(chart(), { key: "Home" });
    const tooltip = document.querySelector("[data-chart-tooltip]");
    expect(tooltip?.textContent).toContain("Jun 2023");
    // Two accounts open and unfunded. A stated zero, so it prints as one.
    expect(tooltip?.textContent).toContain("Market value $0.00");
    expect(tooltip?.textContent).toContain("2 of 11 accounts reported this month");
    expect(tooltip?.textContent).not.toMatch(/no statement/i);
  });

  test("arrows move one point at a time from where the cursor is", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    const svg = chart();
    fireEvent.keyDown(svg, { key: "End" });
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(document.querySelector("[data-chart-tooltip]")?.textContent).toContain("May 2026");
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(document.querySelector("[data-chart-tooltip]")?.textContent).toContain("Jun 2026");
  });

  test("the accessible summary follows the focused point, at the cent", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    const svg = chart();
    expect(label()).not.toContain("Market value");

    fireEvent.keyDown(svg, { key: "Home" });
    expect(label()).toContain("Jun 2023");
    expect(label()).toContain("Market value $0.00");
    expect(label()).toContain("2 of 11 accounts reported this month");

    fireEvent.keyDown(svg, { key: "End" });
    expect(label()).toContain("Market value $241,739.67");
    expect(label()).not.toContain("$241,740");
    expect(label()).toContain("11 of 11 accounts reported this month");
  });

  test("a live region speaks the focused point, since a name change may not be", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    const region = screen.getByRole("status");
    // Present and empty at rest: a live region that arrives with its content
    // is not reliably announced.
    expect(region.textContent).toBe("");

    fireEvent.keyDown(chart(), { key: "End" });
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("Jun 2026");
    expect(region.textContent).toContain("$241,739.67");
    expect(region.textContent).toContain("11 of 11 accounts reported this month");
  });

  test("the spoken copy and the printed copy are the same words", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    fireEvent.keyDown(chart(), { key: "Home" });
    const spoken = screen.getByRole("status").textContent ?? "";
    const printed = document.querySelector("[data-chart-tooltip]")?.textContent ?? "";
    expect(printed).not.toBe("");
    // The tooltip renders one div per line, so its textContent is the lines
    // concatenated. Every line spoken must appear in it, and vice versa.
    for (const line of spoken.replace(/\.$/, "").split(". ")) {
      expect(printed).toContain(line);
    }
    expect(spoken).toContain("Market value $0.00");
  });

  test("the summary keeps its base sentence, so the chart is still named when focused", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    fireEvent.keyDown(chart(), { key: "End" });
    expect(label()).toContain("Portfolio market value from Jun 2023 to Jun 2026");
  });

  test("Escape puts the cursor away again", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    const svg = chart();
    fireEvent.keyDown(svg, { key: "End" });
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(document.querySelector("[data-chart-tooltip]")).toBeNull();
    expect(label()).not.toContain("Market value");
  });

  test("a pointer at the right edge reads the last month, not an interpolated one", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    fireEvent.pointerMove(chart(), { clientX: 799 });
    expect(document.querySelector("[data-chart-tooltip]")?.textContent).toContain("$241,739.67");
  });

  test("the pointer leaving clears the readout rather than freezing a month on it", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    const svg = chart();
    fireEvent.pointerMove(svg, { clientX: 799 });
    fireEvent.pointerLeave(svg);
    expect(document.querySelector("[data-chart-tooltip]")).toBeNull();
  });

  test("marks the focused point on the line, so the tooltip and the chart agree", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    fireEvent.keyDown(chart(), { key: "End" });
    expect(document.querySelector("[data-cursor-marker]")).not.toBeNull();
  });

  test("the marker sits on the market value line, not on the book cost line", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    fireEvent.keyDown(chart(), { key: "End" });
    const cy = Number(document.querySelector("[data-cursor-marker]")?.getAttribute("cy"));
    const paths = [...document.querySelectorAll("path")];
    const dashed = paths.find((p) => p.getAttribute("stroke-dasharray") !== null);
    const filled = paths.find((p) => p.getAttribute("stroke-dasharray") === null);
    const vertices = (node: Element | undefined) =>
      [...(node?.getAttribute("d") ?? "").matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) =>
        Number(m[2]),
      );
    // The area path closes down to the baseline and back, so its last real
    // vertex is three from the end.
    const marketY = vertices(filled).at(-3);
    const bookY = vertices(dashed).at(-1);
    expect(marketY).toBeDefined();
    expect(bookY).toBeDefined();
    // $241,739.67 against $223,675.08: two visibly different heights, and a
    // dot on the wrong one would point at the wrong figure to the tooltip.
    expect(cy).toBeCloseTo(marketY ?? Number.NaN, 6);
    expect(Math.abs(cy - (bookY ?? Number.NaN))).toBeGreaterThan(1);
  });
});

/**
 * A mark's position is a figure, so it is pinned to the axis and not to a
 * sibling mark.
 *
 * The marker test above compares the cursor dot against a vertex of the market
 * path. Both come from the same `scales.y`, so a mutation that scales every
 * plotted y by one constant moves them together and that test stays green.
 * That is the sibling-comparison failure mode, and this is the chart it
 * matters most on: it is hoisted above the tabs, so it is on screen on all six
 * panels, and a halved line would state half the portfolio while the tooltip,
 * the accessible summary and the Overview total all still read $241,739.67.
 *
 * `scales.yTicks` and the gridline labels are a separate code path from
 * `toPlotPoints`, so two labelled ticks give a reference the plot mapping
 * cannot move.
 */
describe("a mark's position is a figure", () => {
  /** The last stated month, Jun 2026, as `portfolioSeries.test.ts` pins it. */
  const LAST_MARKET = 241739.67;
  const LAST_BOOK = 223675.08;
  /** The axis the corpus produces: it tops out at $241,739.67, so the scale nices to $250,000. */
  const TOP_TICK = 250000;

  /** Where the chart's own labelled gridlines put a dollar figure. The scale is linear, so two ticks fix it. */
  function axisY(value: number): number {
    const zero = tickY("$0");
    return zero + (tickY(`$${TOP_TICK.toLocaleString("en-CA")}`) - zero) * (value / TOP_TICK);
  }

  function vertices(node: Element | undefined): number[] {
    return [...(node?.getAttribute("d") ?? "").matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(
      (match) => Number(match[2]),
    );
  }

  function marketPath(): Element | undefined {
    return [...document.querySelectorAll("path")].find(
      (path) => path.getAttribute("stroke-dasharray") === null,
    );
  }

  function bookPath(): Element | undefined {
    return [...document.querySelectorAll("path")].find(
      (path) => path.getAttribute("stroke-dasharray") !== null,
    );
  }

  test("the market line's last vertex sits where the axis puts $241,739.67", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    // The area closes down to the baseline and back, so its last real vertex
    // is three from the end.
    expect(vertices(marketPath()).at(-3)).toBeCloseTo(axisY(LAST_MARKET), 6);
  });

  test("the book cost line's last vertex sits where the axis puts $223,675.08", () => {
    render(<ValueOverTime series={loadAnalytics().series} />);
    expect(vertices(bookPath()).at(-1)).toBeCloseTo(axisY(LAST_BOOK), 6);
  });

  test("the cursor marker sits where the axis puts the figure it announces", () => {
    // The marker is placed by its own `scales.y` call, separate from
    // `toPlotPoints`, so it needs its own anchor rather than a comparison
    // against the path it is supposed to sit on.
    render(<ValueOverTime series={loadAnalytics().series} />);
    fireEvent.keyDown(chart(), { key: "End" });
    const cy = Number(document.querySelector("[data-cursor-marker]")?.getAttribute("cy"));
    expect(cy).toBeCloseTo(axisY(LAST_MARKET), 6);
    expect(label()).toContain("$241,739.67");
  });

  test("the first month, a real $0.00, sits on the axis's own $0 tick", () => {
    // Jun 2023: two accounts open and unfunded. A stated zero, not a gap, so
    // it is drawn -- and it must be drawn where the axis says zero is.
    render(<ValueOverTime series={loadAnalytics().series} />);
    fireEvent.keyDown(chart(), { key: "Home" });
    const cy = Number(document.querySelector("[data-cursor-marker]")?.getAttribute("cy"));
    expect(cy).toBeCloseTo(tickY("$0"), 6);
    expect(label()).toContain("Market value $0.00");
  });
});
