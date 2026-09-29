import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { simulateBenchmark, skippedPeriods } from "../../analytics/benchmark";
import { GOLDENS } from "../../goldens";
import { loadAnalytics, loadBenchmark } from "../data";
import { formatCurrency, formatSignedCurrency } from "../format";
import { BenchmarkChart } from "./BenchmarkChart";

afterEach(cleanup);

const ANALYTICS = loadAnalytics();
const BENCHMARK = loadBenchmark();
const POINTS = simulateBenchmark(ANALYTICS.series, BENCHMARK.closes);

function chart(): SVGSVGElement {
  const node = document.querySelector<SVGSVGElement>('svg[role="img"]');
  if (node === null) throw new Error("expected the benchmark chart to render");
  node.getBoundingClientRect = () => new DOMRect(0, 0, 800, 320);
  return node;
}

describe("BenchmarkChart, over the real corpus", () => {
  test("the accessible summary states both end values and the difference", () => {
    render(<BenchmarkChart points={POINTS} skipped={[]} symbol={BENCHMARK.symbol} />);
    const last = POINTS[POINTS.length - 1];
    if (last === undefined) throw new Error("expected at least one point");
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain(formatCurrency(last.portfolio));
    expect(label).toContain(formatCurrency(last.benchmark));
    expect(label).toContain(formatSignedCurrency(last.portfolio - last.benchmark));
  });

  test("the visible summary states both end values and the toned difference, matching the golden", () => {
    render(<BenchmarkChart points={POINTS} skipped={[]} symbol={BENCHMARK.symbol} />);
    const summary = document.querySelector("[data-benchmark-summary]");
    expect(summary?.textContent).toContain(formatCurrency(GOLDENS.benchmark.portfolioEnd));
    expect(summary?.textContent).toContain(formatCurrency(GOLDENS.benchmark.benchmarkEnd));
    expect(summary?.textContent).toContain(formatSignedCurrency(GOLDENS.benchmark.difference));
    const difference = document.querySelector("[data-benchmark-difference]");
    expect(difference?.getAttribute("data-accent-color")).toBe(
      GOLDENS.benchmark.difference >= 0 ? "jade" : "red",
    );
  });

  test("the legend names the jade area and the dashed line", () => {
    render(<BenchmarkChart points={POINTS} skipped={[]} symbol={BENCHMARK.symbol} />);
    const legend = document.querySelector("[data-benchmark-legend]")?.textContent ?? "";
    expect(legend).toContain("Portfolio value");
    expect(legend).toContain("benchmark");
  });

  test("the provenance note states the closing-price bias", () => {
    render(<BenchmarkChart points={POINTS} skipped={[]} symbol={BENCHMARK.symbol} />);
    const text = document.querySelector("[data-benchmark-provenance]")?.textContent ?? "";
    expect(text).toContain("closing price");
    expect(text).toContain("favours the portfolio");
    expect(text).not.toContain("every month is comparable");
  });

  test("a skipped month is named in the provenance note, and 'every month is comparable' is never claimed", () => {
    render(<BenchmarkChart points={POINTS} skipped={["2023-06"]} symbol={BENCHMARK.symbol} />);
    const text = document.querySelector("[data-benchmark-provenance]")?.textContent ?? "";
    expect(text).toContain("2023-06");
    expect(text).not.toContain("every month is comparable");
  });

  test("skipped months over the real corpus match the golden count", () => {
    const skipped = skippedPeriods(ANALYTICS.series, BENCHMARK.closes);
    expect(skipped.length).toBe(GOLDENS.benchmark.monthsSkipped);
  });

  test("hovering a month opens a tooltip with both values and the toned difference", () => {
    render(<BenchmarkChart points={POINTS} skipped={[]} symbol={BENCHMARK.symbol} />);
    fireEvent.pointerMove(chart(), { clientX: 400 });
    const tooltip = document.querySelector("[data-chart-tooltip]");
    expect(tooltip).not.toBeNull();
    const tone = document.querySelector('[data-tooltip-tone="gain"], [data-tooltip-tone="loss"]');
    expect(tone).not.toBeNull();
  });

  test("an empty point list says so instead of drawing an empty chart", () => {
    render(<BenchmarkChart points={[]} skipped={[]} symbol="XEQT.TO" />);
    expect(screen.getByText(/no comparable history yet/i)).toBeDefined();
    expect(document.querySelector('svg[role="img"]')).toBeNull();
  });

  test("the card carries the ivt-chart-card class", () => {
    render(<BenchmarkChart points={POINTS} skipped={[]} symbol={BENCHMARK.symbol} />);
    expect(document.querySelector(".ivt-chart-card")).not.toBeNull();
  });
});
