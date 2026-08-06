import { describe, expect, test } from "bun:test";
import type { AccountRecord } from "../store/registry";
import type { CashSummary, Contributions, PortfolioSummary, Statement } from "../types";
import { buildSeries } from "./series";

function src(
  period: string,
  template: "BROKERAGE" | "CASH" | "PERFORMANCE",
  accountNo = "acct_0001",
) {
  return {
    file: `${accountNo}_${period}_${template}.pdf`,
    accountNo,
    period,
    template,
    version: 0,
  };
}

function portfolio(totalMarketValue: number, totalBookCost: number): PortfolioSummary {
  return {
    cashMarketValue: 0,
    cashBookCost: 0,
    classes: [],
    totalMarketValue,
    totalBookCost,
  };
}

function cadCash(overrides: Partial<CashSummary> = {}): CashSummary {
  return {
    currency: "CAD",
    opening: 0,
    closing: 500,
    totalIn: 500,
    totalOut: 0,
    paidIn: {
      deposits: 300,
      proceedsFromSales: 0,
      dividends: 0,
      interestEarned: 0,
      stockLendingIncome: 0,
      other: 0,
    },
    paidOut: {
      fees: 0,
      taxes: 0,
      interestPaid: 0,
      costOfInvestments: 0,
      withdrawals: 0,
      other: 0,
    },
    ...overrides,
  };
}

function statement(over: Partial<Statement> = {}): Statement {
  return {
    source: src("2026-01", "BROKERAGE"),
    accountType: "Self-directed RRSP Account",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    portfolio: portfolio(10000, 9500),
    cash: [cadCash()],
    holdings: [],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
    ...over,
  };
}

function ytd(value: number | null): Contributions {
  return { yearToDate: value, first60Days: null, restOfYear: null };
}

function split(first60Days: number | null, restOfYear: number | null): Contributions {
  return { yearToDate: null, first60Days, restOfYear };
}

function account(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "RRSP 0001",
    kind: "RRSP",
    style: "self-directed",
    purpose: "retirement",
    inTotals: true,
    firstPeriod: "2026-01",
    lastPeriod: "2026-03",
    statementCount: 2,
    typeHistory: ["Self-directed RRSP Account"],
    ...over,
  };
}

describe("buildSeries", () => {
  test("reads marketValue, bookCost, cashBalance and deposits from a BROKERAGE statement's own fields", () => {
    const paidIn = {
      deposits: 0,
      proceedsFromSales: 0,
      dividends: 0,
      interestEarned: 0,
      stockLendingIncome: 0,
      other: 0,
    };
    const jan = statement({
      source: src("2026-01", "BROKERAGE"),
      portfolio: portfolio(10000, 9500),
      cash: [cadCash({ closing: 500, paidIn: { ...paidIn, deposits: 300 } })],
    });
    const feb = statement({
      source: src("2026-02", "BROKERAGE"),
      portfolio: portfolio(11000, 10200),
      cash: [cadCash({ closing: 650, paidIn: { ...paidIn, deposits: 100 } })],
    });

    const [series] = buildSeries([jan, feb], [account()]);

    expect(series?.months).toHaveLength(2);
    expect(series?.months[0]).toMatchObject({
      period: "2026-01",
      marketValue: 10000,
      bookCost: 9500,
      cashBalance: 500,
      deposits: 300,
    });
    expect(series?.months[1]).toMatchObject({
      period: "2026-02",
      marketValue: 11000,
      bookCost: 10200,
      cashBalance: 650,
      deposits: 100,
    });
  });

  test("leaves a month with no statement absent rather than zero-filled", () => {
    const jan = statement({ source: src("2026-01", "BROKERAGE") });
    const march = statement({ source: src("2026-03", "BROKERAGE") });

    const [series] = buildSeries([jan, march], [account()]);

    expect(series?.months.map((m) => m.period)).toEqual(["2026-01", "2026-03"]);
  });

  test("skips PERFORMANCE statements entirely rather than double-counting their BROKERAGE twin", () => {
    const brokerage = statement({ source: src("2026-01", "BROKERAGE") });
    const performance = statement({
      source: src("2026-01", "PERFORMANCE"),
      portfolio: portfolio(999_999, 999_999),
    });

    // performance listed first: without the PERFORMANCE skip it would be
    // the first-seen entry for this period and would win outright.
    const [series] = buildSeries([performance, brokerage], [account()]);

    expect(series?.months).toHaveLength(1);
    expect(series?.months[0]?.marketValue).toBe(10000);
  });

  test("a CASH-template statement carries a cash balance but no portfolio, not an invented zero", () => {
    const chequing = statement({
      source: src("2026-01", "CASH", "acct_0002"),
      accountType: "Chequing Account",
      portfolio: null,
      cash: [
        cadCash({ closing: 1488.52, totalIn: null, totalOut: null, paidIn: null, paidOut: null }),
      ],
    });
    const chequingAccount = account({
      maskedId: "acct_0002",
      shortId: "0002",
      kind: "Chequing",
      inTotals: false,
    });

    const [series] = buildSeries([chequing], [chequingAccount]);

    expect(series?.months[0]).toMatchObject({
      period: "2026-01",
      marketValue: null,
      bookCost: null,
      cashBalance: 1488.52,
      deposits: 0,
      withdrawals: 0,
    });
  });

  test("prefers the BROKERAGE statement over a CASH statement in the same period", () => {
    const brokerage = statement({
      source: src("2026-01", "BROKERAGE"),
      portfolio: portfolio(10000, 9500),
    });
    const cash = statement({ source: src("2026-01", "CASH"), portfolio: null });

    const [series] = buildSeries([cash, brokerage], [account()]);

    expect(series?.months).toHaveLength(1);
    expect(series?.months[0]?.marketValue).toBe(10000);
  });

  test("returns one series per registry account, keyed on maskedId, with kind/style/purpose/inTotals carried over", () => {
    const other = account({ maskedId: "acct_0002", shortId: "0002" });
    const [first, second] = buildSeries([statement()], [account(), other]);

    expect(first?.months).toHaveLength(1);
    expect(second?.months).toHaveLength(0);
    expect(second).toMatchObject({
      maskedId: "acct_0002",
      shortId: "0002",
      kind: "RRSP",
      style: "self-directed",
      purpose: "retirement",
      inTotals: true,
    });
  });
});

