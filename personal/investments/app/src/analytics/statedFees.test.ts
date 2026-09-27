import { describe, expect, test } from "bun:test";
import type { CashSummary, Statement } from "../types";
import { buildStatedFees } from "./statedFees";

function cash(overrides: Partial<CashSummary> = {}): CashSummary {
  return {
    currency: "CAD",
    opening: 0,
    closing: 0,
    totalIn: null,
    totalOut: null,
    paidIn: null,
    paidOut: null,
    ...overrides,
  };
}

function statement(overrides: {
  accountNo?: string;
  period?: string;
  template?: "BROKERAGE" | "CASH" | "PERFORMANCE";
  fxRate?: number | null;
  cash?: CashSummary[];
  version?: number;
}): Statement {
  const {
    accountNo = "acct_0001",
    period = "2026-08",
    template = "BROKERAGE",
    version = 0,
  } = overrides;
  return {
    source: {
      file: `${accountNo}_${period}_${template}.pdf`,
      accountNo,
      period,
      template,
      version,
    },
    accountType: "",
    periodStart: `${period}-01`,
    periodEnd: `${period}-28`,
    portfolio: null,
    cash: overrides.cash ?? [],
    holdings: [],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: overrides.fxRate ?? null,
    returns: null,
    balances: null,
  };
}

function paidOut(fees: number) {
  return {
    fees,
    taxes: 0,
    interestPaid: 0,
    costOfInvestments: 0,
    withdrawals: 0,
    other: 0,
  };
}

describe("buildStatedFees", () => {
  test("reads the CAD cash block's own printed fee figure", () => {
    const s = statement({ cash: [cash({ paidOut: paidOut(23.87) })] });
    const totals = buildStatedFees([s]);
    expect(totals["2026-08"]?.acct_0001).toBe(23.87);
  });

  test("converts a USD cash block's fee figure at the statement's own fxRate", () => {
    const s = statement({
      fxRate: 1.4,
      cash: [cash({ currency: "USD", paidOut: paidOut(10) })],
    });
    const totals = buildStatedFees([s]);
    expect(totals["2026-08"]?.acct_0001).toBeCloseTo(14, 6);
  });

  test("sums fees across every cash currency block on the statement", () => {
    const s = statement({
      fxRate: 1.4,
      cash: [
        cash({ currency: "CAD", paidOut: paidOut(5) }),
        cash({ currency: "USD", paidOut: paidOut(10) }),
      ],
    });
    const totals = buildStatedFees([s]);
    expect(totals["2026-08"]?.acct_0001).toBeCloseTo(19, 6);
  });

  test("a cash block with no paidOut (the CASH template) contributes nothing", () => {
    const s = statement({ cash: [cash({ paidOut: null })] });
    const totals = buildStatedFees([s]);
    expect(totals["2026-08"]?.acct_0001).toBe(0);
  });

  test("PERFORMANCE statements are skipped", () => {
    const s = statement({ template: "PERFORMANCE", cash: [cash({ paidOut: paidOut(23.87) })] });
    const totals = buildStatedFees([s]);
    expect(totals["2026-08"]).toBeUndefined();
  });

  test("an amended version is collapsed to the latest, never double counted", () => {
    const original = statement({ version: 0, cash: [cash({ paidOut: paidOut(5) })] });
    const amended = statement({ version: 1, cash: [cash({ paidOut: paidOut(9) })] });
    const totals = buildStatedFees([original, amended]);
    expect(totals["2026-08"]?.acct_0001).toBe(9);
  });
});
