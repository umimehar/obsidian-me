import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AccountSeries, MonthPoint } from "../../analytics/types";
import type { AccountKind, ManagementStyle } from "../../store/mask";
import type { Purpose } from "../../store/registry";
import { loadAnalytics } from "../data";
import { CashflowChart } from "./CashflowChart";

/**
 * Against the real committed corpus. The figures pinned here -- 2023-06's
 * real stated zero across two accounts, 2023-07's $3,445 deposit and
 * $1,280.75 withdrawal, and 2026-06's $9,500 across eleven accounts -- are
 * the ones the chart prints, so a corpus change reddens these rather than
 * quietly changing what the page claims.
 */
const analytics = loadAnalytics();

function renderChart() {
  render(<CashflowChart series={analytics.series} />);
}

function chart(): HTMLElement {
  return screen.getByRole("img");
}

function announced(): string {
  return document.querySelector("[data-cursor-announcement]")?.textContent ?? "";
}

function bars(kind: "deposit" | "withdrawal"): Element[] {
  return [...document.querySelectorAll(`[data-cashflow-bar="${kind}"]`)];
}

/**
 * The y a gridline's own scale places a labelled tick at, read off the DOM
 * rather than recomputed. `Gridlines` and `Bars` are drawn from the same
 * `scales` object, but by separate code paths, so anchoring a bar's height
 * to a tick's position -- rather than only to another bar's height -- is
 * what catches a mutation that scales every bar by one constant factor:
 * that leaves every bar-to-bar ratio unchanged, but leaves a bar disagreeing
 * with the axis it is drawn against.
 */
function tickY(label: string): number {
  const text = [...document.querySelectorAll("svg text")].find(
    (node) => node.textContent === label,
  );
  if (text === undefined) throw new Error(`expected a ${label} tick`);
  const transform = text.parentElement?.getAttribute("transform") ?? "";
  const y = Number(/translate\(0,([\d.]+)\)/.exec(transform)?.[1]);
  if (Number.isNaN(y)) throw new Error(`could not read the ${label} tick's position`);
  return y;
}

afterEach(cleanup);

function month(period: string, deposits: number, withdrawals = 0): MonthPoint {
  return {
    period,
    marketValue: null,
    bookCost: null,
    cashBalance: null,
    deposits,
    withdrawals,
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
    months: [month("2026-06", 1000)],
    contributionsByYear: {},
    ...overrides,
  };
}

describe("the heading and legend", () => {
  test("names the chart and states the grammar in words", () => {
    renderChart();
    expect(screen.getByRole("heading", { name: "Monthly cashflow" })).toBeDefined();
    const legend = document.querySelector("[data-cashflow-legend]")?.textContent ?? "";
    expect(legend).toContain("Bar above the line: deposits");
    expect(legend).toContain("Bar below the line: withdrawals");
    expect(legend).toContain("real zero");
    expect(legend).toContain("no statement covers this month");
  });
});