describe("buildSeries contributions", () => {
  test("a three-month run of stated year-to-date figures yields the deltas between them", () => {
    const jan = statement({ source: src("2026-01", "BROKERAGE"), contributions: ytd(1000) });
    const feb = statement({ source: src("2026-02", "BROKERAGE"), contributions: ytd(2500) });
    const mar = statement({ source: src("2026-03", "BROKERAGE"), contributions: ytd(2500) });

    const [series] = buildSeries([jan, feb, mar], [account()]);

    expect(series?.months.map((m) => m.contributions)).toEqual([1000, 1500, 0]);
    expect(series?.months.map((m) => m.contributionMonthsSpanned)).toEqual([1, 1, 1]);
  });

  test("January's contribution is its own year-to-date figure, not a delta against December", () => {
    const dec = statement({ source: src("2025-12", "BROKERAGE"), contributions: ytd(9000) });
    const jan = statement({ source: src("2026-01", "BROKERAGE"), contributions: ytd(400) });

    const [series] = buildSeries([dec, jan], [account()]);

    expect(series?.months[1]).toMatchObject({
      period: "2026-01",
      contributions: 400,
      contributionMonthsSpanned: 1,
    });
  });

  test("a missing month's contribution is folded into the next stated figure and flagged with the span", () => {
    const jan = statement({ source: src("2026-01", "BROKERAGE"), contributions: ytd(1000) });
    // February has no statement at all.
    const mar = statement({ source: src("2026-03", "BROKERAGE"), contributions: ytd(4000) });

    const [series] = buildSeries([jan, mar], [account()]);

    expect(series?.months[1]).toMatchObject({
      period: "2026-03",
      contributions: 3000,
      contributionMonthsSpanned: 2,
    });
  });

  test("a present statement stating no contributions figure leaves the month null rather than zero", () => {
    const jan = statement({ source: src("2026-01", "BROKERAGE"), contributions: ytd(1000) });
    const feb = statement({ source: src("2026-02", "BROKERAGE"), contributions: null });
    const mar = statement({ source: src("2026-03", "BROKERAGE"), contributions: ytd(4000) });

    const [series] = buildSeries([jan, feb, mar], [account()]);

    expect(series?.months[1]).toMatchObject({ period: "2026-02", contributions: null });
    expect(series?.months[2]).toMatchObject({
      period: "2026-03",
      contributions: 3000,
      contributionMonthsSpanned: 2,
    });
  });

  test("the first-60-days/rest-of-year split is preserved verbatim, never derived from a delta", () => {
    const feb = statement({ source: src("2026-02", "BROKERAGE"), contributions: split(0, 0) });
    const mar = statement({ source: src("2026-03", "BROKERAGE"), contributions: split(0, 3000) });

    const [series] = buildSeries([feb, mar], [account()]);

    expect(series?.months[0]).toMatchObject({
      contributionFirst60Days: 0,
      contributionRestOfYear: 0,
    });
    expect(series?.months[1]).toMatchObject({
      contributions: 3000,
      contributionFirst60Days: 0,
      contributionRestOfYear: 3000,
    });
  });

  test("a statement with no contributions object leaves the split fields null too", () => {
    const jan = statement({ source: src("2026-01", "BROKERAGE"), contributions: null });

    const [series] = buildSeries([jan], [account()]);

    expect(series?.months[0]).toMatchObject({
      contributions: null,
      contributionFirst60Days: null,
      contributionRestOfYear: null,
    });
  });

  test("contributionsByYear totals each calendar year to its last stated year-to-date figure", () => {
    const dec25 = statement({ source: src("2025-12", "BROKERAGE"), contributions: ytd(9000) });
    const jan26 = statement({ source: src("2026-01", "BROKERAGE"), contributions: ytd(400) });
    const feb26 = statement({ source: src("2026-02", "BROKERAGE"), contributions: ytd(1200) });

    const [series] = buildSeries([dec25, jan26, feb26], [account()]);

    expect(series?.contributionsByYear).toEqual({ "2025": 9000, "2026": 1200 });
  });
});
