import { describe, expect, test } from "bun:test";
import type { Scope } from "./filter";
import { estimateTax, totalContributed, totalDeposits, totalIncome } from "./sections";
import type { SectionsLedger } from "./sections";

function seriesRow(
  overrides: Partial<SectionsLedger["series"][number]>,
): SectionsLedger["series"][number] {
  return {
    account_id: "A",
    month: "2024-01",
    contrib: 0,
    external_in: 0,
    external_out: 0,
    deposits: 0,
    income: 0,
    inflow: 0,
    outflow: 0,
    cash: 0,
    acb: 0,
    interest: 0,
    eligible_dividends: 0,
    foreign_income: 0,
    realized_gain: 0,
    ...overrides,
  };
}

function ledger(): SectionsLedger {
  return {
    accounts: [{ id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" }],
    months: ["2024-01", "2024-02", "2024-03"],
    series: [
      seriesRow({
        month: "2024-01",
        contrib: 100,
        deposits: 100,
        income: 5,
        inflow: 100,
        acb: 100,
      }),
      seriesRow({ month: "2024-02", contrib: 50, deposits: 50, income: 3, inflow: 50, acb: 150 }),
      seriesRow({ month: "2024-03", contrib: 25, deposits: 25, income: 2, inflow: 25, acb: 175 }),
    ],
    holdings: [],
    limits: {},
    flows: [],
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

describe("totalDeposits", () => {
  test("sums deposits within the scoped time window only", () => {
    const scope: Scope = { ris: [0, 1], accts: ["A"] };
    expect(totalDeposits(ledger(), scope)).toBe(150);
  });

  test("sums the full window when all months are selected", () => {
    const scope: Scope = { ris: [0, 1, 2], accts: ["A"] };
    expect(totalDeposits(ledger(), scope)).toBe(175);
  });

  test("returns 0 when no accounts are selected", () => {
    const scope: Scope = { ris: [0, 1, 2], accts: [] };
    expect(totalDeposits(ledger(), scope)).toBe(0);
  });

  test("returns 0 when no months are selected", () => {
    const scope: Scope = { ris: [], accts: ["A"] };
    expect(totalDeposits(ledger(), scope)).toBe(0);
  });

  test("sums deposits, not contrib, when the two fields diverge (transfers vs coded contributions)", () => {
    const withTransfers = ledger();
    const [first, ...rest] = withTransfers.series;
    if (!first) throw new Error("test fixture missing first series row");
    // Row 0: only 100 of contrib, but 400 total deposits via TRANSFER_IN.
    withTransfers.series = [{ ...first, contrib: 100, deposits: 400 }, ...rest];
    const scope: Scope = { ris: [0], accts: ["A"] };
    expect(totalDeposits(withTransfers, scope)).toBe(400);
    expect(totalContributed(withTransfers, scope)).toBe(100);
  });
});

describe("totalIncome", () => {
  test("sums income within the scoped time window only", () => {
    const scope: Scope = { ris: [0, 1], accts: ["A"] };
    expect(totalIncome(ledger(), scope)).toBe(8);
  });

  test("sums the full window when all months are selected", () => {
    const scope: Scope = { ris: [0, 1, 2], accts: ["A"] };
    expect(totalIncome(ledger(), scope)).toBe(10);
  });

  test("returns 0 when no accounts are selected", () => {
    const scope: Scope = { ris: [0, 1, 2], accts: [] };
    expect(totalIncome(ledger(), scope)).toBe(0);
  });

  test("returns 0 when no months are selected", () => {
    const scope: Scope = { ris: [], accts: ["A"] };
    expect(totalIncome(ledger(), scope)).toBe(0);
  });
});

describe("estimateTax", () => {
  test("matches the documented formula", () => {
    const inputs = {
      interest: 100,
      eligibleDividends: 200,
      foreignIncome: 50,
      realizedGains: 1000,
      rrspContributed: 300,
      rate: 0.48,
    };
    // 100*0.48 = 48
    // 200*1.38*0.48*0.85 = 112.608
    // 50*0.48 = 24
    // 1000*0.5*0.48 = 240
    // -300*0.48 = -144
    // total = 48 + 112.608 + 24 + 240 - 144 = 280.608
    const expected =
      100 * 0.48 + 200 * 1.38 * 0.48 * 0.85 + 50 * 0.48 + 1000 * 0.5 * 0.48 - 300 * 0.48;
    expect(estimateTax(inputs)).toBeCloseTo(expected, 6);
    expect(estimateTax(inputs)).toBeCloseTo(280.608, 6);
  });

  test("all zero inputs produce a zero estimate", () => {
    expect(
      estimateTax({
        interest: 0,
        eligibleDividends: 0,
        foreignIncome: 0,
        realizedGains: 0,
        rrspContributed: 0,
        rate: 0.48,
      }),
    ).toBe(0);
  });

  test("RRSP contributed this year reduces the estimate but a modest contribution should not force it negative", () => {
    // Income (100+200*1.38*0.85+50)*0.48 = (100+234.6+50)*0.48 = 384.6*0.48 = 184.608
    // 300 contributed * 0.48 = 144, so estimate stays positive at 40.608.
    const estimate = estimateTax({
      interest: 100,
      eligibleDividends: 200,
      foreignIncome: 50,
      realizedGains: 0,
      rrspContributed: 300,
      rate: 0.48,
    });
    expect(estimate).toBeCloseTo(40.608, 6);
    expect(estimate).toBeGreaterThan(0);
  });
});
