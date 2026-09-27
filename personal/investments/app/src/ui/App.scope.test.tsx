import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { monthReview, reviewPeriods } from "../analytics/monthReview";
import {
  buildPortfolioReturns,
  endingCumulative,
  returnsWithin,
} from "../analytics/portfolioReturns";
import { GOLDENS } from "../goldens";
import { App } from "./App";
import { loadAnalytics } from "./data";
import { formatCurrency, formatRate, formatSignedCurrency } from "./format";
import { inScope, yearChange } from "./scope";
import { clickTab } from "./testSupport/clickTab";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

/**
 * Radix renders a segmented item's label twice, so its accessible name is the
 * label doubled. Anchoring on the doubled form matches exactly one item, where
 * a bare substring would match "2026" inside nothing else but reads as luck.
 */
function exactly(label: string): RegExp {
  return new RegExp(`^(${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\1?$`);
}

/** Radix activates a segmented control item on click; the label is its accessible name. */
function selectYear(label: string) {
  fireEvent.click(screen.getByRole("radio", { name: exactly(label) }));
}

function total(): string {
  return document.querySelector("[data-portfolio-total]")?.textContent ?? "";
}

describe("the year filter", () => {
  test("defaults to all time, showing the whole corpus and no year change line", () => {
    render(<App />);
    clickTab("Portfolio");
    expect(screen.getByRole("radio", { name: exactly("All time") })).toBeDefined();
    expect(total()).toBe(formatCurrency(GOLDENS.portfolio.total));
    // A change line under "all time" would be a year's change with no year.
    expect(document.querySelector("[data-year-change]")).toBeNull();
  });

  test("offers exactly the years the corpus covers, never the calendar's", () => {
    render(<App />);
    // Radix renders a segmented item's label twice -- once visible, once
    // hidden at bold weight so the width never shifts on select -- which
    // doubles its text. Halving it reads the label rather than pinning that.
    const years = [...document.querySelectorAll("[data-year-filter] [role='radio']")].map((node) =>
      (node.textContent ?? "").slice(0, (node.textContent ?? "").length / 2),
    );
    expect(years).toEqual(["All time", "2023", "2024", "2025", "2026"]);
  });

  test("selecting a year moves the headline to that year's own ending value", () => {
    render(<App />);
    clickTab("Portfolio");
    selectYear("2025");
    const change = yearChange(loadAnalytics().series, 2025);
    if (change === null) throw new Error("expected a 2025 change");
    expect(total()).toBe(formatCurrency(change.end));
    expect(total()).not.toBe(formatCurrency(GOLDENS.portfolio.total));
  });

  test("the change line states the deposits inline, never a bare delta", () => {
    // The guardrail. 2026 grew by roughly $149,000 of which most was money
    // paid in; a bare "+$149,063" would be true and deeply misleading.
    render(<App />);
    clickTab("Portfolio");
    selectYear("2026");
    const change = yearChange(loadAnalytics().series, 2026);
    if (change === null) throw new Error("expected a 2026 change");
    const line = document.querySelector("[data-year-change]")?.textContent ?? "";
    expect(line).toContain(formatCurrency(Math.abs(change.netDeposits)));
    expect(line).toContain("paid in");
    // The growth figure is the netted one, not the raw rise.
    expect(line).toContain(formatCurrency(change.growth).replace("$", "$"));
    expect(line).not.toContain(formatCurrency(change.end - change.start));
  });

  test("the change line's percentage is the chained return, the same one the chart draws", () => {
    render(<App />);
    clickTab("Portfolio");
    selectYear("2026");
    const change = yearChange(loadAnalytics().series, 2026);
    if (change?.returnRate == null) throw new Error("expected a 2026 return");
    const line = document.querySelector("[data-year-change]")?.textContent ?? "";
    expect(line).toContain(formatRate(change.returnRate * 100));
    // NOT growth over the opening balance, which reads far higher.
    expect(line).not.toContain(formatRate((change.growth / change.start) * 100));
  });

  test("the year rides in the hash, so a scoped view is linkable", () => {
    render(<App />);
    clickTab("Portfolio");
    selectYear("2024");
    expect(window.location.hash).toBe("#portfolio/2024");
    selectYear("All time");
    expect(window.location.hash).toBe("#portfolio");
  });

  test("opening on a scoped hash renders that year without a click", () => {
    window.location.hash = "#portfolio/2024";
    render(<App />);
    const change = yearChange(loadAnalytics().series, 2024);
    expect(total()).toBe(formatCurrency(change?.end ?? -1));
  });
});

