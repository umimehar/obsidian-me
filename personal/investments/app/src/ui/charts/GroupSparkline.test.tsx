import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  buildPortfolioSeries,
  periodExtent,
  seriesForAccounts,
} from "../../analytics/portfolioSeries";
import type { AccountSeries } from "../../analytics/types";
import { GOLDENS, groupGolden } from "../../goldens";
import { loadAnalytics } from "../data";
import { formatCurrency } from "../format";
import { GroupSparkline, INNER_HEIGHT, INNER_WIDTH } from "./GroupSparkline";
import { formatPeriodLabel } from "./plot";

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

/** Every y coordinate the first path draws through. */
function plotYs(): number[] {
  const d = document.querySelector("path")?.getAttribute("d") ?? "";
  return [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
}

/** The `from X to Y, ending at $Z.` clause one purpose group's summary must carry. */
function summaryClauses(label: string): { range: string; ending: string } {
  const golden = groupGolden("purpose", label);
  return {
    range: `from ${formatPeriodLabel(golden.firstPeriod)} to ${formatPeriodLabel(golden.lastPeriod)}`,
    ending: `ending at ${formatCurrency(golden.market)}.`,
  };
}

describe("GroupSparkline accessible summary", () => {
  test("states the ending value with cents, the precision the card's own total prints", () => {
    renderGroup("Retirement");
    const chart = screen.getByRole("img", { name: /retirement market value/i });
    // To the cent, the same precision the card beside it prints.
    expect(chart.getAttribute("aria-label")).toContain(summaryClauses("Retirement").ending);
  });

  test("names the group, so a screen reader can tell one card's chart from another's", () => {
    renderGroup("Education");
    const chart = screen.getByRole("img", { name: /education market value/i });
    expect(chart.getAttribute("aria-label")).toContain(summaryClauses("Education").ending);
  });

  test("states the group's own period range, not the portfolio's", () => {
    renderGroup("Education");
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    // Education is the RESP, which opened long after the corpus did, so its
    // own range must not start at the portfolio's first month.
    expect(label).toContain(summaryClauses("Education").range);
    expect(groupGolden("purpose", "Education").firstPeriod).not.toBe(GOLDENS.corpus.firstPeriod);
    expect(label).not.toContain(formatPeriodLabel(GOLDENS.corpus.firstPeriod));
  });

  test("a long-running group states the full range it actually covers", () => {
    renderGroup("Growth");
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(groupGolden("purpose", "Growth").firstPeriod).toBe(GOLDENS.corpus.firstPeriod);
    expect(label).toContain(summaryClauses("Growth").range);
    expect(label).toContain(summaryClauses("Growth").ending);
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
    // The RESP opens in the last sixth of the corpus's span, so its area must
    // start well across the card. Rescaled to its own range it would be 0.
    expect(x).toBeGreaterThan(0);
    expect(x / INNER_WIDTH).toBeGreaterThan(0.8);
  });

  test("every group ends at the same right edge, since every one ends at the corpus's last month", () => {
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
    // Education's whole range is a small fraction of the portfolio. On a
    // shared y domain even its highest point would sit within a couple of
    // percent of the baseline; on its own domain it reaches the top.
    expect(Math.min(...plotYs())).toBeLessThan(INNER_HEIGHT * 0.2);
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

/**
 * The Crypto account cut back to its own first month. Crypto WAS a genuine
 * single-statement group in the corpus until 2026-07 gave it a second, and
 * an account can hold exactly one statement again at any time -- the state is
 * real, it just is not guaranteed to exist in whatever month was imported
 * last. Built from the real account rather than fabricated, so the shape,
 * the kind and the label are all still the corpus's own.
 */
function singlePointGroup(): readonly AccountSeries[] {
  const [account] = accountGroup("Crypto");
  if (account === undefined) throw new Error("expected a Crypto account in the corpus");
  const first = account.months[0];
  if (first === undefined) throw new Error("expected the Crypto account to report a month");
  return [{ ...account, months: [first] }];
}

const SINGLE_POINT = singlePointGroup();

function renderCrypto() {
  render(<GroupSparkline label="Crypto" series={SINGLE_POINT} xDomain={PORTFOLIO_DOMAIN} />);
}

/** The one month `SINGLE_POINT` reports, and its value. */
function singlePoint(): { period: string; marketValue: number } {
  const month = SINGLE_POINT[0]?.months[0];
  if (month === undefined) throw new Error("expected one month");
  return { period: month.period, marketValue: month.marketValue ?? 0 };
}

describe("GroupSparkline single-point group", () => {
  test("draws a visible marker rather than a zero-width area", () => {
    renderCrypto();

    const dot = document.querySelector("circle");
    expect(dot).not.toBeNull();
    expect(Number(dot?.getAttribute("r"))).toBeGreaterThan(0);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      `ending at ${formatCurrency(singlePoint().marketValue)}.`,
    );
  });

  test("says in words that it is one statement, so a lone dot does not read as a broken chart", () => {
    renderCrypto();
    const period = formatPeriodLabel(singlePoint().period);
    expect(screen.getByText(new RegExp(`one statement, ${period}`, "i"))).toBeDefined();
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
    // Education is the RESP, drawn on the portfolio's own much longer axis.
    // Halfway across, this group has nothing at all. A nearest-point lookup
    // would answer with its first month's figure for a month years earlier.
    renderGroup("Education");
    fireEvent.pointerMove(sparkline(), { clientX: 360 });
    expect(tooltipText()).toMatch(/No statement for this month/);
    expect(tooltipText()).not.toContain("$");
    const hoveredYear = Number(/\d{4}/.exec(tooltipText())?.[0]);
    expect(hoveredYear).toBeLessThan(
      Number(groupGolden("purpose", "Education").firstPeriod.slice(0, 4)),
    );
    // The crosshair is there, and there is deliberately no dot on it: a dot
    // would put a point on the line where the group reported nothing.
    expect(document.querySelector("[data-cursor-marks]")).not.toBeNull();
    expect(document.querySelector("[data-cursor-marker]")).toBeNull();
  });

  test("a month it did report states that month's own value to the cent", () => {
    renderGroup("Education");
    fireEvent.pointerMove(sparkline(), { clientX: 719 });
    const education = groupGolden("purpose", "Education");
    expect(tooltipText()).toContain(formatPeriodLabel(education.lastPeriod));
    expect(tooltipText()).toContain(formatCurrency(education.market));
    expect(tooltipText()).toContain("1 of 1 account reported this month");
  });

  test("arrowing from a gap lands on a stated month rather than the next empty one", () => {
    renderGroup("Education");
    const svg = sparkline();
    fireEvent.pointerMove(svg, { clientX: 360 });
    expect(tooltipText()).toMatch(/No statement/);
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(tooltipText()).toContain(
      formatPeriodLabel(groupGolden("purpose", "Education").firstPeriod),
    );
    expect(tooltipText()).toContain("$");
  });

  test("the accessible summary of a group chart follows the cursor too", () => {
    renderGroup("Education");
    fireEvent.keyDown(sparkline(), { key: "End" });
    const summary = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(summary).toContain(`Education market value ${summaryClauses("Education").range}`);
    expect(summary).toContain(
      `Market value ${formatCurrency(groupGolden("purpose", "Education").market)}`,
    );
  });

  test("the gap is spoken as well as printed, so an arrow onto it is not silence", () => {
    renderGroup("Education");
    fireEvent.pointerMove(sparkline(), { clientX: 360 });
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toMatch(/No statement for this month/);
    expect(region.textContent).not.toContain("$");
  });

  test("the empty-state card has no cursor to move, and no tooltip appears", () => {
    renderGroup("Spending");
    expect(document.querySelector("[data-chart-tooltip]")).toBeNull();
  });
});
