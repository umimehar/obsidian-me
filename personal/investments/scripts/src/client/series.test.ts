import { describe, expect, test } from "bun:test";
import type { Scope } from "./filter";
import type { LedgerFlow, SeriesLedger, SeriesRow } from "./series";
import {
  capitalTrend,
  cashflowSeries,
  costByAccount,
  flowsForPeriod,
  incomeSeries,
  scopeYear,
  taxSummary,
} from "./series";

function row(overrides: Partial<SeriesRow>): SeriesRow {
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
    cash: null,
    acb: null,
    interest: 0,
    eligible_dividends: 0,
    foreign_income: 0,
    realized_gain: 0,
    ...overrides,
  };
}

function flow(overrides: Partial<LedgerFlow>): LedgerFlow {
  return {
    account_id: "A",
    month: "2024-01",
    date: "2024-01-15",
    type: "CONTRIB",
    amount: 0,
    description: "",
    ...overrides,
  };
}

function ledger(overrides: Partial<SeriesLedger>): SeriesLedger {
  return {
    accounts: [{ id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" }],
    months: ["2024-01", "2024-02", "2024-03"],
    series: [],
    holdings: [],
    limits: {},
    flows: [],
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
    expect(out).toEqual({ labels: [], capital: [], contributions: [], deposits: [] });
  });

  test("deposits are cumulative to-date and can differ from contrib", () => {
    // deposits = CONTRIB + TRANSFER_IN + TRANSFER_OUT, so a month with a
    // transfer in but no coded contribution still counts as money in.
    const L = ledger({
      series: [
        row({ month: "2024-01", contrib: 100, deposits: 100 }),
        row({ month: "2024-02", contrib: 0, deposits: 40 }), // transfer in, uncoded
        row({ month: "2024-03", contrib: 25, deposits: 25 }),
      ],
    });
    const out = capitalTrend(L, ALL);
    expect(out.contributions).toEqual([100, 100, 125]);
    expect(out.deposits).toEqual([100, 140, 165]);
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

describe("costByAccount", () => {
  test("cost is acb forward-filled to the window end; contributions sum within the window", () => {
    const L = ledger({
      accounts: [
        { id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" },
        { id: "B", kind: "RRSP", name: "RRSP B", short_id: "bbbb", currency: "CAD" },
      ],
      series: [
        row({ account_id: "A", month: "2024-01", contrib: 100, acb: 500 }),
        // 2024-02/03 carry no series row for A -> acb forward-fills from Jan.
        row({ account_id: "A", month: "2024-03", contrib: 50 }),
        row({ account_id: "B", month: "2024-01", contrib: 20, acb: 200 }),
      ],
    });
    const out = costByAccount(L, { ris: [0, 1, 2], accts: ["A", "B"] });
    expect(out).toEqual([
      { account_id: "A", kind: "TFSA", short_id: "aaaa", cost: 500, contributions: 150 },
      { account_id: "B", kind: "RRSP", short_id: "bbbb", cost: 200, contributions: 20 },
    ]);
  });

  test("rows are sorted by cost descending", () => {
    const L = ledger({
      accounts: [
        { id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" },
        { id: "B", kind: "RRSP", name: "RRSP B", short_id: "bbbb", currency: "CAD" },
      ],
      series: [
        row({ account_id: "A", month: "2024-01", acb: 100 }),
        row({ account_id: "B", month: "2024-01", acb: 900 }),
      ],
    });
    const out = costByAccount(L, { ris: [0], accts: ["A", "B"] });
    expect(out.map((r) => r.account_id)).toEqual(["B", "A"]);
  });

  test("empty account scope yields no rows", () => {
    const L = ledger({ series: [row({ month: "2024-01", acb: 500 })] });
    expect(costByAccount(L, { ris: [0], accts: [] })).toEqual([]);
  });

  test("empty month window yields zero cost and zero contributions, not a crash", () => {
    const L = ledger({ series: [row({ month: "2024-01", contrib: 100, acb: 500 })] });
    const out = costByAccount(L, { ris: [], accts: ["A"] });
    expect(out).toEqual([
      { account_id: "A", kind: "TFSA", short_id: "aaaa", cost: 0, contributions: 0 },
    ]);
  });
});

describe("scopeYear", () => {
  test("is the year of the last resolved month, not the ledger's last month", () => {
    const L = ledger({ months: ["2024-01", "2024-02", "2025-01"] });
    expect(scopeYear(L, { ris: [0, 1], accts: ["A"] })).toBe("2024");
  });

  test("all-time (full window) reports the latest data year", () => {
    const L = ledger({ months: ["2024-01", "2024-02", "2025-01"] });
    expect(scopeYear(L, { ris: [0, 1, 2], accts: ["A"] })).toBe("2025");
  });

  test("empty window falls back to the ledger's last month", () => {
    const L = ledger({ months: ["2024-01", "2025-06"] });
    expect(scopeYear(L, { ris: [], accts: ["A"] })).toBe("2025");
  });
});

describe("taxSummary", () => {
  test("sums the tax-split fields for scoped accounts within the year only", () => {
    const L = ledger({
      series: [
        row({
          month: "2024-01",
          interest: 10,
          eligible_dividends: 20,
          foreign_income: 5,
          realized_gain: 100,
        }),
        row({ month: "2025-01", interest: 999, eligible_dividends: 999 }), // wrong year
      ],
    });
    const out = taxSummary(L, { ris: [0], accts: ["A"] }, "2024");
    expect(out.interest).toBe(10);
    expect(out.eligible_dividends).toBe(20);
    expect(out.foreign_income).toBe(5);
    expect(out.realized_gains).toBe(100);
  });

  test("excludes accounts outside the scope", () => {
    const L = ledger({
      accounts: [
        { id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" },
        { id: "B", kind: "RRSP", name: "RRSP B", short_id: "bbbb", currency: "CAD" },
      ],
      series: [
        row({ account_id: "A", month: "2024-01", interest: 10 }),
        row({ account_id: "B", month: "2024-01", interest: 999 }),
      ],
    });
    const out = taxSummary(L, { ris: [0], accts: ["A"] }, "2024");
    expect(out.interest).toBe(10);
  });

  test("room used sums contrib per registered group and ignores gross external_in", () => {
    const L = ledger({
      accounts: [
        { id: "A", kind: "TFSA", name: "TFSA A", short_id: "aaaa", currency: "CAD" },
        { id: "B", kind: "ManagedTFSA", name: "MTFSA B", short_id: "bbbb", currency: "CAD" },
        { id: "C", kind: "RRSP", name: "RRSP C", short_id: "cccc", currency: "CAD" },
      ],
      limits: { TFSA: { "2024": 7000 }, RRSP: { "2024": 31000 } },
      series: [
        row({ account_id: "A", month: "2024-01", contrib: 1000, external_in: 1000 }),
        row({ account_id: "B", month: "2024-01", contrib: 500, external_in: 500 }),
        // C is a routing/hub RRSP: coded CONTRIB 2000, but external_in 5000
        // includes deposits that pass through to other accounts. Only the
        // 2000 CONTRIB counts as room used; the gross 5000 must be ignored.
        row({ account_id: "C", month: "2024-01", contrib: 2000, external_in: 5000 }),
      ],
    });
    const out = taxSummary(L, { ris: [0], accts: ["A", "B", "C"] }, "2024");
    const tfsa = out.room.find((r) => r.group === "TFSA");
    const rrsp = out.room.find((r) => r.group === "RRSP");
    expect(tfsa).toEqual({ group: "TFSA", used: 1500, limit: 7000, remaining: 5500 });
    expect(rrsp).toEqual({ group: "RRSP", used: 2000, limit: 31000, remaining: 29000 });
  });

  test("missing limit for the year falls back to 0", () => {
    const L = ledger({
      limits: {},
      series: [row({ month: "2024-01", contrib: 100, external_in: 100 })],
    });
    const out = taxSummary(L, { ris: [0], accts: ["A"] }, "2024");
    const tfsa = out.room.find((r) => r.group === "TFSA");
    expect(tfsa).toEqual({ group: "TFSA", used: 100, limit: 0, remaining: -100 });
  });
});

describe("flowsForPeriod", () => {
  test("month period matches only that month", () => {
    const L = ledger({
      flows: [
        flow({ month: "2024-01", date: "2024-01-05", type: "CONTRIB", amount: 100 }),
        flow({ month: "2024-01", date: "2024-01-20", type: "TRANSFER_IN", amount: 50 }),
        flow({ month: "2024-01", date: "2024-01-10", type: "TRANSFER_OUT", amount: -30 }),
        flow({ month: "2024-02", date: "2024-02-01", type: "CONTRIB", amount: 999 }),
      ],
    });
    const out = flowsForPeriod(L, { ris: [0], accts: ["A"] }, "2024-01");
    expect(out.inflow.map((f) => f.date)).toEqual(["2024-01-05", "2024-01-20"]);
    expect(out.outflow.map((f) => f.date)).toEqual(["2024-01-10"]);
  });

  test("year period matches every month in that year", () => {
    const L = ledger({
      flows: [
        flow({ month: "2024-01", date: "2024-01-05", type: "CONTRIB", amount: 100 }),
        flow({ month: "2024-06", date: "2024-06-15", type: "TRANSFER_IN", amount: 40 }),
        flow({ month: "2024-11", date: "2024-11-02", type: "TRANSFER_OUT", amount: -20 }),
        flow({ month: "2025-01", date: "2025-01-01", type: "CONTRIB", amount: 999 }),
      ],
    });
    const out = flowsForPeriod(L, { ris: [0], accts: ["A"] }, "2024");
    expect(out.inflow.map((f) => f.date)).toEqual(["2024-01-05", "2024-06-15"]);
    expect(out.outflow.map((f) => f.date)).toEqual(["2024-11-02"]);
  });

  test("excludes accounts outside the scope", () => {
    const L = ledger({
      flows: [
        flow({ account_id: "A", month: "2024-01", amount: 100 }),
        flow({ account_id: "B", month: "2024-01", amount: 200 }),
      ],
    });
    const out = flowsForPeriod(L, { ris: [0], accts: ["A"] }, "2024-01");
    expect(out.inflow).toHaveLength(1);
    expect(out.inflow[0]?.account_id).toBe("A");
  });

  test("no matching flows yields empty arrays", () => {
    const L = ledger({ flows: [] });
    const out = flowsForPeriod(L, { ris: [0], accts: ["A"] }, "2024-01");
    expect(out).toEqual({ inflow: [], outflow: [] });
  });
});
