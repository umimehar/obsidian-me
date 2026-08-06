import { afterEach, describe, expect, test } from "bun:test";
import { render, renderHook, screen } from "@testing-library/react";
import { loadAnalytics } from "../data";
import { restoreReducedMotion, stubReducedMotion } from "../motionPreference";
import { ValueOverTime, revealMotion, useRevealMotion } from "./ValueOverTime";

describe("useRevealMotion", () => {
  let restore: typeof window.matchMedia | null = null;

  afterEach(() => {
    if (restore !== null) restoreReducedMotion(restore);
    restore = null;
  });

  test("reads the OS preference and hands the rule a true", () => {
    restore = stubReducedMotion(true);
    const { result } = renderHook(() => useRevealMotion(716));
    expect(result.current).toEqual(revealMotion(true, 716));
    expect(result.current.duration).toBe(0);
    expect(result.current.initialWidth).toBe(716);
  });

  test("without the preference it hands the rule a false", () => {
    restore = stubReducedMotion(false);
    const { result } = renderHook(() => useRevealMotion(716));
    expect(result.current).toEqual(revealMotion(false, 716));
    expect(result.current.duration).toBeGreaterThan(0.5);
    expect(result.current.initialWidth).toBe(0);
  });
});

describe("revealMotion", () => {
  test("reduced motion skips the reveal rather than running it faster", () => {
    const reveal = revealMotion(true, 716);
    expect(reveal.duration).toBe(0);
    expect(reveal.initialWidth).toBe(716);
  });

  test("without the preference the clip starts closed and takes real time", () => {
    const reveal = revealMotion(false, 716);
    expect(reveal.initialWidth).toBe(0);
    expect(reveal.duration).toBeGreaterThan(0.5);
  });
});

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
