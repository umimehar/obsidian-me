import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { ActivityRow, Holding, Statement } from "../types";
import { buildIncome, estimateTax } from "./income";
import type { AccountSeries } from "./types";

function series(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "NonRegistered 0001",
    kind: "NonRegistered" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned",
    inTotals: true,
    months: [],
    contributionsByYear: {},
    ...overrides,
  };
}

function src(
  accountNo: string,
  period: string,
  template: "BROKERAGE" | "PERFORMANCE" = "BROKERAGE",
) {
  return {
    file: `${accountNo}_${period}_${template}.pdf`,
    accountNo,
    period,
    template,
    version: 0,
  };
}

function activityRow(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    date: "2026-01-15",
    postedDate: null,
    code: "",
    description: "",
    debit: 0,
    credit: 0,
    balance: 0,
    currency: "CAD",
    ...over,
  };
}

function holding(over: Partial<Holding> = {}): Holding {
  return {
    name: "Test Holding",
    symbol: "TST",
    quantity: 10,
    segregatedQuantity: 10,
    marketPrice: 10,
    priceCurrency: "CAD",
    marketValue: 100,
    marketValueConverted: false,
    bookCost: 50,
    assetClass: "Canadian Equities",
    pendingValuation: false,
    bookCostConverted: false,
    ...over,
  };
}