describe("the year filter reaches every tab that can honour it", () => {
  function panelText(): string {
    return [...document.querySelectorAll('[role="tabpanel"]')]
      .map((node) => node.textContent ?? "")
      .join(" ");
  }

  function openTab(label: string) {
    fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${label}\\b`) }), {
      button: 0,
    });
  }

  test("the registered room and tax views follow it, with no second year control of their own", () => {
    render(<App />);
    selectYear("2024");
    openTab("Contributions");
    // Specific to the content each view renders for 2024, not merely that
    // "2024" appears somewhere on the panel -- the year filter itself now
    // renders inside every panel and its own "2024" radio label would match
    // a substring check regardless of whether the views underneath it moved.
    expect(screen.getByRole("heading", { name: "Registered contributions, 2024" })).toBeDefined();
    expect(screen.queryByRole("radiogroup", { name: "Tax year" })).toBeNull();

    openTab("Portfolio");
    expect(screen.getByRole("heading", { name: "Investment income, 2024" })).toBeDefined();
  });

  test("This month limits its picker to the year scope, defaulting to that year's latest month", async () => {
    window.location.hash = "#month/2024";
    render(<App />);
    const analytics = loadAnalytics();
    const periods2024 = reviewPeriods(analytics).filter((p) => p.startsWith("2024-"));
    const latest2024 = periods2024[0];
    if (latest2024 === undefined) throw new Error("expected at least one 2024 period");
    const review = monthReview(analytics, latest2024);
    const change = review.start === null ? review.end : review.end - review.start;
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      formatSignedCurrency(change),
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("December 2024");

    // Radix's Select positions its listbox on a short timer after the
    // click, later than a single microtask flush.
    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Month" }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toHaveLength(periods2024.length);
    for (const option of options) expect(option).toContain("2024");
  });

  test("the reconciliation view filters its findings and says how many it hid", () => {
    // A data-quality tab that quietly drops problems is a trap, so the count
    // of what the filter is hiding is stated rather than left to be noticed.
    render(<App />);
    selectYear("2024");
    openTab("Data");
    const hidden = document.querySelector("[data-recon-hidden]")?.textContent ?? "";
    expect(hidden).toMatch(/hidden by the year filter/);

    const shown = document.querySelectorAll("[data-finding-row]").length;
    expect(shown).toBeLessThan(GOLDENS.reconciliation.findingCount);
  });

  test("the cards view says the year has no statement rather than that none exist", () => {
    render(<App />);
    selectYear("2024");
    openTab("Data");
    expect(panelText()).toContain("No credit card statement for 2024");
    expect(panelText()).not.toContain("No credit card statements imported yet");
  });

  test("the projection ignores it and says so, rather than re-basing itself silently", () => {
    render(<App />);
    openTab("Plan");
    const unscoped = document.querySelector("[data-projection-end-value]")?.textContent;
    expect(document.querySelector("[data-projection-scope-note]")).toBeNull();

    selectYear("2024");
    openTab("Plan");
    expect(document.querySelector("[data-projection-scope-note]")?.textContent).toMatch(
      /year filter does not apply/i,
    );
    // The forecast itself is unmoved: a re-based projection would look just as
    // authoritative with nothing saying its starting point had changed.
    expect(document.querySelector("[data-projection-end-value]")?.textContent).toBe(unscoped);
  });
});

describe("the chart switcher", () => {
  test("defaults to the value chart and switches to the return chart", () => {
    render(<App />);
    clickTab("Portfolio");
    expect(document.querySelector("[data-return-chart]")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: exactly("Return") }));
    expect(document.querySelector("[data-return-chart]")).not.toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: exactly("Value") }));
    expect(document.querySelector("[data-return-chart]")).toBeNull();
  });

  test("the return chart states a deposit-netted figure and says so", () => {
    render(<App />);
    clickTab("Portfolio");
    fireEvent.click(screen.getByRole("radio", { name: exactly("Return") }));
    const label = document.querySelector("[data-return-chart]")?.getAttribute("aria-label") ?? "";
    const ending = endingCumulative(buildPortfolioReturns(loadAnalytics().series));
    expect(label).toContain(formatRate((ending ?? 0) * 100));
    expect(label).toMatch(/net of deposits/i);
  });

  test("under a year, the return chart re-bases to that year and keeps its first month", () => {
    render(<App />);
    clickTab("Portfolio");
    selectYear("2026");
    fireEvent.click(screen.getByRole("radio", { name: exactly("Return") }));

    const label = document.querySelector("[data-return-chart]")?.getAttribute("aria-label") ?? "";
    const window2026 = returnsWithin(buildPortfolioReturns(loadAnalytics().series), (p) =>
      inScope(p, 2026),
    );
    expect(label).toContain(formatRate((endingCumulative(window2026) ?? 0) * 100));
    // January is present. Clipping before computing would drop it, leaving
    // "2026's return" silently meaning February onward.
    expect(label).toContain("Jan 2026");
  });

  test("the chart and the year change line agree on the year's return, to the digit", () => {
    // Two figures for one year is one too many. This is the pair that had to
    // be made one: the line read 22.61% while the chart read 10.50%.
    render(<App />);
    clickTab("Portfolio");
    selectYear("2026");
    const line = document.querySelector("[data-year-change]")?.textContent ?? "";
    fireEvent.click(screen.getByRole("radio", { name: exactly("Return") }));
    const label = document.querySelector("[data-return-chart]")?.getAttribute("aria-label") ?? "";

    const stated = /\(([+-]?\d+\.\d\d%)\)/.exec(line)?.[1]?.replace("+", "");
    expect(stated).toBeDefined();
    expect(label).toContain(stated ?? "no figure");
  });
});
