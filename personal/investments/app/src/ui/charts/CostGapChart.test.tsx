import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AccountSeries, MonthPoint } from "../../analytics/types";
import type { AccountKind, ManagementStyle } from "../../store/mask";
import type { Purpose } from "../../store/registry";
import { loadAnalytics, loadReconciliation } from "../data";
import { formatCurrency } from "../format";
import { CostGapChart } from "./CostGapChart";
import { tickY } from "./chartTestSupport";

/**
 * Against the real committed corpus. The series ends 2026-06 at market
 * $241,739.67 against book $223,675.08, a gap of $18,064.59, and 2023-06 is a
 * genuine $0 across 2 accounts. Pinning both here is how a corpus change
 * reddens these tests rather than quietly changing what the page claims.
 */
const analytics = loadAnalytics();

function renderChart() {
  render(<CostGapChart series={analytics.series} />);
}

function chart(): HTMLElement {
  return screen.getByRole("img");
}

function announced(): string {
  return document.querySelector("[data-cursor-announcement]")?.textContent ?? "";
}

function bars(sign: "above" | "below"): Element[] {
  return [...document.querySelectorAll(`[data-cost-gap-bar="${sign}"]`)];
}

/**
 * How many distinct statements state a diverging book cost, and the largest
 * divergence among them, both read off the real committed reconciliation
 * report rather than transcribed. `ApproximationNote`'s copy states these
 * two figures as prose; this derives them independently so a later change to
 * the reconciliation data reddens this test rather than leaving the callout
 * to quietly state a stale number.
 */
function bookCostDivergence(): { statementCount: number; maxDelta: number } {
  const matches = loadReconciliation().findings.filter((finding) =>
    finding.message.includes("book cost differs by"),
  );
  const statements = new Set(
    matches.map((finding) => `${finding.accountShortId}:${finding.period}`),
  );
  const maxDelta = Math.max(...matches.map((finding) => Math.abs(finding.delta ?? 0)));
  return { statementCount: statements.size, maxDelta };
}

afterEach(cleanup);

function month(period: string, marketValue: number, bookCost: number): MonthPoint {
  return {
    period,
    marketValue,
    bookCost,
    cashBalance: null,
    deposits: 0,
    withdrawals: 0,
    contributions: null,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: null,
    grants: 0,
  };
}

function account(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "TFSA 0001",
    kind: "TFSA" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned" as Purpose,
    inTotals: true,
    months: [month("2026-06", 1000, 900)],
    contributionsByYear: {},
    ...overrides,
  };
}

describe("the heading and the caveat", () => {
  test("names the chart", () => {
    renderChart();
    expect(
      screen.getByRole("heading", { name: "Value at market against value at cost" }),
    ).toBeDefined();
  });

  test("the approximation caveat renders in the open, adjacent to the chart, not only in a footnote", () => {
    renderChart();
    const note = document.querySelector("[data-cost-gap-provenance]");
    const noteText = note?.textContent ?? "";
    expect(noteText).toContain("approximate");
    expect(noteText).toContain("not a realized gain");
    expect(noteText).toContain("not a number to file with");
    // It precedes the chart's own svg in document order, in the same flow of
    // content, rather than sitting detached at the end of the page.
    const allNodes = [...document.body.querySelectorAll("*")];
    const noteIndex = note === null ? -1 : allNodes.indexOf(note);
    const svgIndex = allNodes.indexOf(chart());
    expect(noteIndex).toBeGreaterThan(-1);
    expect(noteIndex).toBeLessThan(svgIndex);
  });

  test("the legend states the grammar in words", () => {
    renderChart();
    const legend = document.querySelector("[data-cost-gap-legend]")?.textContent ?? "";
    expect(legend).toContain("Bar above the line: market value ahead of book cost");
    expect(legend).toContain("Bar below the line: book cost ahead of market value");
    expect(legend).toContain("Dashed border on every bar: derived here");
    expect(legend).toContain("real zero gap");
    expect(legend).toContain("no statement covers this month");
  });

  test("the callout's statement count and largest divergence are the reconciliation report's own figures", () => {
    const { statementCount, maxDelta } = bookCostDivergence();
    renderChart();
    const note = document.querySelector("[data-cost-gap-provenance]")?.textContent ?? "";
    expect(note).toContain(
      `Book cost does not reconcile on ${statementCount} of the underlying statements`,
    );
    expect(note).toContain(`by up to ${formatCurrency(maxDelta)}`);
  });
});

