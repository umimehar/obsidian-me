import { describe, expect, test } from "bun:test";
import type { Scope } from "./filter";
import { estimateTax, sumGrowth, totalContributed } from "./sections";
import type { SectionsLedger } from "./sections";
import type { GrowthRow } from "./series";

function ledger(): SectionsLedger {
  return {
    accounts: [{ id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" }],
    months: ["2024-01", "2024-02", "2024-03"],
    series: [
      {
        account_id: "A",
        month: "2024-01",
        contrib: 100,
        deposits: 100,
        income: 0,
        inflow: 100,
        outflow: 0,
        cash: 0,
        acb: 100,
      },
      {
        account_id: "A",
        month: "2024-02",
        contrib: 50,
        deposits: 50,
        income: 0,
        inflow: 50,
        outflow: 0,
        cash: 0,
        acb: 150,
      },
      {
        account_id: "A",
        month: "2024-03",
        contrib: 25,
        deposits: 25,
        income: 0,
        inflow: 25,
        outflow: 0,
        cash: 0,
        acb: 175,
      },
    ],
    holdings: [],
    growth: {
      as_of: null,
      coverage: 0,
      accounts: [],
      total: { cost: 0, market: 0, gain: 0, gainPct: 0 },
    },
    tax: { current_year: "2024", years: [] },
  };
}

describe("totalContributed", () => {
  test("sums contrib within the scoped time window only", () => {
    const scope: Scope = { ris: [0, 1], accts: ["A"] };
    expect(totalContributed(ledger(), scope)).toBe(150);
  });

  test("sums the full window when all months are selected", () => {
    const scope: Scope = { ris: [0, 1, 2], accts: ["A"] };
    expect(totalContributed(ledger(), scope)).toBe(175);
  });

  test("returns 0 when no accounts are selected", () => {
    const scope: Scope = { ris: [0, 1, 2], accts: [] };
    expect(totalContributed(ledger(), scope)).toBe(0);
  });

  test("returns 0 when no months are selected", () => {
    const scope: Scope = { ris: [], accts: ["A"] };
    expect(totalContributed(ledger(), scope)).toBe(0);
  });
});

describe("sumGrowth", () => {
  function row(overrides: Partial<GrowthRow>): GrowthRow {
    return {
      account_id: "A",
      name: "A",
      kind: "TFSA",
      short_id: "aaaa",
      cost: 0,
      market: 0,
      gain: 0,
      gainPct: 0,
      ...overrides,
    };
  }

  test("sums cost and market across rows and derives gain / gainPct", () => {
    const rows = [row({ cost: 100, market: 120 }), row({ cost: 50, market: 40 })];
    expect(sumGrowth(rows)).toEqual({ cost: 150, market: 160, gain: 10, gainPct: 10 / 150 });
  });

  test("gainPct is 0 when cost is 0 (no divide by zero)", () => {
    expect(sumGrowth([])).toEqual({ cost: 0, market: 0, gain: 0, gainPct: 0 });
  });
});

describe("estimateTax", () => {
  test("matches the documented formula", () => {
    const inputs = {
      interest: 100,
      eligibleDividends: 200,
      foreignIncome: 50,
      realizedGains: 1000,
      rrspDeductionAvailable: 300,
      rate: 0.48,
    };
    const expected =
      100 * 0.48 + 200 * 1.38 * 0.48 * 0.85 + 50 * 0.48 + 1000 * 0.5 * 0.48 - 300 * 0.48;
    expect(estimateTax(inputs)).toBeCloseTo(expected, 6);
  });

  test("all zero inputs produce a zero estimate", () => {
    expect(
      estimateTax({
        interest: 0,
        eligibleDividends: 0,
        foreignIncome: 0,
        realizedGains: 0,
        rrspDeductionAvailable: 0,
        rate: 0.48,
      }),
    ).toBe(0);
  });

  test("RRSP deduction can push the estimate negative", () => {
    const estimate = estimateTax({
      interest: 0,
      eligibleDividends: 0,
      foreignIncome: 0,
      realizedGains: 0,
      rrspDeductionAvailable: 1000,
      rate: 0.48,
    });
    expect(estimate).toBeLessThan(0);
  });
});
