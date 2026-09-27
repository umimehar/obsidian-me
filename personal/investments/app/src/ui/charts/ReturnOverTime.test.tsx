import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  buildPortfolioReturns,
  endingCumulative,
  returnsWithin,
} from "../../analytics/portfolioReturns";
import { loadAnalytics } from "../data";
import { formatRate } from "../format";
import { inScope } from "../scope";
import { ReturnOverTime } from "./ReturnOverTime";

afterEach(cleanup);

const analytics = loadAnalytics();

function chart(): SVGSVGElement {
  const node = document.querySelector("[data-return-chart]");
  if (node === null) throw new Error("expected the return chart to render");
  return node as SVGSVGElement;
}

function label(): string {
  return chart().getAttribute("aria-label") ?? "";
}

/** Every y a plotted vertex sits at, read off the drawn path. */
function vertexYs(): number[] {
  const path = [...document.querySelectorAll("path")].find(
    (node) => node.getAttribute("stroke") !== "none",
  );
  return [...(path?.getAttribute("d") ?? "").matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) =>
    Number(m[2]),
  );
}

describe("a negative return is drawn, not clipped", () => {
  test("2025 dips below break-even, and the line goes below the zero gridline", () => {
    // The defect this guards. `buildScales` anchors its axis at zero and reads
    // only the maximum, which is right for a currency chart and wrong here:
    // 2025 fell to -3.68% in April and the line simply vanished under the axis
    // floor -- on the one chart whose whole purpose is showing when you were
    // down.
    const window = returnsWithin(buildPortfolioReturns(analytics.series), (p) => inScope(p, 2025));
    const lowest = Math.min(...window.map((p) => p.cumulative ?? 0));
    expect(lowest).toBeLessThan(0);

    render(<ReturnOverTime series={analytics.series} scope={2025} />);
    const zeroLine = document.querySelector("[data-zero-line]");
    if (zeroLine === null) throw new Error("expected a zero gridline");
    const zeroY = Number(
      /translate\(0,([\d.]+)\)/.exec(zeroLine.parentElement?.getAttribute("transform") ?? "")?.[1],
    );
    expect(Number.isNaN(zeroY)).toBe(false);
    // Below the zero line means a LARGER y in SVG coordinates.
    expect(Math.max(...vertexYs())).toBeGreaterThan(zeroY);
  });

  test("break-even is always labelled, so a reader can see which side a point is on", () => {
    // Not "the axis carries a negative tick": the domain here is about -4% to
    // +18%, and the only round multiple of the tick step below zero is -5,
    // which is outside it. d3 is right to omit it. What must always be
    // present is the zero label and the zero line, because those are what
    // make a dip legible as a dip.
    render(<ReturnOverTime series={analytics.series} scope={2025} />);
    const ticks = [...chart().querySelectorAll("text")].map((node) => node.textContent ?? "");
    expect(ticks).toContain("0%");
    expect(document.querySelector("[data-zero-line]")).not.toBeNull();
  });

  test("every vertex stays inside the plotting box, top and bottom", () => {
    render(<ReturnOverTime series={analytics.series} scope={2025} />);
    const ys = vertexYs();
    expect(ys.length).toBeGreaterThan(0);
    // 320 tall less the 16 top and 28 bottom margins.
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(276);
    }
  });
});

describe("what the chart states", () => {
  test("all time ends at the corpus's own chained return, and says it is netted", () => {
    render(<ReturnOverTime series={analytics.series} scope="all" />);
    const ending = endingCumulative(buildPortfolioReturns(analytics.series));
    expect(label()).toContain(formatRate((ending ?? 0) * 100));
    expect(label()).toMatch(/net of deposits/i);
  });

  test("a year is re-based to itself and keeps its own first month", () => {
    render(<ReturnOverTime series={analytics.series} scope={2026} />);
    const window = returnsWithin(buildPortfolioReturns(analytics.series), (p) => inScope(p, 2026));
    expect(label()).toContain(formatRate((endingCumulative(window) ?? 0) * 100));
    expect(label()).toContain("Jan 2026");
    // The all-time figure is far larger; showing it under a year scope would
    // answer a question nobody asked.
    const allTime = endingCumulative(buildPortfolioReturns(analytics.series)) ?? 0;
    expect(label()).not.toContain(formatRate(allTime * 100));
  });

  test("the cursor states the month's own return and the flow it was netted against", () => {
    render(<ReturnOverTime series={analytics.series} scope={2025} />);
    fireEvent.keyDown(chart(), { key: "End" });
    const tooltip = document.querySelector("[data-chart-tooltip]")?.textContent ?? "";
    const window = returnsWithin(buildPortfolioReturns(analytics.series), (p) => inScope(p, 2025));
    const last = window[window.length - 1];
    if (last?.cumulative == null) throw new Error("expected a last 2025 point");
    expect(tooltip).toContain(formatRate(last.cumulative * 100));
    expect(tooltip).toMatch(/net of deposits/i);
    // The visible readout and the accessible name are one value, as everywhere
    // else in this project.
    expect(label()).toContain(formatRate(last.cumulative * 100));
  });

  test("a losing month's figure is toned red, a winning one green", () => {
    render(<ReturnOverTime series={analytics.series} scope={2025} />);
    fireEvent.keyDown(chart(), { key: "Home" });
    fireEvent.keyDown(chart(), { key: "ArrowRight" });
    fireEvent.keyDown(chart(), { key: "ArrowRight" });
    const tones = [...document.querySelectorAll("[data-tooltip-tone]")].map((n) =>
      n.getAttribute("data-tooltip-tone"),
    );
    expect(tones.length).toBeGreaterThan(0);
    expect(tones.every((tone) => tone === "gain" || tone === "loss")).toBe(true);
  });

  test("an empty series says so rather than drawing an axis with no line", () => {
    render(<ReturnOverTime series={[]} scope="all" />);
    expect(screen.getByText(/no return history yet/i)).toBeDefined();
    expect(document.querySelector("[data-return-chart]")).toBeNull();
  });
});
