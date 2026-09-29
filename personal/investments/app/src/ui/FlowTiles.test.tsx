import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render } from "@testing-library/react";
import type { FlowSummary } from "../analytics/flows/summary";
import { FlowTiles } from "./FlowTiles";
import { formatCurrency, formatShare } from "./format";
import { expectNoCoarseForm } from "./testSupport/coarseForm";

function summary(overrides: Partial<FlowSummary> = {}): FlowSummary {
  return {
    paidIn: 134880.63,
    paidInBySource: { payroll: 46464.63, outsideBank: 20816, interacIn: 12600, business: 55000 },
    contributionsByKind: { TFSA: 7000.42, RESP: 4000.01 },
    grants: 600,
    income: 2035.255242999998,
    invested: 144508.81501500006,
    cashEquivalentNet: 0,
    cashChange: -18285.692294000008,
    leftInCash: -18285.692294000008,
    costs: 321.3459540000001,
    left: 10885.85,
    investedRate: 1.0493256806214761,
    unpairedLegs: 0,
    laggedPairs: 0,
    residual: 0,
    unlistedSymbols: [],
    ...overrides,
  };
}

function tile(label: string): HTMLElement {
  const node = document.querySelector(`[data-flow-tile="${label}"]`);
  if (node === null) throw new Error(`expected a ${label} tile to render`);
  return node as HTMLElement;
}

afterEach(cleanup);

function renderTiles(s: FlowSummary) {
  render(
    <Theme>
      <FlowTiles summary={s} />
    </Theme>,
  );
}

describe("FlowTiles", () => {
  test("every tile's visible text is exactly one formatCurrency/formatShare call", () => {
    const s = summary();
    renderTiles(s);
    expect(tile("Paid in from outside").textContent).toContain(formatCurrency(s.paidIn));
    expect(tile("Invested").textContent).toContain(formatCurrency(s.invested));
    expect(tile("Left in cash").textContent).toContain(formatCurrency(s.leftInCash));
    expect(tile("Income earned").textContent).toContain(formatCurrency(s.income));
    expect(tile("Costs").textContent).toContain(formatCurrency(s.costs));
    expect(tile("Invested rate").textContent).toContain(formatShare(s.investedRate as number));
  });

  test("every tile's aria-label states the same figure as its visible text", () => {
    const s = summary();
    renderTiles(s);
    const cases: readonly [string, string][] = [
      ["Paid in from outside", formatCurrency(s.paidIn)],
      ["Invested", formatCurrency(s.invested)],
      ["Left in cash", formatCurrency(s.leftInCash)],
      ["Income earned", formatCurrency(s.income)],
      ["Costs", formatCurrency(s.costs)],
    ];
    for (const [label, value] of cases) {
      expect(tile(label).getAttribute("aria-label")).toBe(`${label} ${value}`);
      expect(tile(label).textContent).toContain(value);
    }
  });

  test("a null invested rate reads as 'Not enough money in', not a figure", () => {
    renderTiles(summary({ investedRate: null }));
    expect(tile("Invested rate").textContent).toContain("Not enough money in");
    expect(tile("Invested rate").getAttribute("aria-label")).toBe(
      "Invested rate Not enough money in",
    );
  });

  test("no tile's text or aria-label ever states a coarser figure than its own", () => {
    const s = summary();
    renderTiles(s);
    for (const [label, amount] of [
      ["Paid in from outside", s.paidIn],
      ["Invested", s.invested],
      ["Left in cash", s.leftInCash],
      ["Income earned", s.income],
      ["Costs", s.costs],
    ] as const) {
      expectNoCoarseForm(tile(label).textContent ?? "", amount);
      expectNoCoarseForm(tile(label).getAttribute("aria-label") ?? "", amount);
    }
  });

  test("contributions by account type render beneath the paid-in tile, one kind and figure per line", () => {
    renderTiles(summary());
    const line = document.querySelector("[data-flow-contributions]");
    const terms = [...(line?.querySelectorAll("dt") ?? [])].map((n) => n.textContent);
    const figures = [...(line?.querySelectorAll("dd") ?? [])].map((n) => n.textContent);
    expect(terms).toEqual(["TFSA", "RESP"]);
    expect(figures).toEqual([formatCurrency(7000.42), formatCurrency(4000.01)]);

    cleanup();
    renderTiles(summary({ contributionsByKind: {} }));
    expect(document.querySelector("[data-flow-contributions]")).toBeNull();
  });

  test("the payroll/spending caveat sentence is always present", () => {
    renderTiles(summary());
    expect(document.body.textContent).toContain(
      "Payroll deposited here is only the part that reached Wealthsimple.",
    );
  });
});
