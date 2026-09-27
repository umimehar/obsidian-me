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
}): Statement {
  const { accountNo = "acct_0001", period = "2026-08", template = "BROKERAGE" } = overrides;
  return {
    source: {
      file: `${accountNo}_${period}_${template}.pdf`,
      accountNo,
      period,
      template,
      version: 0,
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

  test("FEE reads the debit charge only, leaving an ETF rebate credit out", () => {
    const s = statement({
      activity: [row("FEE", { debit: 3.5 }), row("FEE", { credit: 1.2 })],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.fees).toBe(3.5);
  });

  test("FXCONVERSION counts rows regardless of side", () => {
    const s = statement({
      activity: [row("FXCONVERSION", { debit: 300 }), row("FXCONVERSION", { credit: 4049.59 })],
    });
    const activity = buildActivity([s]);
    expect(activity["2026-08"]?.acct_0001?.fxConversions).toBe(2);
  });

  test("sumActivity of an empty list is all zeros", () => {
    expect(sumActivity([])).toEqual({
      dividends: 0,
      interest: 0,
      lendingIncome: 0,
      withholdingTax: 0,
      fees: 0,
      fxConversions: 0,
    });
  });
});
