import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { loadAnalytics } from "../data";
import { ValueOverTime } from "./ValueOverTime";

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
