import { describe, expect, test } from "bun:test";
import type { ActivityRow, Currency, Statement } from "../types";
import { buildActivity, sumActivity } from "./activity";

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

function statement(overrides: {
  accountNo?: string;
  period?: string;
  template?: "BROKERAGE" | "CASH" | "PERFORMANCE";
  fxRate?: number | null;
  activity?: ActivityRow[];
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
    cash: [],
    holdings: [],
    activity: overrides.activity ?? [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: overrides.fxRate ?? null,
    returns: null,
    balances: null,
  };
}

describe("buildActivity", () => {
  test("sums CAD and USD DIV rows, converting the USD row at the statement's own fxRate", () => {
    const s = statement({
      fxRate: 1.4,
      activity: [
        row("DIV", { credit: 1.5, currency: "CAD" }),
        row("DIV", { credit: 2, currency: "USD" }),
      ],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.dividends).toBeCloseTo(1.5 + 2 * 1.4, 6);
  });

  test("NRT lands as a positive withholding figure, read off the debit side", () => {
    const s = statement({ activity: [row("NRT", { debit: 0.27, currency: "CAD" })] });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.withholdingTax).toBe(0.27);
  });

  test("a DIV credit reversal (an amended statement's debit twin) nets to the true dividend", () => {
    // Real corpus, d6d9 2026-04: two DIV credits of 40.90 plus an amended
    // reversal debit of 40.90, true net 40.90, not 81.80.
    const s = statement({
      activity: [
        row("DIV", { credit: 40.9 }),
        row("DIV", { credit: 40.9 }),
        row("DIV", { debit: 40.9 }),
      ],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.dividends).toBeCloseTo(40.9, 6);
  });

  test("an INT debit reversal nets against the credit", () => {
    const s = statement({ activity: [row("INT", { credit: 5 }), row("INT", { debit: 5 })] });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.interest).toBe(0);
  });

  test("an FPLINT debit reverses a credit, netting to zero", () => {
    // Real corpus, d77c 2024-03: a stock-lending debit reversing a credit.
    const s = statement({
      activity: [row("FPLINT", { credit: 0.01 }), row("FPLINT", { debit: 0.01 })],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.lendingIncome).toBe(0);
  });

  test("an NRT credit reverses a debit, netting the withholding to zero", () => {
    // Real corpus, 1f9a 2026-01: an NRT credit reversing an NRT debit.
    const s = statement({ activity: [row("NRT", { debit: 0.1 }), row("NRT", { credit: 0.1 })] });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.withholdingTax).toBe(0);
  });

  test("a USD row on a statement with a null fxRate throws, naming the statement", () => {
    const s = statement({
      fxRate: null,
      activity: [row("DIV", { credit: 2, currency: "USD" as Currency })],
    });
    expect(() => buildActivity([s])).toThrow(/acct_0001_2026-08_BROKERAGE\.pdf/);
  });

  test("an unrelated USD row (BUY) on a statement with a null fxRate does not throw", () => {
    const s = statement({
      fxRate: null,
      activity: [row("BUY", { debit: 100, currency: "USD" as Currency })],
    });
    expect(() => buildActivity([s])).not.toThrow();
  });

  test("PERFORMANCE statements are skipped", () => {
    const s = statement({ template: "PERFORMANCE", activity: [row("DIV", { credit: 5 })] });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]).toBeUndefined();
  });

  test("FEE nets a same-code ETF rebate credit against the debit, matching the statement's own printed fee", () => {
    // Real corpus, 9710 2025: the statement's own cash paidOut.fees reconciles
    // only when the credit side is netted in, not read separately.
    const s = statement({
      activity: [row("FEE", { debit: 3.5 }), row("FEE", { credit: 1.2 })],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.fees).toBeCloseTo(2.3, 6);
  });

  test("REIMB recognized as a fee refund (ETF Rebate, ACCOUNTING_REIMBURSEMENT) reduces fees", () => {
    // Real corpus, d6d9 2026-08: an ACCOUNTING_REIMBURSEMENT credit of 7.52
    // refunding a fee charged in 2026-06.
    const s = statement({
      activity: [
        row("FEE", { debit: 10 }),
        row("REIMB", { credit: 7.52, description: "ACCOUNTING_REIMBURSEMENT (executed at X)" }),
      ],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.fees).toBeCloseTo(2.48, 6);
  });

  test("a REIMB row not recognizable as a fee refund is excluded, not netted in", () => {
    const s = statement({
      activity: [row("REIMB", { credit: 50, description: "Something else entirely" })],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.fees).toBe(0);
  });

  test("FXCONVERSION counts every row but values only the CAD side, once per conversion", () => {
    const s = statement({
      activity: [
        row("FXCONVERSION", { debit: 300, currency: "CAD" }),
        row("FXCONVERSION", { credit: 4049.59, currency: "USD" as Currency }),
      ],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.fxConversions).toBe(2);
    expect(activity["2026-08"]?.acct_0001?.fxConversionAmount).toBe(300);
  });

  test("a CAD-to-CAD FXCONVERSION pair values both sides but the two cancel to the CAD side's own amount", () => {
    const s = statement({
      activity: [row("FXCONVERSION", { debit: 811, currency: "CAD" })],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.fxConversionAmount).toBe(811);
  });

  test("an amended version is collapsed to the latest, never double counted", () => {
    const original = statement({
      version: 0,
      activity: [row("DIV", { credit: 40.9 })],
    });
    const amended = statement({
      version: 1,
      activity: [row("DIV", { credit: 40.9 }), row("FEE", { debit: 5 })],
    });
    const activity = buildActivity([original, amended]);
    expect(activity["2026-08"]?.acct_0001?.dividends).toBeCloseTo(40.9, 6);
    expect(activity["2026-08"]?.acct_0001?.fees).toBe(5);
  });

  test("sumActivity of an empty list is all zeros", () => {
    expect(sumActivity([])).toEqual({
      dividends: 0,
      interest: 0,
      lendingIncome: 0,
      withholdingTax: 0,
      fees: 0,
      fxConversions: 0,
      fxConversionAmount: 0,
    });
  });
});
