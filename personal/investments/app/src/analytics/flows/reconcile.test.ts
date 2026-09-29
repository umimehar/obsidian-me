import { describe, expect, test } from "bun:test";
import type { AccountRecord } from "../../store/registry";
import type { ActivityRow, CashSummary, Currency, Statement } from "../../types";
import { classifyStatement } from "./classify";
import { buildCashBlocks } from "./reconcile";

function row(code: string, overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    date: "2026-08-15",
    postedDate: null,
    code,
    description: "",
    debit: 0,
    credit: 0,
    balance: 0,
    currency: "CAD",
    ...overrides,
  };
}

function cash(currency: Currency, opening: number, closing: number): CashSummary {
  return {
    currency,
    opening,
    closing,
    totalIn: null,
    totalOut: null,
    paidIn: null,
    paidOut: null,
  };
}

function account(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    maskedId: "acct_d77c",
    shortId: "d77c",
    label: "TFSA (self-directed)",
    kind: "TFSA",
    style: "self-directed",
    purpose: "growth",
    inTotals: true,
    firstPeriod: "2023-01",
    lastPeriod: "2026-08",
    statementCount: 1,
    typeHistory: [],
    ...overrides,
  };
}

function statementFixture(overrides: {
  accountNo?: string;
  period?: string;
  fxRate?: number | null;
  cash?: CashSummary[];
  activity?: ActivityRow[];
}): Statement {
  const {
    accountNo = "acct_d77c",
    period = "2026-08",
    fxRate = null,
    cash: cashBlocks = [],
    activity = [],
  } = overrides;
  return {
    source: {
      file: `${accountNo}_${period}_BROKERAGE.pdf`,
      accountNo,
      period,
      template: "BROKERAGE",
      version: 0,
    },
    accountType: "",
    periodStart: `${period}-01`,
    periodEnd: `${period}-28`,
    portfolio: null,
    cash: cashBlocks,
    holdings: [],
    activity,
    contributions: null,
    dividendsYearToDate: null,
    fxRate,
    returns: null,
    balances: null,
  };
}

describe("buildCashBlocks", () => {
  test("a block whose rows explain the change has residual 0", () => {
    const s = statementFixture({
      cash: [cash("CAD", 100, 150)],
      activity: [row("CONT", { credit: 50 })],
    });
    const rows = classifyStatement(s, account());
    expect(buildCashBlocks([s], rows)[0]?.residual).toBeCloseTo(0, 9);
  });

  test("a gap the rows do not explain is kept as the residual, in the block's currency", () => {
    const s = statementFixture({ fxRate: 1.4, cash: [cash("USD", 0, 10)], activity: [] });
    const [block] = buildCashBlocks([s], []);
    expect(block?.residual).toBeCloseTo(10, 9);
    expect(block?.fxRate).toBe(1.4);
  });
});
