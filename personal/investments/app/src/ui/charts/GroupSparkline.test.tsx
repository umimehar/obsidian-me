import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
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

describe("GroupSparkline single-point group", () => {
  test("draws a visible marker rather than a zero-width area", () => {
    // The account lens's Crypto group holds exactly one statement (2026-06).
    const group = analytics.rollups.account.find((g) => g.label === "Crypto");
    if (group === undefined) throw new Error("expected a Crypto group in the account lens");
    const series = seriesForAccounts(
      analytics.series,
      group.accounts.map((a) => a.maskedId),
    );
    render(<GroupSparkline label="Crypto" series={series} xDomain={PORTFOLIO_DOMAIN} />);

    const dot = document.querySelector("circle");
    expect(dot).not.toBeNull();
    expect(Number(dot?.getAttribute("r"))).toBeGreaterThan(0);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("ending at $1,014.96.");
  });
});
