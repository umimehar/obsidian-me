import { describe, expect, test } from "bun:test";
import type { AccountRecord } from "../store/registry";
import type {
  ActivityRow,
  CashSummary,
  Contributions,
  PortfolioSummary,
  Statement,
} from "../types";
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

function activity(code: string, credit: number, over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    date: "2026-01-15",
    postedDate: null,
    code,
    description: `${code} activity`,
    debit: 0,
    credit,
    balance: 0,
    currency: "CAD",
    ...over,
  };
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
  test("carries the registry account's label through to the series", () => {
    const jan = statement({ source: src("2026-01", "BROKERAGE") });
    const [series] = buildSeries([jan], [account({ label: "Spousal RRSP" })]);
    expect(series?.label).toBe("Spousal RRSP");
  });

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
    expect(series?.months.map((m) => m.contributionsSource)).toEqual([
      "stated",
      "stated",
      "stated",
    ]);
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

  test("on a stated account, a statement with no contributions object leaves the split fields null too", () => {
    const jan = statement({ source: src("2026-01", "BROKERAGE"), contributions: null });
    // A later statement carries a stated figure, so the account is on the
    // stated path -- otherwise a wholly-null account falls to derivation
    // (see the "buildSeries derived contributions" suite below).
    const feb = statement({ source: src("2026-02", "BROKERAGE"), contributions: ytd(500) });

    const [series] = buildSeries([jan, feb], [account()]);

    expect(series?.months[0]).toMatchObject({
      contributions: null,
      contributionFirst60Days: null,
      contributionRestOfYear: null,
      contributionsSource: null,
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

describe("buildSeries derived contributions", () => {
  test("an account that states no contributions block on any statement derives from CONT and EFT activity", () => {
    const jan = statement({
      source: src("2026-01", "BROKERAGE"),
      contributions: null,
      activity: [activity("CONT", 500), activity("BUY", 0, { debit: 500, credit: 0 })],
    });
    const may = statement({
      source: src("2026-05", "BROKERAGE"),
      contributions: null,
      activity: [activity("EFT", 200)],
    });

    const [series] = buildSeries([jan, may], [account()]);

    expect(series?.months[0]).toMatchObject({ contributions: 500, contributionsSource: "derived" });
    expect(series?.months[1]).toMatchObject({ contributions: 200, contributionsSource: "derived" });
    expect(series?.contributionsByYear).toEqual({ "2026": 700 });
  });

  test("a DEP credit never reaches a wrapper with an annual room bar, whatever route derived it", () => {
    // Every statement's own legend prints "DEP - Non-contribution deposit".
    // Counting it against TFSA, RRSP, SpousalRRSP or FHSA room would put
    // money on a room bar that the document says was not a contribution.
    const dep = (period: string) =>
      statement({
        source: src(period, "BROKERAGE"),
        contributions: null,
        activity: [activity("DEP", 900, { date: `${period}-04` })],
      });
    const kinds = ["TFSA", "RRSP", "SpousalRRSP", "FHSA"] as const;

    for (const kind of kinds) {
      // Wholly derived: no statement states a figure anywhere.
      const [derivedRoute] = buildSeries([dep("2026-05")], [account({ kind })]);
      expect(derivedRoute?.months[0]?.contributions).toBe(0);

      // The trailing-hole route: a stated figure, then a month with none.
      const stated = statement({ source: src("2026-01", "BROKERAGE"), contributions: ytd(100) });
      const [statedRoute] = buildSeries([stated, dep("2026-05")], [account({ kind })]);
      expect(statedRoute?.months[1]?.contributions).toBe(0);
      expect(statedRoute?.contributionsByYear).toEqual({ "2026": 100 });
    }
  });

  test("the RESP still counts a DEP credit, the one wrapper CRA counts every dollar into", () => {
    // The corpus case: $450 of real RESP contributions arrived under DEP,
    // and the $50,000 lifetime cap counts a subscriber's money however it
    // arrived. The RESP has no annual room bar for this to inflate.
    const may = statement({
      source: src("2026-05", "BROKERAGE"),
      contributions: null,
      activity: [activity("DEP", 450)],
    });

    const [series] = buildSeries([may], [account({ kind: "RESP" })]);

    expect(series?.months[0]).toMatchObject({ contributions: 450, contributionsSource: "derived" });
  });

  test("a GRANT credit does not count toward derived contributions", () => {
    const feb = statement({
      source: src("2026-02", "BROKERAGE"),
      contributions: null,
      activity: [activity("GRANT", 500), activity("CLB", 100)],
    });

    const [series] = buildSeries([feb], [account()]);

    expect(series?.months[0]).toMatchObject({ contributions: 0, contributionsSource: "derived" });
  });

  test("a transfer between the owner's own accounts does not count toward derived contributions", () => {
    const mar = statement({
      source: src("2026-03", "BROKERAGE"),
      contributions: null,
      activity: [activity("TRFINTF", 1000), activity("TRFOUT", 1000)],
    });

    const [series] = buildSeries([mar], [account()]);

    expect(series?.months[0]).toMatchObject({ contributions: 0, contributionsSource: "derived" });
  });

  test("a derived account with no matching activity in a month reads zero, not null", () => {
    const jun = statement({
      source: src("2026-06", "BROKERAGE"),
      contributions: null,
      activity: [],
    });

    const [series] = buildSeries([jun], [account()]);

    expect(series?.months[0]).toMatchObject({ contributions: 0, contributionsSource: "derived" });
  });

  test("an unstated month BEFORE the year's last stated figure never derives, since that figure already covers it", () => {
    const jan = statement({
      source: src("2026-01", "BROKERAGE"),
      contributions: ytd(1000),
      activity: [activity("CONT", 9999)],
    });
    const feb = statement({
      source: src("2026-02", "BROKERAGE"),
      contributions: null,
      activity: [activity("CONT", 9999)],
    });
    const mar = statement({
      source: src("2026-03", "BROKERAGE"),
      contributions: ytd(4000),
      activity: [],
    });

    const [series] = buildSeries([jan, feb, mar], [account()]);

    // February states no figure of its own, but March's stated year-to-date
    // figure is authoritative and already includes whatever February brought.
    // Deriving $9,999 here would double-count it against March's $3,000 delta.
    expect(series?.months[1]).toMatchObject({ contributions: null, contributionsSource: null });
    expect(series?.months[2]).toMatchObject({ contributions: 3000, contributionsSource: "stated" });
    expect(series?.contributionsByYear).toEqual({ "2026": 4000 });
  });
});

describe("buildSeries trailing unstated months", () => {
  test("a stated account whose statements stop stating figures derives the rest of the year from activity", () => {
    const sep = statement({
      source: src("2025-09", "BROKERAGE"),
      contributions: split(0, 2000),
      activity: [activity("CONT", 2000, { date: "2025-09-13" })],
    });
    const oct = statement({
      source: src("2025-10", "BROKERAGE"),
      contributions: null,
      activity: [activity("CONT", 1000, { date: "2025-10-14" })],
    });
    const nov = statement({ source: src("2025-11", "BROKERAGE"), contributions: null });

    const [series] = buildSeries([sep, oct, nov], [account()]);

    expect(series?.months[0]).toMatchObject({ contributions: 2000, contributionsSource: "stated" });
    expect(series?.months[1]).toMatchObject({
      contributions: 1000,
      contributionsSource: "derived",
    });
    expect(series?.months[2]).toMatchObject({ contributions: 0, contributionsSource: "derived" });
    expect(series?.contributionsByYear).toEqual({ "2025": 3000 });
  });

  test("a year whose statements never state a figure derives all of it, even when an earlier year did", () => {
    const dec24 = statement({ source: src("2024-12", "BROKERAGE"), contributions: ytd(5000) });
    const jun25 = statement({
      source: src("2025-06", "BROKERAGE"),
      contributions: null,
      activity: [activity("CONT", 700, { date: "2025-06-02" })],
    });

    const [series] = buildSeries([dec24, jun25], [account()]);

    expect(series?.months[1]).toMatchObject({ contributions: 700, contributionsSource: "derived" });
    expect(series?.contributionsByYear).toEqual({ "2024": 5000, "2025": 700 });
  });

  test("a trailing derived month carries a span of one, never a span borrowed from the gap it follows", () => {
    const jan = statement({ source: src("2026-01", "BROKERAGE"), contributions: ytd(1000) });
    const jun = statement({
      source: src("2026-06", "BROKERAGE"),
      contributions: null,
      activity: [activity("CONT", 300, { date: "2026-06-02" })],
    });

    const [series] = buildSeries([jan, jun], [account()]);

    expect(series?.months[1]).toMatchObject({
      contributions: 300,
      contributionMonthsSpanned: 1,
      contributionsSource: "derived",
    });
  });

  test("a trailing derived month leaves the verbatim first-60-days/rest-of-year fields null", () => {
    const feb = statement({ source: src("2026-02", "BROKERAGE"), contributions: split(0, 500) });
    const mar = statement({
      source: src("2026-03", "BROKERAGE"),
      contributions: null,
      activity: [activity("CONT", 250, { date: "2026-03-02" })],
    });

    const [series] = buildSeries([feb, mar], [account()]);

    expect(series?.months[1]).toMatchObject({
      contributionFirst60Days: null,
      contributionRestOfYear: null,
    });
  });
});