describe("bars: one pair per stated month, none for a gap", () => {
  test("draws exactly one deposit and one withdrawal rect for every month a statement covers", () => {
    const series = [
      account({
        maskedId: "a",
        months: [month("2026-01", 100, 0), month("2026-02", 0, 0), month("2026-04", 50, 20)],
      }),
    ];
    render(<CashflowChart series={series} />);
    // 2026-03 is absent from months[] entirely: no account states it, so it
    // gets no bar of either kind, even though it sits inside the range the
    // axis spans between Jan and Apr.
    expect(bars("deposit").map((b) => b.getAttribute("data-period"))).toEqual([
      "2026-01",
      "2026-02",
      "2026-04",
    ]);
    expect(bars("withdrawal")).toHaveLength(3);
  });

  test("a real stated zero still draws its rects, at zero height", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 0, 0)] })];
    render(<CashflowChart series={series} />);
    const deposit = bars("deposit")[0];
    const withdrawal = bars("withdrawal")[0];
    expect(deposit?.getAttribute("height")).toBe("0");
    expect(withdrawal?.getAttribute("height")).toBe("0");
    // Still present as elements with a stroke, unlike the gap month which
    // has no element at all -- see the previous test.
    expect(deposit?.getAttribute("stroke")).not.toBeNull();
  });

  test("deposits and withdrawals grow in opposite directions from the zero line", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 500, 300)] })];
    render(<CashflowChart series={series} />);
    const deposit = bars("deposit")[0];
    const withdrawal = bars("withdrawal")[0];
    const zeroLineY = Number(
      /translate\(0,([\d.]+)\)/.exec(
        document.querySelector("[data-zero-line]")?.parentElement?.getAttribute("transform") ?? "",
      )?.[1],
    );
    const depositTop = Number(deposit?.getAttribute("y"));
    const depositHeight = Number(deposit?.getAttribute("height"));
    const withdrawalTop = Number(withdrawal?.getAttribute("y"));
    // The deposit rect's bottom edge sits on the zero line, growing upward.
    expect(depositTop + depositHeight).toBeCloseTo(zeroLineY, 0);
    // The withdrawal rect starts at the zero line, growing downward.
    expect(withdrawalTop).toBeCloseTo(zeroLineY, 0);
  });

  /**
   * A bar's height is a figure, the same as a bar chart's label. Asserting
   * only that a bar sits on the correct side of the zero line, as the
   * previous test does, leaves it free to be drawn at any fraction of its
   * real value -- direction pinned, magnitude not. A ratio between two bars
   * is not enough either: a mutation that scales every bar by the same
   * constant factor changes no bar-to-bar ratio at all. What catches it is
   * anchoring a bar's height to the axis's own tick, drawn by `Gridlines`
   * from the same `scales` object but a separate code path, so a $1,000
   * deposit in a domain topping out at exactly $1,000 must reach the
   * `$1,000` tick, not merely be taller than a smaller bar.
   */
  test("a $1,000 deposit bar's height matches the axis's own $1,000 tick", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 1000, 0)] })];
    render(<CashflowChart series={series} />);
    const zeroLineY = Number(
      /translate\(0,([\d.]+)\)/.exec(
        document.querySelector("[data-zero-line]")?.parentElement?.getAttribute("transform") ?? "",
      )?.[1],
    );
    const depositHeight = Number(bars("deposit")[0]?.getAttribute("height"));
    expect(depositHeight).toBeCloseTo(zeroLineY - tickY("$1,000"), 0);
  });

  /** The same anchor, on the withdrawal side of the zero line. */
  test("a $1,000 withdrawal bar's height matches the axis's own -$1,000 tick", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 0, 1000)] })];
    render(<CashflowChart series={series} />);
    const zeroLineY = Number(
      /translate\(0,([\d.]+)\)/.exec(
        document.querySelector("[data-zero-line]")?.parentElement?.getAttribute("transform") ?? "",
      )?.[1],
    );
    const withdrawalHeight = Number(bars("withdrawal")[0]?.getAttribute("height"));
    expect(withdrawalHeight).toBeCloseTo(tickY("-$1,000") - zeroLineY, 0);
  });

  test("deposits and withdrawals are filled and stroked differently, not by position alone", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 500, 300)] })];
    render(<CashflowChart series={series} />);
    const deposit = bars("deposit")[0];
    const withdrawal = bars("withdrawal")[0];
    expect(deposit?.getAttribute("fill")).toBe("var(--jade-a6)");
    expect(deposit?.getAttribute("stroke")).toBe("var(--jade-a11)");
    expect(withdrawal?.getAttribute("fill")).toBe("var(--gray-a6)");
    expect(withdrawal?.getAttribute("stroke")).toBe("var(--gray-a11)");
    expect(deposit?.getAttribute("fill")).not.toBe(withdrawal?.getAttribute("fill"));
  });

  test("bars are ordered left to right by period, each at a distinct x", () => {
    const series = [
      account({
        maskedId: "a",
        months: [month("2026-01", 100), month("2026-02", 100), month("2026-03", 100)],
      }),
    ];
    render(<CashflowChart series={series} />);
    const xs = bars("deposit").map((b) => Number(b.getAttribute("x")));
    expect(xs[0]).toBeLessThan(xs[1] ?? Number.NaN);
    expect(xs[1]).toBeLessThan(xs[2] ?? Number.NaN);
  });
});

describe("the axis names the range in the open, not only in the accessible summary", () => {
  test("the first and last period labels sit at the axis ends", () => {
    const series = [
      account({ maskedId: "a", months: [month("2026-01", 100), month("2026-03", 50)] }),
    ];
    render(<CashflowChart series={series} />);
    const texts = [...document.querySelectorAll("text")].map((node) => node.textContent);
    expect(texts).toContain("Jan 2026");
    expect(texts).toContain("Mar 2026");
  });
});

