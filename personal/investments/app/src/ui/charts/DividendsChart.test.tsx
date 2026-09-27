import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MonthlyActivity } from "../../analytics/incomeCosts";
import { formatCurrency } from "../format";
import { DividendsChart } from "./DividendsChart";

afterEach(cleanup);

const ZERO = {
  dividends: 0,
  interest: 0,
  lendingIncome: 0,
  withholdingTax: 0,
  fees: 0,
  fxConversions: 0,
  fxConversionAmount: 0,
};

function months(
  entries: { period: string; dividends: number; interest?: number; lendingIncome?: number }[],
): MonthlyActivity[] {
  return entries.map((e) => ({
    period: e.period,
    totals: {
      ...ZERO,
      dividends: e.dividends,
      interest: e.interest ?? 0,
      lendingIncome: e.lendingIncome ?? 0,
    },
  }));
}

function chart(): HTMLElement {
  return screen.getByRole("img");
}

function bars(): Element[] {
  return [...document.querySelectorAll("[data-dividend-bar]")];
}

describe("DividendsChart", () => {
  test("no statement in the year renders the empty state, not an empty chart", () => {
    render(<DividendsChart year={2026} months={[]} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/no statement covers 2026/i)).toBeDefined();
  });

  test("one bar per stated month", () => {
    render(
      <DividendsChart
        year={2026}
        months={months([
          { period: "2026-01", dividends: 10 },
          { period: "2026-02", dividends: 0 },
          { period: "2026-03", dividends: 25.5 },
        ])}
      />,
    );
    expect(bars()).toHaveLength(3);
  });

  test("the accessible summary names the year and the total", () => {
    render(
      <DividendsChart
        year={2025}
        months={months([
          { period: "2025-01", dividends: 10 },
          { period: "2025-02", dividends: 5.5 },
        ])}
      />,
    );
    const label = chart().getAttribute("aria-label") ?? "";
    expect(label).toContain("2025");
    expect(label).toContain(formatCurrency(15.5));
  });

  test("hovering a bar's month announces its dividend figure", () => {
    render(
      <DividendsChart
        year={2026}
        months={months([
          { period: "2026-01", dividends: 12.34 },
          { period: "2026-02", dividends: 56.78 },
        ])}
      />,
    );
    const svg = chart();
    fireEvent.keyDown(svg, { key: "Home" });
    expect(document.querySelector("[data-cursor-announcement]")?.textContent).toContain(
      formatCurrency(12.34),
    );
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(document.querySelector("[data-cursor-announcement]")?.textContent).toContain(
      formatCurrency(56.78),
    );
  });

  test("hovering a month also announces its interest and securities lending", () => {
    render(
      <DividendsChart
        year={2026}
        months={months([{ period: "2026-01", dividends: 10, interest: 4.5, lendingIncome: 0.75 }])}
      />,
    );
    fireEvent.keyDown(chart(), { key: "Home" });
    const announced = document.querySelector("[data-cursor-announcement]")?.textContent ?? "";
    expect(announced).toContain(formatCurrency(4.5));
    expect(announced).toContain(formatCurrency(0.75));
  });

  test("a missing month in the middle of the year draws no bar there, not a zero one", () => {
    render(
      <DividendsChart
        year={2026}
        months={months([
          { period: "2026-01", dividends: 10 },
          // 2026-02 has no entry at all: no statement covers it.
          { period: "2026-03", dividends: 5 },
        ])}
      />,
    );
    const drawnPeriods = bars().map((b) => b.getAttribute("data-period"));
    expect(drawnPeriods).toEqual(["2026-01", "2026-03"]);
    expect(drawnPeriods).not.toContain("2026-02");
  });
});
