import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AccountSeries } from "../../analytics/types";
import { loadAnalytics } from "../data";
import { GroupSparkline, INNER_HEIGHT, INNER_WIDTH } from "./GroupSparkline";
import { buildPortfolioSeries, periodExtent, seriesForAccounts } from "./portfolioSeries";

/**
 * Every case here runs against the real committed corpus
 * (`data/analytics.json`), the same data `portfolioSeries.test.ts` pins at
 * 2023-06..2026-06 / $241,739.67 -- not a hand-made fixture, so a broken
 * rollup wiring reddens these rather than passing on fixture drift.
 */
const analytics = loadAnalytics();
const PORTFOLIO_DOMAIN = periodExtent(buildPortfolioSeries(analytics.series));

/** The purpose-lens group named `label`, as the series its accounts own. */
function purposeGroup(label: string): readonly AccountSeries[] {
  const group = analytics.rollups.purpose.find((g) => g.label === label);
  if (group === undefined) throw new Error(`expected a purpose group named ${label}`);
  return seriesForAccounts(
    analytics.series,
    group.accounts.map((a) => a.maskedId),
  );
}

function renderGroup(label: string) {
  render(<GroupSparkline label={label} series={purposeGroup(label)} xDomain={PORTFOLIO_DOMAIN} />);
}

