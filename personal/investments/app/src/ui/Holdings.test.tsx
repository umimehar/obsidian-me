import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import { GOLDENS } from "../goldens";
import { Holdings } from "./Holdings";
import { loadAnalytics } from "./data";
import { formatCurrency, formatShare } from "./format";

afterEach(cleanup);

const REAL = loadAnalytics();

function renderReal(scope: number | "all" = "all") {
  render(
    <Theme>
      <Holdings holdings={REAL.holdings} portfolioTotal={GOLDENS.portfolio.total} scope={scope} />
    </Theme>,
  );
}

describe("Holdings, over the real corpus", () => {
  test("the total renders", () => {
    renderReal();
    expect(
      screen.getByText(new RegExp(formatCurrency(REAL.holdings.total).replace(/[$.]/g, "\\$&"))),
    ).toBeDefined();
  });

  test("the top holdings table has one row per top-15 holding", () => {
    renderReal();
    const rows = [...document.querySelectorAll('[data-holdings-table="top"] [data-holding-row]')];
    expect(rows.length).toBe(Math.min(15, REAL.holdings.holdings.length));
  });

  test("a holding beyond the top 15 sits behind Show all", () => {
    renderReal();
    if (REAL.holdings.holdings.length <= 15) return;
    const disclosure = document.querySelector("[data-holdings-show-all]");
    expect(disclosure).not.toBeNull();
    const beyond = REAL.holdings.holdings[15];
    expect(beyond).toBeDefined();
    expect(disclosure?.textContent).toContain(beyond?.name ?? "");
  });

  test("the S&P 500 group line states its value and share", () => {
    renderReal();
    const group = REAL.holdings.groups.find((g) => g.label === "S&P 500");
    if (group === undefined) return;
    const node = document.querySelector('[data-index-group="S&P 500"]');
    expect(node?.textContent).toContain(formatCurrency(group.value));
    expect(node?.textContent).toContain(formatShare(group.share));
  });

  test("the year filter note appears only when a year is selected", () => {
    renderReal("all");
    expect(document.querySelector("[data-holdings-scope-note]")).toBeNull();
    cleanup();
    renderReal(2025);
    expect(document.querySelector("[data-holdings-scope-note]")).not.toBeNull();
  });

  test("currency split states both figures", () => {
    renderReal();
    const node = document.querySelector("[data-currency-split]");
    expect(node?.textContent).toContain(formatCurrency(REAL.holdings.currency.CAD));
    expect(node?.textContent).toContain(formatCurrency(REAL.holdings.currency.USD));
  });

  test("asset classes list every class the model reports", () => {
    renderReal();
    for (const c of REAL.holdings.assetClasses) {
      expect(document.querySelector(`[data-asset-class="${c.name}"]`)).not.toBeNull();
    }
  });

  test("a residual against the portfolio total is stated, not hidden", () => {
    renderReal();
    const residual = GOLDENS.portfolio.total - REAL.holdings.total;
    const note = document.querySelector("[data-holdings-residual]");
    if (Math.abs(residual) < 0.01) {
      expect(note).toBeNull();
    } else {
      expect(note).not.toBeNull();
    }
  });
});