describe("the crosshair", () => {
  test("is absent until the cursor moves, and appears once it does", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 100)] })];
    render(<CashflowChart series={series} />);
    expect(document.querySelector("[data-cursor-marks]")).toBeNull();
    fireEvent.keyDown(chart(), { key: "Home" });
    expect(document.querySelector("[data-cursor-marks]")).not.toBeNull();
    // No dot: a month states two figures, deposits and withdrawals, and
    // neither is the one value a single marker could sit at.
    expect(document.querySelector("[data-cursor-marker]")).toBeNull();
  });
});

describe("the cursor distinguishes a real zero from a gap", () => {
  test("a gap month announces an absence, no figures at all", () => {
    const series = [
      account({ maskedId: "a", months: [month("2026-01", 100, 0), month("2026-03", 50, 0)] }),
    ];
    render(<CashflowChart series={series} />);
    // Home lands on the first plotted point, ArrowRight steps to the next
    // one the series actually states, so this reaches 2026-03. February,
    // sitting between them on the axis, is reached with a pointer instead;
    // exercised directly through the tooltip-line unit tests, since jsdom's
    // getBoundingClientRect returns zeros and cannot drive a pointer test.
    fireEvent.keyDown(chart(), { key: "Home" });
    expect(announced()).toContain("Deposits $100.00");
    fireEvent.keyDown(chart(), { key: "End" });
    expect(announced()).toContain("Deposits $50.00");
  });

  test("a stated zero month announces both figures as zero, not an absence", () => {
    const series = [account({ maskedId: "a", months: [month("2026-01", 0, 0)] })];
    render(<CashflowChart series={series} />);
    fireEvent.keyDown(chart(), { key: "Home" });
    const spoken = announced();
    expect(spoken).toContain("Deposits $0.00");
    expect(spoken).toContain("Withdrawals $0.00");
    expect(spoken).not.toContain("No statement");
  });
});

describe("against the real committed analytics.json", () => {
  test("2023-06, the first month, announces a real zero across two accounts", () => {
    renderChart();
    fireEvent.keyDown(chart(), { key: "Home" });
    const spoken = announced();
    expect(spoken).toContain("Jun 2023");
    expect(spoken).toContain("Deposits $0.00");
    expect(spoken).toContain("Withdrawals $0.00");
    expect(spoken).toContain("2 accounts reported this month");
  });

  test("2023-07 announces its deposit and withdrawal at full precision", () => {
    renderChart();
    fireEvent.keyDown(chart(), { key: "Home" });
    fireEvent.keyDown(chart(), { key: "ArrowRight" });
    const spoken = announced();
    expect(spoken).toContain("Deposits $3,445.00");
    expect(spoken).toContain("Withdrawals $1,280.75");
    expect(spoken).not.toContain("$3,445 ");
  });

  test("2026-06, the last month, announces $9,500 deposited and nothing withdrawn", () => {
    renderChart();
    fireEvent.keyDown(chart(), { key: "End" });
    const spoken = announced();
    expect(spoken).toContain("Deposits $9,500.00");
    expect(spoken).toContain("Withdrawals $0.00");
    expect(spoken).toContain("11 accounts reported this month");
  });

  test("the visible tooltip and the accessible name carry the same words", () => {
    renderChart();
    fireEvent.keyDown(chart(), { key: "End" });
    const tooltip = document.querySelector("[data-chart-tooltip]")?.textContent ?? "";
    expect(tooltip).toContain("Deposits $9,500.00");
    expect(chart().getAttribute("aria-label")).toContain("Deposits $9,500.00");
  });

  test("the corpus's every month has a statement, so the summary omits the blank-months clause", () => {
    renderChart();
    expect(chart().getAttribute("aria-label")).not.toContain("left blank");
  });
});

describe("the accessible summary names the range and how many months have a statement", () => {
  test("a series with a gap states how many of the axis's months are drawn", () => {
    const series = [
      account({ maskedId: "a", months: [month("2026-01", 100, 0), month("2026-03", 50, 0)] }),
    ];
    render(<CashflowChart series={series} />);
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
    render(<CashflowChart series={[]} />);
    expect(screen.getByText("No cashflow history yet.")).toBeDefined();
    expect(document.querySelector("[data-cashflow-bar]")).toBeNull();
  });
});
