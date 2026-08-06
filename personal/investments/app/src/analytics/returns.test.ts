import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { CashSummary, PortfolioSummary, Returns, Statement } from "../types";
import { buildReturns } from "./returns";
import type { AccountSeries, MonthPoint } from "./types";

function series(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    kind: "TFSA" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned",
    inTotals: true,
    months: [],
    contributionsByYear: {},
    ...overrides,
  };
}

function monthPoint(over: Partial<MonthPoint> = {}): MonthPoint {
  return {
    period: "2026-01",
    marketValue: null,
    bookCost: null,
    cashBalance: null,
    deposits: 0,
    withdrawals: 0,
    contributions: null,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: null,
    grants: 0,
    ...over,
  };
}

function src(accountNo: string, period: string, template: "BROKERAGE" | "PERFORMANCE") {
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
    closing: 0,
    totalIn: 0,
    totalOut: 0,
    paidIn: null,
    paidOut: null,
    ...overrides,
  };
}

function returns(over: Partial<Returns> = {}): Returns {
  return {
    currentPeriod: null,
    oneYear: null,
    threeYears: null,
    fiveYears: null,
    tenYears: null,
    sinceInception: null,
    ...over,
  };
}

function performanceStatement(over: Partial<Statement> = {}): Statement {
  return {
    source: src("acct_0001", "2026-02", "PERFORMANCE"),
    accountType: "Self-directed TFSA Account",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    portfolio: portfolio(10000, 9000),
    cash: [cadCash()],
    holdings: [],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: returns(),
    balances: {
      start: 9000,
      deposits: 500,
      withdrawals: 0,
      changeInMarketValue: 500,
      end: 10000,
    },
    ...over,
  };
}