function statement(over: Partial<Statement> = {}): Statement {
  return {
    source: src("acct_0001", "2026-02"),
    accountType: "Non-Registered Cash Account",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    portfolio: null,
    cash: [],
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

describe("buildIncome", () => {
  test("sums CAD DIV credits as eligible dividends and USD DIV credits as foreign income", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      activity: [
        activityRow({ code: "DIV", credit: 100, currency: "CAD" }),
        activityRow({ code: "DIV", credit: 40, currency: "USD" }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.eligibleDividends).toBe(100);
    expect(income.foreignIncome).toBe(40);
  });

  test("sums INT credits as interest", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      activity: [activityRow({ code: "INT", credit: 12.5, currency: "CAD" })],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.interest).toBe(12.5);
  });

  test("a corporate account's dividends contribute nothing to the personal estimate", () => {
    const corporate = series({ maskedId: "acct_corp", kind: "Corporate" as AccountKind });
    const nonRegistered = series({ maskedId: "acct_nr", kind: "NonRegistered" as AccountKind });
    const corpStatement = statement({
      source: src("acct_corp", "2026-03"),
      activity: [activityRow({ code: "DIV", credit: 645, currency: "CAD" })],
    });
    const personalStatement = statement({
      source: src("acct_nr", "2026-03"),
      activity: [activityRow({ code: "DIV", credit: 202, currency: "CAD" })],
    });
    const income = buildIncome(
      [corporate, nonRegistered],
      [corpStatement, personalStatement],
      2026,
      new Set(["acct_corp", "acct_nr"]),
    );
    // Regression guard for the bug that inflated 2026 eligible dividends
    // from $202 to $645 by letting the corporate account's dividends leak
    // into the personal estimate. Only the NonRegistered account's $202
    // may show up here.
    expect(income.eligibleDividends).toBe(202);
  });

  test("a TFSA's dividends contribute nothing to the personal estimate", () => {
    const tfsa = series({ maskedId: "acct_tfsa", kind: "TFSA" as AccountKind });
    const nonRegistered = series({ maskedId: "acct_nr", kind: "NonRegistered" as AccountKind });
    const tfsaStatement = statement({
      source: src("acct_tfsa", "2026-03"),
      activity: [activityRow({ code: "DIV", credit: 300, currency: "CAD" })],
    });
    const personalStatement = statement({
      source: src("acct_nr", "2026-03"),
      activity: [activityRow({ code: "DIV", credit: 50, currency: "CAD" })],
    });
    const income = buildIncome(
      [tfsa, nonRegistered],
      [tfsaStatement, personalStatement],
      2026,
      new Set(["acct_tfsa", "acct_nr"]),
    );
    expect(income.eligibleDividends).toBe(50);
  });

  test("an account outside the caller's scope contributes nothing even when it is a taxable kind", () => {
    const inScope = series({ maskedId: "acct_in" });
    const outOfScope = series({ maskedId: "acct_out" });
    const inStatement = statement({
      source: src("acct_in", "2026-03"),
      activity: [activityRow({ code: "DIV", credit: 10, currency: "CAD" })],
    });
    const outStatement = statement({
      source: src("acct_out", "2026-03"),
      activity: [activityRow({ code: "DIV", credit: 999, currency: "CAD" })],
    });
    const income = buildIncome(
      [inScope, outOfScope],
      [inStatement, outStatement],
      2026,
      new Set(["acct_in"]),
    );
    expect(income.eligibleDividends).toBe(10);
  });

  test("a PERFORMANCE statement's duplicated activity does not double-count", () => {
    const account = series({ maskedId: "acct_nr" });
    const brokerage = statement({
      source: src("acct_nr", "2026-03", "BROKERAGE"),
      activity: [activityRow({ code: "DIV", credit: 100, currency: "CAD" })],
    });
    const performance = statement({
      source: src("acct_nr", "2026-03", "PERFORMANCE"),
      activity: [activityRow({ code: "DIV", credit: 100, currency: "CAD" })],
    });
    const income = buildIncome([account], [brokerage, performance], 2026, new Set(["acct_nr"]));
    expect(income.eligibleDividends).toBe(100);
  });

  test("only sums activity within the target year", () => {
    const account = series({ maskedId: "acct_nr" });
    const thisYear = statement({
      source: src("acct_nr", "2026-03"),
      activity: [activityRow({ code: "DIV", credit: 100, currency: "CAD" })],
    });
    const lastYear = statement({
      source: src("acct_nr", "2025-03"),
      activity: [activityRow({ code: "DIV", credit: 500, currency: "CAD" })],
    });
    const income = buildIncome([account], [thisYear, lastYear], 2026, new Set(["acct_nr"]));
    expect(income.eligibleDividends).toBe(100);
  });

  test("realized gains are proceeds minus average cost from the preceding statement's holding", () => {
    const account = series({ maskedId: "acct_nr" });
    const january = statement({
      source: src("acct_nr", "2026-01"),
      holdings: [holding({ symbol: "ENB", quantity: 20, bookCost: 400 })], // $20/share average cost
    });
    const february = statement({
      source: src("acct_nr", "2026-02"),
      holdings: [holding({ symbol: "ENB", quantity: 8, bookCost: 160 })],
      activity: [
        activityRow({
          code: "SELL",
          credit: 650.88,
          description: "ENB - Enbridge Inc: Sold 12.0000 shares (executed at 2026-02-14)",
        }),
      ],
    });
    const income = buildIncome([account], [january, february], 2026, new Set(["acct_nr"]));
    // proceeds 650.88 - (12 shares * $20 average cost) = 410.88
    expect(income.realizedGains).toBeCloseTo(410.88, 2);
  });

  test("a sale with no preceding holding for its symbol is excluded from realized gains", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-02"),
      activity: [
        activityRow({
          code: "SELL",
          credit: 650.88,
          description: "ENB - Enbridge Inc: Sold 12.0000 shares (executed at 2026-02-14)",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.realizedGains).toBe(0);
  });

  test("realized gains from a registered or corporate account never reach the total", () => {
    const tfsa = series({ maskedId: "acct_tfsa", kind: "TFSA" as AccountKind });
    const january = statement({
      source: src("acct_tfsa", "2026-01"),
      holdings: [holding({ symbol: "ENB", quantity: 20, bookCost: 400 })],
    });
    const february = statement({
      source: src("acct_tfsa", "2026-02"),
      holdings: [],
      activity: [
        activityRow({
          code: "SELL",
          credit: 650.88,
          description: "ENB - Enbridge Inc: Sold 20.0000 shares (executed at 2026-02-14)",
        }),
      ],
    });
    const income = buildIncome([tfsa], [january, february], 2026, new Set(["acct_tfsa"]));
    expect(income.realizedGains).toBe(0);
  });
});

describe("estimateTax", () => {
  test("subtracts RRSP actually contributed this year, then applies the flat rate", () => {
    const income = { interest: 10, eligibleDividends: 200, foreignIncome: 40, realizedGains: 750 };
    const estimate = estimateTax(income, 500, 0.3);
    // total income 1000, minus 500 contributed = 500 taxable, at 30% = 150
    expect(estimate.taxableIncome).toBe(500);
    expect(estimate.rrspDeduction).toBe(500);
    expect(estimate.estimatedTax).toBeCloseTo(150, 5);
  });

  test("floors taxable income at zero rather than going negative", () => {
    const income = { interest: 0, eligibleDividends: 100, foreignIncome: 0, realizedGains: 0 };
    const estimate = estimateTax(income, 5000, 0.3);
    expect(estimate.taxableIncome).toBe(0);
    expect(estimate.estimatedTax).toBe(0);
  });

  test("always carries the not-for-filing disclaimer", () => {
    const income = { interest: 0, eligibleDividends: 0, foreignIncome: 0, realizedGains: 0 };
    const estimate = estimateTax(income, 0, 0.3);
    expect(estimate.disclaimer.length).toBeGreaterThan(0);
    expect(estimate.disclaimer.toLowerCase()).toContain("not a filing figure");
  });

  test("uses room contributed, not unused room -- the caller supplies the contributed figure directly", () => {
    const income = { interest: 0, eligibleDividends: 1000, foreignIncome: 0, realizedGains: 0 };
    const contributedThisYear = 1000;
    const estimate = estimateTax(income, contributedThisYear, 0.3);
    expect(estimate.rrspDeduction).toBe(1000);
    expect(estimate.taxableIncome).toBe(0);
  });
});