describe("bars: one per stated month, none for a gap", () => {
  test("draws exactly one bar for every month a statement covers", () => {
    const series = [
      account({
        maskedId: "a",
        months: [
          month("2026-01", 1100, 1000),
          month("2026-02", 1000, 1000),
          month("2026-04", 900, 1000),
        ],
      }),
    ];
    render(<CostGapChart series={series} />);
    // 2026-03 is absent from months[] entirely: no account states it, so it
    // gets no bar, even though it sits inside the range the axis spans.
    const all = [...document.querySelectorAll("[data-cost-gap-bar]")];
    expect(all.map((b) => b.getAttribute("data-period"))).toEqual([
      "2026-01",
      "2026-02",
      "2026-04",
    ]);
  });

  test("a real stated zero gap still draws its rect, at zero height", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 1000, 1000)] })];
    render(<CostGapChart series={series} />);
    const bar = bars("above")[0];
    expect(bar?.getAttribute("height")).toBe("0");
    // Still present as an element with a stroke, unlike the gap month which
    // has no element at all -- see the previous test.
    expect(bar?.getAttribute("stroke")).not.toBeNull();
  });

  test("a positive gap grows up from zero, a negative gap grows down", () => {
    const series = [
      account({
        maskedId: "a",
        months: [month("2026-01", 1100, 1000), month("2026-02", 900, 1000)],
      }),
    ];
    render(<CostGapChart series={series} />);
    const zeroLineY = Number(
      /translate\(0,([\d.]+)\)/.exec(
        document.querySelector("[data-zero-line]")?.parentElement?.getAttribute("transform") ?? "",
      )?.[1],
    );
    const above = bars("above")[0];
    const below = bars("below")[0];
    const aboveTop = Number(above?.getAttribute("y"));
    const aboveHeight = Number(above?.getAttribute("height"));
    const belowTop = Number(below?.getAttribute("y"));
    // The above-line bar's bottom edge sits on the zero line, growing upward.
    expect(aboveTop + aboveHeight).toBeCloseTo(zeroLineY, 0);
    // The below-line bar starts at the zero line, growing downward.
    expect(belowTop).toBeCloseTo(zeroLineY, 0);
  });

  /**
   * A bar's height is a figure, the same as a bar chart's label. Only
   * checking that the bar sits on the right side of the zero line leaves it
   * free to be drawn at any fraction of its real value, and a ratio between
   * two bars is not enough either: a mutation that scales every bar by the
   * same constant factor changes no bar-to-bar ratio at all. What catches it
   * is anchoring a bar's height to the axis's own tick, drawn by `Gridlines`
   * from the same `scales` object but a separate code path.
   */
  test("a $1,000 gap bar's height matches the axis's own $1,000 tick", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 2000, 1000)] })];
    render(<CostGapChart series={series} />);
    const zeroLineY = Number(
      /translate\(0,([\d.]+)\)/.exec(
        document.querySelector("[data-zero-line]")?.parentElement?.getAttribute("transform") ?? "",
      )?.[1],
    );
    const height = Number(bars("above")[0]?.getAttribute("height"));
    expect(height).toBeCloseTo(zeroLineY - tickY("$1,000"), 0);
  });

  /** The same anchor, on the below-the-line side of the zero line. */
  test("a -$1,000 gap bar's height matches the axis's own -$1,000 tick", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 1000, 2000)] })];
    render(<CostGapChart series={series} />);
    const zeroLineY = Number(
      /translate\(0,([\d.]+)\)/.exec(
        document.querySelector("[data-zero-line]")?.parentElement?.getAttribute("transform") ?? "",
      )?.[1],
    );
    const height = Number(bars("below")[0]?.getAttribute("height"));
    expect(height).toBeCloseTo(tickY("-$1,000") - zeroLineY, 0);
  });

  test("an above bar and a below bar are filled differently, not by position alone", () => {
    const series = [
      account({
        maskedId: "a",
        months: [month("2026-01", 1100, 1000), month("2026-02", 900, 1000)],
      }),
    ];
    render(<CostGapChart series={series} />);
    const above = bars("above")[0];
    const below = bars("below")[0];
    expect(above?.getAttribute("fill")).not.toBe(below?.getAttribute("fill"));
  });

  /**
   * "Filled differently" alone is satisfied by an inversion that swaps which
   * side gets which colour: gains drawing amber and losses drawing jade
   * still passes an inequality check, while the legend beside "Bar above the
   * line: market value ahead of book cost" keeps pointing at jade and now
   * contradicts the chart. Anchoring each bar's fill to its own legend
   * swatch's fill -- read from the DOM, not from the `ABOVE_FILL`/
   * `BELOW_FILL` tokens -- is what pins the mark to the words rather than to
   * a colour that could drift from them on both sides at once.
   */
  test("an above bar's fill matches the legend's above swatch, a below bar's the below swatch", () => {
    const series = [
      account({
        maskedId: "a",
        months: [month("2026-01", 1100, 1000), month("2026-02", 900, 1000)],
      }),
    ];
    render(<CostGapChart series={series} />);
    const above = bars("above")[0];
    const below = bars("below")[0];
    const aboveSwatch = document.querySelector('[data-legend-swatch="above"]');
    const belowSwatch = document.querySelector('[data-legend-swatch="below"]');
    expect(above?.getAttribute("fill")).toBe(aboveSwatch?.getAttribute("fill"));
    expect(below?.getAttribute("fill")).toBe(belowSwatch?.getAttribute("fill"));
  });

  test("every bar carries a dashed border, since none is a stated figure", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 1100, 1000)] })];
    render(<CostGapChart series={series} />);
    const bar = bars("above")[0];
    expect(bar?.getAttribute("stroke-dasharray")).toBe("5 4");
  });

  test("bars are ordered left to right by period, each at a distinct x", () => {
    const series = [
      account({
        maskedId: "a",
        months: [
          month("2026-01", 1100, 1000),
          month("2026-02", 1200, 1000),
          month("2026-03", 1300, 1000),
        ],
      }),
    ];
    render(<CostGapChart series={series} />);
    const xs = bars("above").map((b) => Number(b.getAttribute("x")));
    expect(xs[0]).toBeLessThan(xs[1] ?? Number.NaN);
    expect(xs[1]).toBeLessThan(xs[2] ?? Number.NaN);
  });
});

