import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { ActivityRow, Holding, Statement } from "../types";
import { buildIncome } from "./income";
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
  test("a USD sale's proceeds are converted to CAD at the statement's own fxRate before costing", () => {
    const account = series({ maskedId: "acct_nr" });
    const january = statement({
      source: src("acct_nr", "2026-01"),
      holdings: [holding({ symbol: "ENB", quantity: 20, bookCost: 400, priceCurrency: "USD" })],
    });
    const february = statement({
      source: src("acct_nr", "2026-02"),
      fxRate: 1.4,
      holdings: [holding({ symbol: "ENB", quantity: 8, bookCost: 160, priceCurrency: "USD" })],
      activity: [
        activityRow({
          code: "SELL",
          credit: 100,
          currency: "USD",
          description: "ENB - Enbridge Inc: Sold 12.0000 shares (executed at 2026-02-14)",
        }),
      ],
    });
    const income = buildIncome([account], [january, february], 2026, new Set(["acct_nr"]));
    // proceeds 100 USD * 1.4 = 140 CAD, minus 12 shares * $20 average cost = -100
    expect(income.realizedGains).toBeCloseTo(-100, 2);
  });

  test("a symbol bought and sold within the same statement is costed off that statement's BUY rows", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-02"),
      activity: [
        activityRow({
          code: "BUY",
          debit: 200,
          description: "ENB - Enbridge Inc: Bought 10.0000 shares (executed at 2026-02-10)",
        }),
        activityRow({
          code: "SELL",
          credit: 130,
          description: "ENB - Enbridge Inc: Sold 5.0000 shares (executed at 2026-02-14)",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    // average cost $20/share, proceeds 130 - (5 * 20) = 30
    expect(income.realizedGains).toBeCloseTo(30, 2);
    expect(income.costUnknownSales).toBe(0);
  });

  test("a sale with no prior holding and no same statement BUY has an unknown cost, not a zero gain masquerading as one", () => {
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
    expect(income.costUnknownSales).toBe(1);
  });

  test("a CAD paid dividend on a USD priced holding is foreign", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      holdings: [holding({ symbol: "AAPL", priceCurrency: "USD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 165.82,
          currency: "CAD",
          description: "AAPL - Apple Inc: Cash dividend distribution, received on 2026-03-10",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.foreignDividends).toBe(165.82);
    expect(income.canadianDistributions).toBe(0);
  });

  test("a CAD listed ETF distribution is Canadian, not an eligible dividend by name", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 50,
          currency: "CAD",
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.canadianDistributions).toBe(50);
    expect(income.foreignDividends).toBe(0);
  });

  test("a USD dividend is converted to CAD at the statement's own fxRate", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      fxRate: 1.3877,
      holdings: [holding({ symbol: "AAPL", priceCurrency: "USD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 18.64,
          currency: "USD",
          description: "AAPL - Apple Inc: Cash dividend distribution",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.foreignDividends).toBeCloseTo(18.64 * 1.3877, 2);
  });

  test("FPLINT securities lending interest counts as interest", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      activity: [
        activityRow({
          code: "FPLINT",
          credit: 4.21,
          description: "Stock lending monthly interest payment",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.interest).toBe(4.21);
  });

  test("NRT foreign tax withheld nets a reversal and is shown as a positive credit", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      activity: [
        activityRow({ code: "NRT", debit: 25, description: "Non-resident tax" }),
        activityRow({ code: "NRT", credit: 5, description: "Non-resident tax reversal" }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.foreignTaxWithheld).toBe(20);
  });

  test("a DIV reversal nets to zero rather than double counting the credit", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 30,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
        activityRow({
          code: "DIV",
          debit: 30,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution reversal",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.canadianDistributions).toBe(0);
  });

  test("a corporate account's dividends contribute nothing to the personal estimate", () => {
    const corporate = series({ maskedId: "acct_corp", kind: "Corporate" as AccountKind });
    const nonRegistered = series({ maskedId: "acct_nr", kind: "NonRegistered" as AccountKind });
    const corpStatement = statement({
      source: src("acct_corp", "2026-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 645,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const personalStatement = statement({
      source: src("acct_nr", "2026-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 202,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const income = buildIncome(
      [corporate, nonRegistered],
      [corpStatement, personalStatement],
      2026,
      new Set(["acct_corp", "acct_nr"]),
    );
    expect(income.canadianDistributions).toBe(202);
  });

  test("a TFSA's dividends contribute nothing to the personal estimate", () => {
    const tfsa = series({ maskedId: "acct_tfsa", kind: "TFSA" as AccountKind });
    const nonRegistered = series({ maskedId: "acct_nr", kind: "NonRegistered" as AccountKind });
    const tfsaStatement = statement({
      source: src("acct_tfsa", "2026-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 300,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const personalStatement = statement({
      source: src("acct_nr", "2026-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 50,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const income = buildIncome(
      [tfsa, nonRegistered],
      [tfsaStatement, personalStatement],
      2026,
      new Set(["acct_tfsa", "acct_nr"]),
    );
    expect(income.canadianDistributions).toBe(50);
  });

  test("an account outside the caller's scope contributes nothing even when it is a taxable kind", () => {
    const inScope = series({ maskedId: "acct_in" });
    const outOfScope = series({ maskedId: "acct_out" });
    const inStatement = statement({
      source: src("acct_in", "2026-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 10,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const outStatement = statement({
      source: src("acct_out", "2026-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 999,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const income = buildIncome(
      [inScope, outOfScope],
      [inStatement, outStatement],
      2026,
      new Set(["acct_in"]),
    );
    expect(income.canadianDistributions).toBe(10);
  });

  test("a PERFORMANCE statement's duplicated activity does not double-count", () => {
    const account = series({ maskedId: "acct_nr" });
    const brokerage = statement({
      source: src("acct_nr", "2026-03", "BROKERAGE"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 100,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const performance = statement({
      source: src("acct_nr", "2026-03", "PERFORMANCE"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 100,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const income = buildIncome([account], [brokerage, performance], 2026, new Set(["acct_nr"]));
    expect(income.canadianDistributions).toBe(100);
  });

  test("only sums activity within the target year", () => {
    const account = series({ maskedId: "acct_nr" });
    const thisYear = statement({
      source: src("acct_nr", "2026-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 100,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const lastYear = statement({
      source: src("acct_nr", "2025-03"),
      holdings: [holding({ symbol: "XEQT", priceCurrency: "CAD" })],
      activity: [
        activityRow({
          code: "DIV",
          credit: 500,
          description: "XEQT - iShares Core Equity ETF: Cash dividend distribution",
        }),
      ],
    });
    const income = buildIncome([account], [thisYear, lastYear], 2026, new Set(["acct_nr"]));
    expect(income.canadianDistributions).toBe(100);
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
