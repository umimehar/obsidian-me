import { describe, expect, test } from "bun:test";
import type { Scope } from "./filter";
import type {
  LedgerFlow,
  ProjectionOptions,
  SeriesAccount,
  SeriesLedger,
  SeriesRow,
} from "./series";
import {
  accountAllocations,
  capitalTrend,
  cashflowSeries,
  costByAccount,
  flowsForPeriod,
  incomeSeries,
  projectionInputs,
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
    grant: 0,
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
    accounts: [
      {
        id: "A",
        kind: "TFSA",
        name: "TFSA A",
        short_id: "aaaa",
        currency: "CAD",
        first_activity: "2024-01",
      },
    ],
    months: ["2024-01", "2024-02", "2024-03"],
    series: [],
    holdings: [],
    limits: {},
    assessed_room: {},
    registered_rules: {},
    flows: [],
    ...overrides,
  };
}

const ALL: Scope = { ris: [0, 1, 2], accts: ["A"] };

function account(overrides: Partial<SeriesAccount>): SeriesAccount {
  return {
    id: "A",
    kind: "TFSA",
    name: "TFSA A",
    short_id: "aaaa",
    currency: "CAD",
    first_activity: "2024-01",
    ...overrides,
  };
}

function projOpts(overrides: Partial<ProjectionOptions> = {}): ProjectionOptions {
  return {
    returnRate: 0.08,
    indexRate: 0.02,
    years: 30,
    rrspLastYear: "2068",
    respBeneficiaryBirthYear: 2025,
    ...overrides,
  };
}

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
        {
          id: "A",
          kind: "TFSA",
          name: "TFSA A",
          short_id: "aaaa",
          currency: "CAD",
          first_activity: "2024-01",
        },
        {
          id: "B",
          kind: "RRSP",
          name: "RRSP B",
          short_id: "bbbb",
          currency: "CAD",
          first_activity: "2024-01",
        },
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
        {
          id: "A",
          kind: "TFSA",
          name: "TFSA A",
          short_id: "aaaa",
          currency: "CAD",
          first_activity: "2024-01",
        },
        {
          id: "B",
          kind: "RRSP",
          name: "RRSP B",
          short_id: "bbbb",
          currency: "CAD",
          first_activity: "2024-01",
        },
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
        {
          id: "A",
          kind: "TFSA",
          name: "TFSA A",
          short_id: "aaaa",
          currency: "CAD",
          first_activity: "2024-01",
        },
        {
          id: "B",
          kind: "RRSP",
          name: "RRSP B",
          short_id: "bbbb",
          currency: "CAD",
          first_activity: "2024-01",
        },
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
        {
          id: "A",
          kind: "TFSA",
          name: "TFSA A",
          short_id: "aaaa",
          currency: "CAD",
          first_activity: "2024-01",
        },
        {
          id: "B",
          kind: "RRSP",
          name: "RRSP B",
          short_id: "bbbb",
          currency: "CAD",
          first_activity: "2024-01",
        },
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
        {
          id: "A",
          kind: "TFSA",
          name: "TFSA A",
          short_id: "aaaa",
          currency: "CAD",
          first_activity: "2024-01",
        },
        {
          id: "B",
          kind: "ManagedTFSA",
          name: "MTFSA B",
          short_id: "bbbb",
          currency: "CAD",
          first_activity: "2024-01",
        },
        {
          id: "C",
          kind: "RRSP",
          name: "RRSP C",
          short_id: "cccc",
          currency: "CAD",
          first_activity: "2024-01",
        },
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
    expect(tfsa).toEqual({
      group: "TFSA",
      used: 1500,
      limit: 7000,
      remaining: 5500,
      assessed: false,
    });
    expect(rrsp).toEqual({
      group: "RRSP",
      used: 2000,
      limit: 31000,
      remaining: 29000,
      assessed: false,
    });
  });

  test("CRA-assessed room overrides the annual maximum and is flagged", () => {
    const L = ledger({
      accounts: [
        {
          id: "C",
          kind: "RRSP",
          name: "RRSP C",
          short_id: "cccc",
          currency: "CAD",
          first_activity: "2024-01",
        },
      ],
      limits: { RRSP: { "2024": 31000 } },
      assessed_room: { RRSP: { "2024": 70752 } },
      series: [row({ account_id: "C", month: "2024-01", contrib: 33000, external_in: 33000 })],
    });
    const out = taxSummary(L, { ris: [0], accts: ["C"] }, "2024");
    expect(out.room.find((r) => r.group === "RRSP")).toEqual({
      group: "RRSP",
      used: 33000,
      limit: 70752,
      remaining: 37752,
      assessed: true,
    });
  });

  test("assessed room for one year does not leak into another", () => {
    const L = ledger({
      accounts: [
        {
          id: "C",
          kind: "RRSP",
          name: "RRSP C",
          short_id: "cccc",
          currency: "CAD",
          first_activity: "2024-01",
        },
      ],
      limits: { RRSP: { "2025": 31000 } },
      assessed_room: { RRSP: { "2024": 70752 } },
      series: [row({ account_id: "C", month: "2025-01", contrib: 1000, external_in: 1000 })],
    });
    const out = taxSummary(L, { ris: [0], accts: ["C"] }, "2025");
    expect(out.room.find((r) => r.group === "RRSP")).toEqual({
      group: "RRSP",
      used: 1000,
      limit: 31000,
      remaining: 30000,
      assessed: false,
    });
  });

  test("missing limit for the year falls back to 0", () => {
    const L = ledger({
      limits: {},
      series: [row({ month: "2024-01", contrib: 100, external_in: 100 })],
    });
    const out = taxSummary(L, { ris: [0], accts: ["A"] }, "2024");
    const tfsa = out.room.find((r) => r.group === "TFSA");
    expect(tfsa).toEqual({ group: "TFSA", used: 100, limit: 0, remaining: -100, assessed: false });
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

describe("projectionInputs", () => {
  test("opening per group is forward-filled acb+cash at window end, ManagedTFSA folded into TFSA", () => {
    const L = ledger({
      accounts: [
        account({ id: "T", kind: "TFSA", short_id: "tttt" }),
        account({ id: "M", kind: "ManagedTFSA", short_id: "mmmm" }),
      ],
      series: [
        row({ account_id: "T", month: "2024-01", acb: 500, cash: 50 }),
        row({ account_id: "M", month: "2024-02", acb: 300, cash: 20 }),
      ],
    });
    const scope: Scope = { ris: [0, 1, 2], accts: ["T", "M"] };
    const out = projectionInputs(L, scope, "2024", projOpts());
    // T carries 550 forward from Jan, M carries 320 forward from Feb; both land
    // in the TFSA group at the window's last month (March).
    expect(out.opening.TFSA).toBe(870);
  });

  test("RESP lifetime contributed counts every dollar in, not just CONTRIB (the CRA trap)", () => {
    const L = ledger({
      accounts: [account({ id: "P", kind: "RESP", short_id: "pppp" })],
      series: [
        row({ account_id: "P", month: "2024-01", contrib: 2550, deposits: 2550 }),
        // Uncoded deposit (TRANSFER_IN/DEP) — no CONTRIB, but it still lands in
        // the account and counts toward the $50,000 lifetime cap.
        row({ account_id: "P", month: "2024-02", contrib: 0, deposits: 450 }),
      ],
    });
    const scope: Scope = { ris: [0, 1], accts: ["P"] };
    const out = projectionInputs(L, scope, "2024", projOpts());
    expect(out.lifetimeContributed.RESP).toBe(3000);
  });

  test("cesgReceived sums the grant field across RESP accounts, lifetime not year-scoped", () => {
    const L = ledger({
      accounts: [account({ id: "P", kind: "RESP", short_id: "pppp" })],
      series: [
        row({ account_id: "P", month: "2023-01", grant: 500 }),
        row({ account_id: "P", month: "2024-01", grant: 50 }),
      ],
    });
    const scope: Scope = { ris: [0, 1], accts: ["P"] };
    const out = projectionInputs(L, scope, "2024", projOpts());
    expect(out.cesgReceived).toBe(550);
  });

  test("contributedThisYear sums contrib for the scope year, deposits for RESP", () => {
    const L = ledger({
      accounts: [
        account({ id: "T", kind: "TFSA", short_id: "tttt" }),
        account({ id: "P", kind: "RESP", short_id: "pppp" }),
      ],
      series: [
        row({ account_id: "T", month: "2023-01", contrib: 1000 }),
        row({ account_id: "T", month: "2024-01", contrib: 7000 }),
        row({ account_id: "P", month: "2024-01", contrib: 2500, deposits: 2500 }),
        row({ account_id: "P", month: "2024-02", contrib: 0, deposits: 450 }),
      ],
    });
    const scope: Scope = { ris: [0, 1], accts: ["T", "P"] };
    const out = projectionInputs(L, scope, "2024", projOpts());
    expect(out.contributedThisYear.TFSA).toBe(7000);
    expect(out.contributedThisYear.RESP).toBe(2950);
  });

  test("lifetimeContributed.FHSA sums contrib across every year, not just the scope year", () => {
    const L = ledger({
      accounts: [account({ id: "F", kind: "FHSA", short_id: "ffff" })],
      series: [
        row({ account_id: "F", month: "2023-01", contrib: 8000 }),
        row({ account_id: "F", month: "2024-01", contrib: 8000 }),
        row({ account_id: "F", month: "2025-01", contrib: 8000 }),
      ],
    });
    const scope: Scope = { ris: [0, 1, 2], accts: ["F"] };
    const out = projectionInputs(L, scope, "2025", projOpts());
    expect(out.lifetimeContributed.FHSA).toBe(24000);
  });

  test("rrspAssessedRemaining uses the NOA figure minus this year's contributions when one exists", () => {
    const L = ledger({
      accounts: [account({ id: "R", kind: "RRSP", short_id: "rrrr" })],
      assessed_room: { RRSP: { "2026": 70752 } },
      series: [row({ account_id: "R", month: "2026-01", contrib: 33000 })],
    });
    const scope: Scope = { ris: [0], accts: ["R"] };
    const out = projectionInputs(L, scope, "2026", projOpts());
    expect(out.rrspAssessedRemaining).toBe(37752);
  });

  test("rrspAssessedRemaining falls back to the annual maximum minus contributions with no NOA", () => {
    const L = ledger({
      accounts: [account({ id: "R", kind: "RRSP", short_id: "rrrr" })],
      limits: { RRSP: { "2026": 33810 } },
      series: [row({ account_id: "R", month: "2026-01", contrib: 10000 })],
    });
    const scope: Scope = { ris: [0], accts: ["R"] };
    const out = projectionInputs(L, scope, "2026", projOpts());
    expect(out.rrspAssessedRemaining).toBe(23810);
  });

  test("rrspAssessedRemaining floors at zero rather than double-counting used room", () => {
    const L = ledger({
      accounts: [account({ id: "R", kind: "RRSP", short_id: "rrrr" })],
      limits: { RRSP: { "2026": 33810 } },
      series: [row({ account_id: "R", month: "2026-01", contrib: 40000 })],
    });
    const scope: Scope = { ris: [0], accts: ["R"] };
    const out = projectionInputs(L, scope, "2026", projOpts());
    expect(out.rrspAssessedRemaining).toBe(0);
  });

  test("fhsaCloseYear is the FHSA account's first-activity year plus 15", () => {
    const L = ledger({
      accounts: [
        account({ id: "F", kind: "FHSA", short_id: "ffff", first_activity: "2024-12-03" }),
      ],
    });
    const scope: Scope = { ris: [0], accts: ["F"] };
    const out = projectionInputs(L, scope, "2026", projOpts());
    expect(out.fhsaCloseYear).toBe("2039");
  });

  test("cesgLastYear and cesgRoomAccrued derive from the beneficiary birth year, not a hardcoded date", () => {
    const L = ledger({ registered_rules: { cesgAnnualBasic: 500 } });
    const scope: Scope = { ris: [0], accts: ["A"] };
    const out = projectionInputs(L, scope, "2026", projOpts({ respBeneficiaryBirthYear: 2025 }));
    expect(out.cesgLastYear).toBe("2042");
    expect(out.cesgRoomAccrued).toBe(1000);
  });

  test("roomBase carries the unrounded TFSA/RRSP limits for the start year", () => {
    const L = ledger({ limits: { TFSA: { "2026": 7000 }, RRSP: { "2026": 33810 } } });
    const scope: Scope = { ris: [0], accts: ["A"] };
    const out = projectionInputs(L, scope, "2026", projOpts());
    expect(out.roomBase).toEqual({ TFSA: 7000, RRSP: 33810 });
  });

  test("empty scope (no accounts selected) yields zeroed figures, not a crash", () => {
    const L = ledger({
      accounts: [
        account({ id: "T", kind: "TFSA", short_id: "tttt" }),
        account({ id: "F", kind: "FHSA", short_id: "ffff", first_activity: "2024-12-03" }),
      ],
      series: [
        row({ account_id: "T", month: "2024-01", contrib: 7000, acb: 1000 }),
        row({ account_id: "F", month: "2024-01", contrib: 8000, acb: 500 }),
      ],
    });
    const scope: Scope = { ris: [0], accts: [] };
    const out = projectionInputs(L, scope, "2024", projOpts());
    expect(out.opening).toEqual({});
    expect(out.contributedThisYear).toEqual({ TFSA: 0, FHSA: 0, RRSP: 0, RESP: 0 });
    expect(out.lifetimeContributed).toEqual({ FHSA: 0, RESP: 0 });
    expect(out.cesgReceived).toBe(0);
    // fhsaCloseYear is a fact about the account, not the current selection, so
    // it is unaffected by an empty account scope.
    expect(out.fhsaCloseYear).toBe("2039");
  });

  test("scope with no registered accounts selected yields zeroed contribution figures", () => {
    const L = ledger({
      accounts: [
        account({ id: "N", kind: "NonRegistered", short_id: "nnnn" }),
        account({ id: "T", kind: "TFSA", short_id: "tttt" }),
      ],
      series: [
        row({ account_id: "N", month: "2024-01", contrib: 500 }),
        row({ account_id: "T", month: "2024-01", contrib: 7000 }),
      ],
    });
    const scope: Scope = { ris: [0], accts: ["N"] };
    const out = projectionInputs(L, scope, "2024", projOpts());
    expect(out.opening).toEqual({});
    expect(out.contributedThisYear).toEqual({ TFSA: 0, FHSA: 0, RRSP: 0, RESP: 0 });
    expect(out.lifetimeContributed).toEqual({ FHSA: 0, RESP: 0 });
  });
});

// The opening balance handed to the per-account lines must be ACB PLUS cash,
// the same basis openingByGroup uses for the group projection. Seeding it from
// costByAccount's ACB-only `cost` left the account lines summing about $34,000
// below the group total after thirty years of compounding — silent, because
// each line looked individually plausible.
describe("accountAllocations opening basis", () => {
  test("opening counts cash as well as acb", () => {
    const L = ledger({
      accounts: [
        {
          id: "A",
          kind: "TFSA",
          name: "TFSA",
          short_id: "aaaa",
          currency: "CAD",
          first_activity: "2024-01-01",
        },
      ],
      series: [row({ account_id: "A", month: "2024-01", contrib: 100, acb: 700, cash: 300 })],
    });
    const [alloc] = accountAllocations(L, { ris: [0], accts: ["A"] }, "2024");
    expect(alloc?.opening).toBe(1000);
  });

  test("shares within a group sum to one", () => {
    const L = ledger({
      accounts: [
        {
          id: "A",
          kind: "TFSA",
          name: "TFSA",
          short_id: "aaaa",
          currency: "CAD",
          first_activity: "2024-01-01",
        },
        {
          id: "B",
          kind: "ManagedTFSA",
          name: "TFSA",
          short_id: "bbbb",
          currency: "CAD",
          first_activity: "2024-01-01",
        },
      ],
      series: [
        row({ account_id: "A", month: "2024-01", contrib: 750 }),
        row({ account_id: "B", month: "2024-01", contrib: 250 }),
      ],
    });
    const out = accountAllocations(L, { ris: [0], accts: ["A", "B"] }, "2024");
    expect(out.map((a) => a.share)).toEqual([0.75, 0.25]);
    expect(out.reduce((s, a) => s + a.share, 0)).toBeCloseTo(1, 10);
  });

  test("falls back to opening-balance share when nothing was contributed that year", () => {
    const L = ledger({
      accounts: [
        {
          id: "A",
          kind: "TFSA",
          name: "TFSA",
          short_id: "aaaa",
          currency: "CAD",
          first_activity: "2024-01-01",
        },
        {
          id: "B",
          kind: "ManagedTFSA",
          name: "TFSA",
          short_id: "bbbb",
          currency: "CAD",
          first_activity: "2024-01-01",
        },
      ],
      series: [
        row({ account_id: "A", month: "2024-01", acb: 800 }),
        row({ account_id: "B", month: "2024-01", acb: 200 }),
      ],
    });
    const out = accountAllocations(L, { ris: [0], accts: ["A", "B"] }, "2024");
    expect(out.map((a) => a.share)).toEqual([0.8, 0.2]);
  });

  test("splits evenly when there is neither a contribution nor a balance", () => {
    const L = ledger({
      accounts: [
        {
          id: "A",
          kind: "TFSA",
          name: "TFSA",
          short_id: "aaaa",
          currency: "CAD",
          first_activity: "2024-01-01",
        },
        {
          id: "B",
          kind: "ManagedTFSA",
          name: "TFSA",
          short_id: "bbbb",
          currency: "CAD",
          first_activity: "2024-01-01",
        },
      ],
      series: [
        row({ account_id: "A", month: "2024-01" }),
        row({ account_id: "B", month: "2024-01" }),
      ],
    });
    const out = accountAllocations(L, { ris: [0], accts: ["A", "B"] }, "2024");
    expect(out.map((a) => a.share)).toEqual([0.5, 0.5]);
  });
});
