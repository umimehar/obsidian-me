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

  test("a holding beyond the top 15 sits behind a disclosure naming how many more there are", () => {
    expect(REAL.holdings.holdings.length).toBeGreaterThan(15);
    renderReal();
    const disclosure = document.querySelector("[data-holdings-show-all]");
    expect(disclosure).not.toBeNull();
    const rest = REAL.holdings.holdings.length - 15;
    expect(disclosure?.querySelector("summary")?.textContent).toBe(
      `Show the other ${rest} holdings`,
    );
    const beyond = REAL.holdings.holdings[15];
    expect(beyond).toBeDefined();
    expect(disclosure?.textContent).toContain(beyond?.name ?? "");
  });

  test("the S&P 500 group line states its value, share and account count", () => {
    const group = REAL.holdings.groups.find((g) => g.label === "S&P 500");
    expect(group).toBeDefined();
    if (group === undefined) throw new Error("expected an S&P 500 group");
    renderReal();
    const node = document.querySelector('[data-index-group="S&P 500"]');
    expect(node?.textContent).toContain(formatCurrency(group.value));
    expect(node?.textContent).toContain(formatShare(group.share));
    expect(node?.textContent).toContain(`${group.accounts.length}`);
  });

  test("L, held under two different currencies, renders as two distinct rows with their own names", () => {
    const lEntries = REAL.holdings.holdings.filter((h) => h.symbol === "L");
    expect(lEntries.length).toBe(2);
    renderReal();
    const names = new Set(lEntries.map((h) => h.name));
    expect(names.size).toBe(2);
    for (const entry of lEntries) {
      const row = document.querySelector(`[data-holding-row="L:${entry.priceCurrency}"]`);
      expect(row?.textContent).toContain(entry.name);
      expect(row?.textContent).toContain(entry.priceCurrency);
    }
  });

  test("no account label in the top table looks like a masked account id", () => {
    renderReal();
    const rows = [...document.querySelectorAll('[data-holdings-table="top"] [data-holding-row]')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.textContent ?? "").not.toMatch(/acct_[0-9a-f]{8}/);
    }
  });

  test("a holding's full account list renders, not a truncated one", () => {
    const widest = [...REAL.holdings.holdings].sort(
      (a, b) => b.accounts.length - a.accounts.length,
    )[0];
    expect(widest).toBeDefined();
    if (widest === undefined) throw new Error("expected at least one holding");
    renderReal();
    const row =
      document.querySelector(
        `[data-holdings-table="top"] [data-holding-row="${widest.symbol}:${widest.priceCurrency}"]`,
      ) ?? document.querySelector("[data-holdings-show-all]");
    for (const account of widest.accounts) {
      expect(row?.textContent).toContain(account);
    }
  });

  test("holdings render in descending value order, not ascending", () => {
    renderReal();
    const rows = [...document.querySelectorAll('[data-holdings-table="top"] [data-holding-row]')];
    const values = rows.map((row) => {
      const text = row.querySelector("td:nth-child(3)")?.textContent ?? "";
      return Number(text.replace(/[^0-9.-]/g, ""));
    });
    for (let i = 1; i < values.length; i++) {
      const previous = values[i - 1];
      const current = values[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous !== undefined && current !== undefined)
        expect(previous).toBeGreaterThanOrEqual(current);
    }
  });

  test("WSE401's pending valuation is badged on the page", () => {
    const wse = REAL.holdings.holdings.find((h) => h.symbol === "WSE401");
    expect(wse?.pendingValuation).toBe(true);
    renderReal();
    const row = document.querySelector(`[data-holding-row="WSE401:${wse?.priceCurrency}"]`);
    expect(row?.querySelector("[data-pending-valuation]")).not.toBeNull();
    expect(row?.textContent).toContain("Valuation pending");
  });

  test("the year filter note appears only when a year is selected", () => {
    renderReal("all");
    expect(document.querySelector("[data-holdings-scope-note]")).toBeNull();
    cleanup();
    renderReal(2025);
    expect(document.querySelector("[data-holdings-scope-note]")).not.toBeNull();
  });

  test("currency split states both figures, not everything booked to one currency", () => {
    renderReal();
    const node = document.querySelector("[data-currency-split]");
    expect(node?.textContent).toContain(formatCurrency(REAL.holdings.currency.CAD));
    expect(node?.textContent).toContain(formatCurrency(REAL.holdings.currency.USD));
    expect(REAL.holdings.currency.USD).toBeGreaterThan(0);
  });

  test("asset classes list every class the model reports", () => {
    renderReal();
    for (const c of REAL.holdings.assetClasses) {
      expect(document.querySelector(`[data-asset-class="${c.name}"]`)).not.toBeNull();
    }
  });

  test("a residual is stated with the sign that matches the model, using the golden threshold", () => {
    renderReal();
    const residual = GOLDENS.portfolio.total - REAL.holdings.total;
    const shortNote = document.querySelector('[data-holdings-residual="short"]');
    const overNote = document.querySelector('[data-holdings-residual="over"]');
    if (residual > 0.01) {
      expect(shortNote).not.toBeNull();
      expect(overNote).toBeNull();
    } else if (residual < -0.01) {
      expect(overNote).not.toBeNull();
      expect(shortNote).toBeNull();
    } else {
      expect(shortNote).toBeNull();
      expect(overNote).toBeNull();
    }
  });

  test("an account behind on its statement is named, not silently dropped", () => {
    renderReal();
    const note = document.querySelector("[data-holdings-behind]");
    if (REAL.holdings.behind.length === 0) {
      expect(note).toBeNull();
    } else {
      expect(note).not.toBeNull();
      for (const label of REAL.holdings.behind) expect(note?.textContent).toContain(label);
    }
  });
});
