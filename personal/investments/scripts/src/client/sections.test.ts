import { describe, expect, test } from "bun:test";
import type { Scope } from "./filter";
import type { ProjectionInputs, RegisteredRules } from "./projection";
import { projectYears } from "./projection";
import {
  clampProjectionRate,
  estimateTax,
  projectionSummaryFigures,
  totalContributed,
  totalDeposits,
  totalIncome,
} from "./sections";
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
    grant: 0,
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
    accounts: [
      {
        id: "A",
        kind: "TFSA",
        name: "TFSA A",
        short_id: "aaaa",
        currency: "CAD",
        first_activity: "2024-01-01",
      },
    ],
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
    assessed_room: {},
    registered_rules: {},
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

describe("clampProjectionRate", () => {
  test("returns the value unchanged when within range", () => {
    expect(clampProjectionRate(8, 0, 20, 5)).toBe(8);
  });

  test("accepts both boundary values themselves", () => {
    expect(clampProjectionRate(0, 0, 20, 8)).toBe(0);
    expect(clampProjectionRate(20, 0, 20, 8)).toBe(20);
  });

  test("falls back to the last good value below the return floor (0%)", () => {
    expect(clampProjectionRate(-0.1, 0, 20, 8)).toBe(8);
  });

  test("falls back to the last good value above the return ceiling (20%)", () => {
    expect(clampProjectionRate(20.1, 0, 20, 8)).toBe(8);
  });

  test("falls back to the last good value above the indexation ceiling (10%)", () => {
    expect(clampProjectionRate(10.1, 0, 10, 2)).toBe(2);
  });

  test("falls back to the last good value on non-numeric input rather than NaN", () => {
    expect(clampProjectionRate(Number.NaN, 0, 20, 8)).toBe(8);
  });
});

describe("projectionSummaryFigures (recompute path)", () => {
  const rules: RegisteredRules = {
    fhsaAnnual: 8000,
    fhsaLifetime: 40000,
    respLifetime: 50000,
    respGrantTarget: 2500,
    respCatchupTarget: 5000,
    cesgRate: 0.2,
    cesgAnnualBasic: 500,
    cesgAnnualMax: 1000,
    cesgLifetime: 7200,
    tfsaRounding: 500,
    rrspRounding: 10,
  };

  function projInputs(overrides: Partial<ProjectionInputs> = {}): ProjectionInputs {
    return {
      startYear: "2026",
      years: 5,
      returnRate: 0.08,
      indexRate: 0.02,
      opening: { TFSA: 10000, FHSA: 0, RRSP: 20000, RESP: 0 },
      contributedThisYear: { TFSA: 0, FHSA: 0, RRSP: 0, RESP: 0 },
      lifetimeContributed: { FHSA: 0, RESP: 0 },
      cesgReceived: 0,
      cesgRoomAccrued: 0,
      rrspAssessedRemaining: 10000,
      fhsaCloseYear: "2039",
      rrspLastYear: "2068",
      cesgLastYear: "2042",
      roomBase: { TFSA: 7000, RRSP: 33810 },
      rules,
      ...overrides,
    };
  }

  test("a higher indexation rate deflates the ending value further, leaving the nominal " +
    "totals unchanged", () => {
    const rows = projectYears(projInputs());
    const low = projectionSummaryFigures(rows, 0.02);
    const high = projectionSummaryFigures(rows, 0.05);
    expect(low.contributed).toBe(high.contributed);
    expect(low.grants).toBe(high.grants);
    expect(low.endingValue).toBe(high.endingValue);
    expect(high.endingValueToday).toBeLessThan(low.endingValueToday);
  });

  test("a higher return rate raises the nominal ending value", () => {
    const lowReturn = projectYears(projInputs({ returnRate: 0.02 }));
    const highReturn = projectYears(projInputs({ returnRate: 0.1 }));
    const low = projectionSummaryFigures(lowReturn, 0.02);
    const high = projectionSummaryFigures(highReturn, 0.02);
    expect(high.endingValue).toBeGreaterThan(low.endingValue);
  });

  test("zero indexation leaves the ending value equal to today's money", () => {
    const rows = projectYears(projInputs());
    const figures = projectionSummaryFigures(rows, 0);
    expect(figures.endingValueToday).toBe(figures.endingValue);
  });

  test("an empty row array reports all zeros rather than throwing", () => {
    expect(projectionSummaryFigures([], 0.02)).toEqual({
      contributed: 0,
      grants: 0,
      endingValue: 0,
      endingValueToday: 0,
    });
  });
});

// A type=number input blanks itself when given non-numeric text, and Number("")
// is 0 — a legal rate here. Without an explicit empty check, typing "abc" into
// the return field silently produces a 0% projection instead of falling back to
// the last good rate. Caught in a browser, not by the unit tests, so it is
// pinned here.
describe("clampProjectionRate", () => {
  test("accepts a value inside the range", () => {
    expect(clampProjectionRate(8, 0, 20, 5)).toBe(8);
    expect(clampProjectionRate(0, 0, 20, 5)).toBe(0);
    expect(clampProjectionRate(20, 0, 20, 5)).toBe(20);
  });

  test("falls back outside the range rather than clamping to the bound", () => {
    expect(clampProjectionRate(99, 0, 20, 8)).toBe(8);
    expect(clampProjectionRate(-5, 0, 20, 8)).toBe(8);
  });

  test("falls back on NaN and infinities", () => {
    expect(clampProjectionRate(Number.NaN, 0, 20, 8)).toBe(8);
    expect(clampProjectionRate(Number.POSITIVE_INFINITY, 0, 20, 8)).toBe(8);
  });

  test("zero is a legal rate, so an empty field must be rejected before this call", () => {
    // Guards the real bug: Number("") === 0 passes every check here, so the
    // empty-string case has to be handled by the caller reading the DOM.
    expect(clampProjectionRate(Number(""), 0, 20, 8)).toBe(0);
  });
});
