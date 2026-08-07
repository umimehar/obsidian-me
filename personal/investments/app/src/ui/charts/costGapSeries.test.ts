import { describe, expect, test } from "bun:test";
import { buildPortfolioSeries } from "../../analytics/portfolioSeries";
import { loadAnalytics } from "../data";
import { buildGapPoints, costGapPeriodExtent, costGapTooltipLines } from "./costGapSeries";

describe("buildGapPoints", () => {
  test("subtracts book cost from market value, keeping every other field", () => {
    const points = buildGapPoints([
      { period: "2026-01", marketValue: 1000, bookCost: 900, accountCount: 2 },
    ]);
    expect(points).toEqual([
      { period: "2026-01", marketValue: 1000, bookCost: 900, accountCount: 2, gap: 100 },
    ]);
  });

  test("a negative gap is book cost ahead of market value, not clamped to zero", () => {
    const points = buildGapPoints([
      { period: "2026-01", marketValue: 800, bookCost: 900, accountCount: 1 },
    ]);
    expect(points[0]?.gap).toBe(-100);
  });

  test("market value equal to book cost is a real zero gap", () => {
    const points = buildGapPoints([
      { period: "2026-01", marketValue: 0, bookCost: 0, accountCount: 2 },
    ]);
    expect(points[0]?.gap).toBe(0);
  });

  test("does no second aggregation: an empty input is an empty output", () => {
    expect(buildGapPoints([])).toEqual([]);
  });
});

describe("costGapTooltipLines", () => {
  test("a null point announces an absence, never a zero", () => {
    const lines = costGapTooltipLines("2026-01", null);
    expect(lines).toContain("No statement for this month");
    expect(lines.join(" ")).not.toContain("$0.00");
  });

  test("labels the gap approximate on the same line as the figure", () => {
    const lines = costGapTooltipLines("2026-01", {
      period: "2026-01",
      marketValue: 1000,
      bookCost: 900,
      accountCount: 2,
      gap: 100,
    });
    const gapLine = lines.find((line) => line.startsWith("Gap"));
    expect(gapLine).toBe("Gap $100.00, approximate");
  });

  test("never presents the gap as a realized or filing figure", () => {
    const lines = costGapTooltipLines("2026-01", {
      period: "2026-01",
      marketValue: 1000,
      bookCost: 900,
      accountCount: 2,
      gap: 100,
    });
    const text = lines.join(" ").toLowerCase();
    expect(text).not.toContain("realized");
    expect(text).not.toContain("filing figure:");
  });

  test("states the direction in words for a positive, a negative and a zero gap", () => {
    const ahead = costGapTooltipLines("2026-01", {
      period: "2026-01",
      marketValue: 1000,
      bookCost: 900,
      accountCount: 1,
      gap: 100,
    });
    const behind = costGapTooltipLines("2026-01", {
      period: "2026-01",
      marketValue: 800,
      bookCost: 900,
      accountCount: 1,
      gap: -100,
    });
    const flat = costGapTooltipLines("2026-01", {
      period: "2026-01",
      marketValue: 900,
      bookCost: 900,
      accountCount: 1,
      gap: 0,
    });
    expect(ahead).toContain("Market value ahead of book cost");
    expect(behind).toContain("Book cost ahead of market value");
    expect(flat).toContain("Market value equal to book cost");
  });

  test("carries full precision, never a coarser figure than the corpus states", () => {
    const lines = costGapTooltipLines("2026-06", {
      period: "2026-06",
      marketValue: 241739.67,
      bookCost: 223675.08,
      accountCount: 11,
      gap: 241739.67 - 223675.08,
    });
    const gapLine = lines.find((line) => line.startsWith("Gap")) ?? "";
    expect(gapLine).toContain("18,064.59");
  });

  /**
   * The gap line is not the only figure on the readout: the market value and
   * book cost line repeats both underlying numbers, and `formatAxisCurrency`
   * swapped in for `formatCurrency` there leaves the whole suite green
   * without this assertion -- exactly the `$241,740` for `$241,739.67`
   * defect this codebase has shipped four times before, on the one chart
   * whose entire subject is comparing these two figures.
   */
  test("the market value and book cost line also carries full precision", () => {
    const lines = costGapTooltipLines("2026-06", {
      period: "2026-06",
      marketValue: 241739.67,
      bookCost: 223675.08,
      accountCount: 11,
      gap: 241739.67 - 223675.08,
    });
    const detailLine = lines.find((line) => line.includes("converted and approximate")) ?? "";
    expect(detailLine).toContain("$241,739.67");
    expect(detailLine).toContain("$223,675.08");
    expect(detailLine).not.toContain("$241,740");
    expect(detailLine).not.toContain("$223,675 ");
  });
});

describe("against the real committed analytics.json", () => {
  const analytics = loadAnalytics();
  const gapPoints = buildGapPoints(buildPortfolioSeries(analytics.series));

  test("ends 2026-06 at the market-minus-book gap the corpus states", () => {
    const last = gapPoints[gapPoints.length - 1];
    expect(last?.period).toBe("2026-06");
    expect(last?.marketValue).toBeCloseTo(241739.67, 2);
    expect(last?.bookCost).toBeCloseTo(223675.08, 2);
    expect(last?.gap).toBeCloseTo(241739.67 - 223675.08, 2);
  });

  test("2023-06, the first point, is a real zero gap across two accounts", () => {
    const first = gapPoints[0];
    expect(first?.period).toBe("2023-06");
    expect(first?.marketValue).toBe(0);
    expect(first?.bookCost).toBe(0);
    expect(first?.gap).toBe(0);
    expect(first?.accountCount).toBe(2);
  });

  test("costGapPeriodExtent is the same [first, last] buildPortfolioSeries reports", () => {
    expect(costGapPeriodExtent(gapPoints)).toEqual(["2023-06", "2026-06"]);
  });
});