describe("buildReturns", () => {
  test("an account with a PERFORMANCE statement gets a stated point per statement, in period order", () => {
    const account = series({ maskedId: "acct_perf" });
    const jan = performanceStatement({
      source: src("acct_perf", "2026-01", "PERFORMANCE"),
      returns: returns({ currentPeriod: 2.1, sinceInception: 13.41 }),
    });
    const feb = performanceStatement({
      source: src("acct_perf", "2026-02", "PERFORMANCE"),
      returns: returns({ currentPeriod: 1.5, sinceInception: 13.9 }),
    });

    // Statements pushed out of order to prove buildReturns sorts by period
    // rather than trusting input order.
    const [result] = buildReturns([account], [feb, jan]);

    expect(result?.points.map((p) => p.period)).toEqual(["2026-01", "2026-02"]);
    expect(result?.points[0]).toEqual({
      period: "2026-01",
      statedMwr: returns({ currentPeriod: 2.1, sinceInception: 13.41 }),
      periodReturn: null,
      reason: null,
      source: "stated",
    });
  });

  test("a null stated rate stays null and is never coerced to a measured zero", () => {
    const account = series({ maskedId: "acct_perf" });
    // A horizon shorter than the account's life prints 0.00% on the
    // statement, already parsed upstream to null -- "not applicable", not
    // "returned nothing".
    const statement = performanceStatement({
      source: src("acct_perf", "2026-02", "PERFORMANCE"),
      returns: returns({ currentPeriod: null, sinceInception: 10.31 }),
    });

    const [result] = buildReturns([account], [statement]);

    expect(result?.points[0]?.statedMwr?.currentPeriod).toBeNull();
    expect(result?.points[0]?.statedMwr?.sinceInception).toBe(10.31);
  });

  test("an account with no PERFORMANCE statement gets a derived period return instead, in percent", () => {
    const account = series({
      maskedId: "acct_derived",
      months: [
        monthPoint({ period: "2026-01", marketValue: 10000, bookCost: 9500 }),
        // Book cost rises by exactly netDeposits (500), so the flow
        // reconciles and the market-value move is trusted as performance.
        monthPoint({
          period: "2026-02",
          marketValue: 10800,
          bookCost: 10000,
          deposits: 500,
          withdrawals: 0,
        }),
      ],
    });

    const [result] = buildReturns([account], []);

    expect(result?.points).toHaveLength(2);
    expect(result?.points[0]).toEqual({
      period: "2026-01",
      statedMwr: null,
      periodReturn: null,
      reason: "no-prior-period",
      source: "derived",
    });
    // (10800 - 10000 - 500) / 10000 = 0.03, times 100 = 3 -- percent, not a fraction.
    expect(result?.points[1]?.periodReturn).toBeCloseTo(3);
    expect(result?.points[1]?.reason).toBeNull();
    expect(result?.points[1]?.source).toBe("derived");
    expect(result?.points[1]?.statedMwr).toBeNull();
  });

  test("a derived percent and a stated percent of the same real return produce the same number", () => {
    const derivedAccount = series({
      maskedId: "acct_derived",
      months: [
        monthPoint({ period: "2026-01", marketValue: 1000, bookCost: 900 }),
        // No flow at all: book cost unchanged, netDeposits zero -- a clean 5% gain.
        monthPoint({ period: "2026-02", marketValue: 1050, bookCost: 900 }),
      ],
    });
    const statedAccount = series({ maskedId: "acct_stated" });
    const statement = performanceStatement({
      source: src("acct_stated", "2026-02", "PERFORMANCE"),
      returns: returns({ currentPeriod: 5 }),
    });

    const [derivedResult, statedResult] = buildReturns(
      [derivedAccount, statedAccount],
      [statement],
    );

    expect(derivedResult?.points[1]?.periodReturn).toBeCloseTo(5);
    expect(statedResult?.points[0]?.statedMwr?.currentPeriod).toBe(5);
  });

  test("a withdrawal reduces net deposits in the derived formula", () => {
    const account = series({
      maskedId: "acct_derived",
      months: [
        monthPoint({ period: "2026-01", marketValue: 10000, bookCost: 9000 }),
        // Book cost falls by exactly netDeposits (-200), so the flow reconciles.
        monthPoint({
          period: "2026-02",
          marketValue: 9700,
          bookCost: 8800,
          deposits: 0,
          withdrawals: 200,
        }),
      ],
    });

    const [result] = buildReturns([account], []);

    // (9700 - 10000 - (0 - 200)) / 10000 = -0.01, times 100 = -1.
    expect(result?.points[1]?.periodReturn).toBeCloseTo(-1);
    expect(result?.points[1]?.reason).toBeNull();
  });

  test("a missing prior market value derives null rather than a nonsense return", () => {
    const account = series({
      maskedId: "acct_cash",
      months: [
        // A CASH-template statement: no portfolio, so no market value.
        monthPoint({ period: "2026-01", marketValue: null }),
        monthPoint({ period: "2026-02", marketValue: 5000 }),
      ],
    });

    const [result] = buildReturns([account], []);

    expect(result?.points[1]?.periodReturn).toBeNull();
    expect(result?.points[1]?.reason).toBe("insufficient-data");
  });

  test("a zero prior market value derives null instead of Infinity or NaN", () => {
    const account = series({
      maskedId: "acct_zero",
      months: [
        monthPoint({ period: "2026-01", marketValue: 0 }),
        monthPoint({ period: "2026-02", marketValue: 500, deposits: 500 }),
      ],
    });

    const [result] = buildReturns([account], []);

    const value = result?.points[1]?.periodReturn;
    expect(value).toBeNull();
    expect(value === null || Number.isFinite(value)).toBe(true);
    expect(result?.points[1]?.reason).toBe("insufficient-data");
  });

  test("a book-cost change that tracks the cash deposits survives as a trusted return, even a large one", () => {
    // Real corpus shape (masked): $1,250 of cash deposits, $1,651 of
    // book-cost movement, on a $25,640.57 start value -- a 1.6% gap, well
    // within statement noise, against a genuine 39% market swing.
    const account = series({
      maskedId: "acct_volatile",
      months: [
        monthPoint({ period: "2026-04", marketValue: 25640.57, bookCost: 23323.71 }),
        monthPoint({
          period: "2026-05",
          marketValue: 36900.27,
          bookCost: 24975.18,
          deposits: 1250,
          withdrawals: 0,
        }),
      ],
    });

    const [result] = buildReturns([account], []);

    expect(result?.points[1]?.reason).toBeNull();
    expect(result?.points[1]?.periodReturn).toBeCloseTo(39.04, 1);
  });

  test("a book-cost change that does not track cash deposits is flagged, not published as performance", () => {
    // Real corpus shape (masked): only $97.50 of cash deposits, but book
    // cost jumped $1,268.34 -- money arrived as an in-kind security
    // transfer the cash block never saw. The naive formula reads this as a
    // 186% return; it must come back null with a reason instead.
    const account = series({
      maskedId: "acct_transfer",
      months: [
        monthPoint({ period: "2023-07", marketValue: 695.32, bookCost: 750.72 }),
        monthPoint({
          period: "2023-08",
          marketValue: 2089.82,
          bookCost: 2019.06,
          deposits: 97.5,
          withdrawals: 0,
        }),
      ],
    });

    const [result] = buildReturns([account], []);

    expect(result?.points[1]?.periodReturn).toBeNull();
    expect(result?.points[1]?.reason).toBe("unreconciled-flow");
  });

  test("book cost missing on one end cannot be verified and is flagged rather than trusted", () => {
    const account = series({
      maskedId: "acct_no_bookcost",
      months: [
        monthPoint({ period: "2026-01", marketValue: 1000, bookCost: 900 }),
        // bookCost stays null -- as if the statement carried no portfolio
        // breakdown for the closing balance -- even though marketValue is
        // known and would otherwise arithmetic out to a plausible +10%.
        monthPoint({ period: "2026-02", marketValue: 1100, bookCost: null }),
      ],
    });

    const [result] = buildReturns([account], []);

    expect(result?.points[1]?.periodReturn).toBeNull();
    expect(result?.points[1]?.reason).toBe("unreconciled-flow");
  });

  test("PERFORMANCE statements for a different account do not leak into this one's points", () => {
    const account = series({ maskedId: "acct_a" });
    const otherAccount = performanceStatement({ source: src("acct_b", "2026-01", "PERFORMANCE") });

    const [result] = buildReturns([account], [otherAccount]);

    // acct_a has no statements of its own and no PERFORMANCE statement, so
    // it falls back to deriving from an empty months array -- zero points,
    // not the other account's stated point.
    expect(result?.points).toEqual([]);
  });

  test("one ReturnSeries per account, in the order series were given", () => {
    const a = series({ maskedId: "acct_a" });
    const b = series({ maskedId: "acct_b" });

    const result = buildReturns([a, b], []);

    expect(result.map((r) => r.maskedId)).toEqual(["acct_a", "acct_b"]);
  });
});