describe("the axis names the range in the open", () => {
  test("the first and last period labels sit at the axis ends", () => {
    const series = [
      account({
        maskedId: "a",
        months: [month("2026-01", 1100, 1000), month("2026-03", 1200, 1000)],
      }),
    ];
    render(<CostGapChart series={series} />);
    const texts = [...document.querySelectorAll("text")].map((node) => node.textContent);
    expect(texts).toContain("Jan 2026");
    expect(texts).toContain("Mar 2026");
  });
});

describe("the crosshair", () => {
  test("is absent until the cursor moves, and marks the gap point once it does", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 1100, 1000)] })];
    render(<CostGapChart series={series} />);
    expect(document.querySelector("[data-cursor-marks]")).toBeNull();
    fireEvent.keyDown(chart(), { key: "Home" });
    expect(document.querySelector("[data-cursor-marks]")).not.toBeNull();
    expect(document.querySelector("[data-cursor-marker]")).not.toBeNull();
  });
});

describe("the cursor distinguishes a real zero gap from a missing month", () => {
  test("a gap month announces an absence, no figure at all", () => {
    const series = [
      account({
        maskedId: "a",
        months: [month("2026-01", 1100, 1000), month("2026-03", 1200, 1000)],
      }),
    ];
    render(<CostGapChart series={series} />);
    fireEvent.keyDown(chart(), { key: "Home" });
    expect(announced()).toContain("Gap $100.00, approximate");
    fireEvent.keyDown(chart(), { key: "End" });
    expect(announced()).toContain("Gap $200.00, approximate");
  });

  test("a real stated zero gap announces the figure, not an absence", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 1000, 1000)] })];
    render(<CostGapChart series={series} />);
    fireEvent.keyDown(chart(), { key: "Home" });
    const spoken = announced();
    expect(spoken).toContain("Gap $0.00, approximate");
    expect(spoken).toContain("Market value equal to book cost");
    expect(spoken).not.toContain("No statement");
  });
});