/** The `M`-command coordinates of the first point of the first path drawn. */
function firstPlotPoint(): { x: number; y: number } {
  const d = document.querySelector("path")?.getAttribute("d") ?? "";
  const match = /^M(-?[\d.]+),(-?[\d.]+)/.exec(d);
  if (match === null) throw new Error(`expected a path starting with a move command, got "${d}"`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe("GroupSparkline accessible summary", () => {
  test("states the ending value with cents, the precision the card's own total prints", () => {
    renderGroup("Retirement");
    const chart = screen.getByRole("img", { name: /retirement market value/i });
    // Not "$49,314" and not "$49,314.5": the card beside it says $49,314.45.
    expect(chart.getAttribute("aria-label")).toContain("ending at $49,314.45.");
  });

  test("names the group, so a screen reader can tell one card's chart from another's", () => {
    renderGroup("Education");
    const chart = screen.getByRole("img", { name: /education market value/i });
    expect(chart.getAttribute("aria-label")).toContain("ending at $3,943.98.");
  });

  test("states the group's own period range, not the portfolio's", () => {
    renderGroup("Education");
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    // Education is the RESP: six statements, Jan 2026 through Jun 2026.
    expect(label).toContain("from Jan 2026 to Jun 2026");
    expect(label).not.toContain("Jun 2023");
  });

  test("a long-running group states the full range it actually covers", () => {
    renderGroup("Growth");
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("from Jun 2023 to Jun 2026");
    expect(label).toContain("ending at $108,953.60.");
  });
});

describe("GroupSparkline shared x domain", () => {
  test("a group covering the whole portfolio range starts at the left edge", () => {
    renderGroup("Growth");
    expect(firstPlotPoint().x).toBe(0);
  });

  test("a late-starting group visibly begins partway across, never rescaled to fill the card", () => {
    renderGroup("Education");
    const { x } = firstPlotPoint();
    // Jan 2026 is 31 of the 36 months from Jun 2023, so the area must start
    // in the last sixth of the card. Rescaled to its own range it would be 0.
    expect(x).toBeGreaterThan(0);
    expect(x / INNER_WIDTH).toBeGreaterThan(0.8);
  });

  test("every group ends at the same right edge, since every one ends at Jun 2026", () => {
    render(
      <>
        <GroupSparkline label="Growth" series={purposeGroup("Growth")} xDomain={PORTFOLIO_DOMAIN} />
        <GroupSparkline
          label="Education"
          series={purposeGroup("Education")}
          xDomain={PORTFOLIO_DOMAIN}
        />
      </>,
    );
    const lastXs = [...document.querySelectorAll("circle")].map((c) => c.getAttribute("cx"));
    expect(lastXs.length).toBe(2);
    expect(lastXs[0]).toBe(lastXs[1] ?? null);
  });
});

describe("GroupSparkline y domain", () => {
  test("scales to the group's own maximum, so a small group is not flattened onto the baseline", () => {
    renderGroup("Education");
    const { y } = firstPlotPoint();
    // Education's whole range is $3,943.98 against a portfolio of $241,739.67.
    // On a shared y domain its line would sit within 2% of the baseline; on
    // its own domain it uses the card's height.
    expect(y).toBeLessThan(INNER_HEIGHT * 0.6);
  });
});

describe("GroupSparkline empty state", () => {
  test("a group with no stated figures says so rather than drawing a flat line at zero", () => {
    renderGroup("Spending");
    // The three Chequing accounts are inTotals: false, so this group has no
    // points at all. A zero baseline would read as a real balance of nothing.
    expect(screen.getByText(/no value history/i)).toBeDefined();
    expect(document.querySelector("path")).toBeNull();
    expect(document.querySelector("svg")).toBeNull();
  });

  test("the empty state still names the group for a screen reader", () => {
    renderGroup("Spending");
    expect(screen.getByRole("img", { name: /spending/i })).toBeDefined();
  });

  test("a null portfolio domain renders the empty state rather than an unscaled chart", () => {
    render(<GroupSparkline label="Growth" series={purposeGroup("Growth")} xDomain={null} />);
    expect(screen.getByText(/no value history/i)).toBeDefined();
  });
});

/** The account-lens group named `label`, as the series its accounts own. */
function accountGroup(label: string): readonly AccountSeries[] {
  const group = analytics.rollups.account.find((g) => g.label === label);
  if (group === undefined) throw new Error(`expected an account group named ${label}`);
  return seriesForAccounts(
    analytics.series,
    group.accounts.map((a) => a.maskedId),
  );
}

function renderCrypto() {
  render(
    <GroupSparkline label="Crypto" series={accountGroup("Crypto")} xDomain={PORTFOLIO_DOMAIN} />,
  );
}

describe("GroupSparkline single-point group", () => {
  test("draws a visible marker rather than a zero-width area", () => {
    // The account lens's Crypto group holds exactly one statement (2026-06).
    renderCrypto();

    const dot = document.querySelector("circle");
    expect(dot).not.toBeNull();
    expect(Number(dot?.getAttribute("r"))).toBeGreaterThan(0);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("ending at $1,014.96.");
  });

  test("says in words that it is one statement, so a lone dot does not read as a broken chart", () => {
    renderCrypto();
    expect(screen.getByText(/one statement, Jun 2026/i)).toBeDefined();
  });

  test("a group with a real line says nothing of the sort", () => {
    renderGroup("Growth");
    expect(screen.queryByText(/statement, /i)).toBeNull();
  });
});

/** The sparkline svg, with a stub box so a client x maps onto its viewBox one to one. */
function sparkline(): SVGSVGElement {
  const node = document.querySelector("svg");
  if (node === null) throw new Error("expected a sparkline to render");
  node.getBoundingClientRect = () => new DOMRect(0, 0, 720, 48);
  return node;
}

function tooltipText(): string {
  return document.querySelector("[data-chart-tooltip]")?.textContent ?? "";
}

describe("GroupSparkline cursor over the shared domain", () => {
  test("a month this group never reported says so, and states no figure", () => {
    // Education is the RESP: six statements, Jan 2026 to Jun 2026, drawn on
    // the portfolio's own Jun 2023 to Jun 2026 axis. Halfway across is 2024,
    // where this group has nothing at all. A nearest-point lookup would
    // answer with January 2026's figure for a month two years earlier.
    renderGroup("Education");
    fireEvent.pointerMove(sparkline(), { clientX: 360 });
    expect(tooltipText()).toMatch(/No statement for this month/);
    expect(tooltipText()).not.toContain("$");
    expect(tooltipText()).toMatch(/20(23|24)/);
    // The crosshair is there, and there is deliberately no dot on it: a dot
    // would put a point on the line where the group reported nothing.
    expect(document.querySelector("[data-cursor-marks]")).not.toBeNull();
    expect(document.querySelector("[data-cursor-marker]")).toBeNull();
  });

  test("a month it did report states that month's own value to the cent", () => {
    renderGroup("Education");
    fireEvent.pointerMove(sparkline(), { clientX: 719 });
    expect(tooltipText()).toContain("Jun 2026");
    expect(tooltipText()).toContain("$3,943.98");
    expect(tooltipText()).toContain("1 of 1 account reported this month");
  });

  test("arrowing from a gap lands on a stated month rather than the next empty one", () => {
    renderGroup("Education");
    const svg = sparkline();
    fireEvent.pointerMove(svg, { clientX: 360 });
    expect(tooltipText()).toMatch(/No statement/);
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(tooltipText()).toContain("Jan 2026");
    expect(tooltipText()).toContain("$");
  });

  test("the accessible summary of a group chart follows the cursor too", () => {
    renderGroup("Education");
    fireEvent.keyDown(sparkline(), { key: "End" });
    const summary = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(summary).toContain("Education market value from Jan 2026 to Jun 2026");
    expect(summary).toContain("Market value $3,943.98");
  });

  test("the empty-state card has no cursor to move, and no tooltip appears", () => {
    renderGroup("Spending");
    expect(document.querySelector("[data-chart-tooltip]")).toBeNull();
  });
});
