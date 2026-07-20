import { describe, expect, test } from "bun:test";
import type { Scope } from "./filter";
import type { SeriesGrowth, SeriesLedger, SeriesRow } from "./series";
import { capitalTrend, cashflowSeries, growthByAccount, incomeSeries } from "./series";

function emptyGrowth(): SeriesGrowth {
  return {
    as_of: null,
    coverage: 0,
    accounts: [],
    total: { cost: 0, market: 0, gain: 0, gainPct: 0 },
  };
}

function row(overrides: Partial<SeriesRow>): SeriesRow {
  return {
    account_id: "A",
    month: "2024-01",
    contrib: 0,
    deposits: 0,
    income: 0,
    inflow: 0,
    outflow: 0,
    cash: null,
    acb: null,
    ...overrides,
  };
}

function ledger(overrides: Partial<SeriesLedger>): SeriesLedger {
  return {
    accounts: [{ id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" }],
    months: ["2024-01", "2024-02", "2024-03"],
    series: [],
    holdings: [],
    growth: emptyGrowth(),
    ...overrides,
  };
}

const ALL: Scope = { ris: [0, 1, 2], accts: ["A"] };

describe("capitalTrend", () => {
  test("acb/cash are read as-of window end and forward-filled across gaps", () => {
    const L = ledger({
      series: [
        row({ month: "2024-01", contrib: 100, acb: 500, cash: 50 }),
        // 2024-02 has no series row at all -> both acb and cash carry forward.
        row({ month: "2024-03", contrib: 100, acb: 700 }), // cash still forward-filled from Jan.
      ],
    });
    const out = capitalTrend(L, ALL);
    expect(out.labels).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(out.capital).toEqual([550, 550, 750]);
  });

  test("contributions are cumulative to-date, not window-summed", () => {
    const L = ledger({
      series: [
        row({ month: "2024-01", contrib: 100 }),
        row({ month: "2024-02", contrib: 50 }),
        row({ month: "2024-03", contrib: 25 }),
      ],
    });
    // Window starts at index 1, but the running total still reflects month 0's
    // contribution — this is a to-date running total, not a window sum.
    const scope: Scope = { ris: [1, 2], accts: ["A"] };
    const out = capitalTrend(L, scope);
    expect(out.labels).toEqual(["2024-02", "2024-03"]);
    expect(out.contributions).toEqual([150, 175]);
  });

  test("empty account scope yields zeroed series, not a crash", () => {
    const L = ledger({ series: [row({ month: "2024-01", contrib: 100, acb: 500 })] });
    const out = capitalTrend(L, { ris: [0, 1, 2], accts: [] });
    expect(out.labels).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(out.capital).toEqual([0, 0, 0]);
    expect(out.contributions).toEqual([0, 0, 0]);
  });

  test("empty month window yields empty arrays", () => {
    const L = ledger({ series: [row({ month: "2024-01", contrib: 100, acb: 500 })] });
    const out = capitalTrend(L, { ris: [], accts: ["A"] });
    expect(out).toEqual({ labels: [], capital: [], contributions: [] });
  });

  test("switches to year grain past 24 months and buckets to period end", () => {
    const months = Array.from({ length: 30 }, (_, i) => {
      const year = 2023 + Math.floor(i / 12);
      const month = String((i % 12) + 1).padStart(2, "0");
      return `${year}-${month}`;
    });
    const series: SeriesRow[] = months.map((m, i) =>
      row({ month: m, contrib: 10, acb: (i + 1) * 10 }),
    );
    const L = ledger({ months, series });
    const scope: Scope = { ris: months.map((_, i) => i), accts: ["A"] };
    const out = capitalTrend(L, scope);
    expect(out.labels).toEqual(["2023", "2024", "2025"]);
    // bucketLast keeps the last (December, or final available) reading per year.
    expect(out.capital).toEqual([120, 240, 300]);
  });
});

describe("incomeSeries / cashflowSeries (window-sum, not to-date)", () => {
  test("income sums only within the resolved window", () => {
    const L = ledger({
      series: [
        row({ month: "2024-01", income: 10 }),
        row({ month: "2024-02", income: 20 }),
        row({ month: "2024-03", income: 30 }),
      ],
    });
    const scope: Scope = { ris: [1, 2], accts: ["A"] }; // excludes Jan
    const out = incomeSeries(L, scope);
    expect(out.labels).toEqual(["2024-02", "2024-03"]);
    expect(out.values).toEqual([20, 30]);
  });

  test("cashflow reports inflow, outflow, and net per period", () => {
    const L = ledger({
      series: [
        row({ month: "2024-01", inflow: 100, outflow: -40 }),
        row({ month: "2024-02", inflow: 50, outflow: -10 }),
      ],
    });
    const out = cashflowSeries(L, { ris: [0, 1], accts: ["A"] });
    expect(out.inflow).toEqual([100, 50]);
    expect(out.outflow).toEqual([-40, -10]);
    expect(out.net).toEqual([60, 40]);
  });

  test("multiple accounts within the window are summed together", () => {
    const L = ledger({
      accounts: [
        { id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" },
        { id: "B", kind: "RRSP", name: "RRSP B", short_id: "bbbb", currency: "CAD" },
      ],
      series: [
        row({ account_id: "A", month: "2024-01", income: 10 }),
        row({ account_id: "B", month: "2024-01", income: 5 }),
      ],
    });
    const out = incomeSeries(L, { ris: [0], accts: ["A", "B"] });
    expect(out.values).toEqual([15]);
  });

  test("empty account scope yields zeroed values", () => {
    const L = ledger({ series: [row({ month: "2024-01", income: 10 })] });
    const out = incomeSeries(L, { ris: [0], accts: [] });
    expect(out.values).toEqual([0]);
  });
});

describe("growthByAccount", () => {
  test("joins growth rows to account name/kind and filters to scope", () => {
    const L = ledger({
      accounts: [
        { id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" },
        { id: "B", kind: "RRSP", name: "RRSP B", short_id: "bbbb", currency: "CAD" },
      ],
      growth: {
        as_of: "2024-03-01",
        coverage: 1,
        accounts: [
          { account_id: "A", cost: 1000, market: 1100, gain: 100, gainPct: 0.1 },
          { account_id: "B", cost: 500, market: 480, gain: -20, gainPct: -0.04 },
        ],
        total: { cost: 1500, market: 1580, gain: 80, gainPct: 0.053 },
      },
    });
    const out = growthByAccount(L, { ris: [], accts: ["A"] });
    expect(out).toEqual([
      {
        account_id: "A",
        name: "TFSA A",
        kind: "TFSA",
        short_id: "aaaa",
        cost: 1000,
        market: 1100,
        gain: 100,
        gainPct: 0.1,
      },
    ]);
  });

  test("empty account scope yields no rows", () => {
    const L = ledger({
      growth: {
        as_of: "2024-03-01",
        coverage: 1,
        accounts: [{ account_id: "A", cost: 1000, market: 1100, gain: 100, gainPct: 0.1 }],
        total: { cost: 1000, market: 1100, gain: 100, gainPct: 0.1 },
      },
    });
    expect(growthByAccount(L, { ris: [], accts: [] })).toEqual([]);
  });
});