describe("against the real committed analytics.json", () => {
  test("2023-06, the first month, announces a real zero gap across two accounts", () => {
    renderChart();
    fireEvent.keyDown(chart(), { key: "Home" });
    const spoken = announced();
    expect(spoken).toContain("Jun 2023");
    expect(spoken).toContain("Gap $0.00, approximate");
    expect(spoken).toContain("2 accounts reported this month");
  });

  test("2026-06, the last month, announces the $18,064.59 gap at full precision", () => {
    renderChart();
    fireEvent.keyDown(chart(), { key: "End" });
    const spoken = announced();
    expect(spoken).toContain("Gap $18,064.59, approximate");
    expect(spoken).not.toContain("Gap $18,065");
    expect(spoken).toContain("11 accounts reported this month");
  });

  /**
   * The gap line is not the only figure the readout carries: the market
   * value and book cost it is computed from are stated too, and both must
   * keep their cents. `formatAxisCurrency` swapped in on that one line
   * leaves every other assertion in this file green, which is exactly how
   * this codebase has shipped an announced `$241,740` beside a rendered
   * `$241,739.67` before.
   */
  test("2026-06 also announces the market value and book cost at full precision", () => {
    renderChart();
    fireEvent.keyDown(chart(), { key: "End" });
    const spoken = announced();
    expect(spoken).toContain("Market value $241,739.67, book cost $223,675.08");
    expect(spoken).not.toContain("$241,740");
    expect(spoken).not.toContain("$223,675 ");
  });

  test("the visible tooltip and the accessible name carry the same words", () => {
    renderChart();
    fireEvent.keyDown(chart(), { key: "End" });
    const tooltip = document.querySelector("[data-chart-tooltip]")?.textContent ?? "";
    expect(tooltip).toContain("Gap $18,064.59, approximate");
    expect(chart().getAttribute("aria-label")).toContain("Gap $18,064.59, approximate");
  });

  test("the accessible summary states the ending gap and that it is not a filing figure", () => {
    renderChart();
    const label = chart().getAttribute("aria-label") ?? "";
    expect(label).toContain("$18,064.59");
    expect(label).toContain("Not a realized gain and not a filing figure");
  });

  test("the corpus's every month has a statement, so the summary omits the blank-months clause", () => {
    renderChart();
    expect(chart().getAttribute("aria-label")).not.toContain("left blank");
  });
});

describe("the accessible summary names how many months have a statement", () => {
  test("a series with a gap states how many of the axis's months are drawn", () => {
    const series = [
      account({
        maskedId: "a",
        months: [month("2026-01", 1100, 1000), month("2026-03", 1200, 1000)],
      }),
    ];
    render(<CostGapChart series={series} />);
    const label = chart().getAttribute("aria-label") ?? "";
    expect(label).toContain("from Jan 2026 to Mar 2026");
    expect(label).toContain("2 of 3 months have a statement");
    expect(label).toContain("left blank rather than drawn as zero");
  });
});

describe("the chart is a responsive graphic", () => {
  test("scales by viewBox rather than a fixed pixel width", () => {
    renderChart();
    expect(chart().getAttribute("viewBox")).toBe("0 0 800 260");
    expect(chart().getAttribute("width")).toBeNull();
  });
});

describe("the empty series", () => {
  test("says there is nothing to chart rather than drawing an empty axis", () => {
    render(<CostGapChart series={[]} />);
    expect(screen.getByText("No portfolio value history yet.")).toBeDefined();
    expect(document.querySelector("[data-cost-gap-bar]")).toBeNull();
  });
});
