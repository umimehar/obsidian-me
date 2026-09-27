import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { simulateBenchmark } from "../../analytics/benchmark";
import { loadAnalytics, loadBenchmark } from "../data";
import { formatCurrency, formatSignedCurrency } from "../format";
import { BenchmarkChart } from "./BenchmarkChart";

afterEach(cleanup);

const ANALYTICS = loadAnalytics();
const BENCHMARK = loadBenchmark();
const POINTS = simulateBenchmark(ANALYTICS.series, BENCHMARK.closes);

function chart(): SVGSVGElement {
  const node = document.querySelector("svg");
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

  test("a skipped month is named in the provenance note", () => {
    render(<BenchmarkChart points={POINTS} skipped={["2023-06"]} symbol={BENCHMARK.symbol} />);
    expect(document.querySelector("[data-benchmark-provenance]")?.textContent).toContain("2023-06");
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
    expect(document.querySelector("svg")).toBeNull();
  });

  test("the card carries the ivt-chart-card class", () => {
    render(<BenchmarkChart points={POINTS} skipped={[]} symbol={BENCHMARK.symbol} />);
    expect(document.querySelector(".ivt-chart-card")).not.toBeNull();
  });
});
