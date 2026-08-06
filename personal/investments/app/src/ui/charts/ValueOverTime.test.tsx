import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { loadAnalytics } from "../data";
import { ValueOverTime } from "./ValueOverTime";

/**
 * Renders against the real committed corpus (`data/analytics.json`), the
 * same data `portfolioSeries.test.ts` verifies ends 2023-06..2026-06 at
 * $241,739.67 -- not a hand-made fixture, so this test catches a real
 * accessibility regression, not a fixture drift.
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
});
