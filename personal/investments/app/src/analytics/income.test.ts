import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GOLDENS } from "../goldens";
import type { Datastore } from "../store/datastore";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { ActivityRow, Holding, Statement } from "../types";
import { buildIncome } from "./income";
import { buildSeries } from "./series";
import type { AccountSeries } from "./types";

const DATASTORE_PATH = join(import.meta.dir, "..", "..", "..", "data", "datastore.json");

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

  test("a BUY with an unreadable quantity makes the ledger's quantity uncertain, so a later readable partial sale is cost unknown rather than divided by too few shares", () => {
    const account = series({ maskedId: "acct_nr" });
    const january = statement({
      source: src("acct_nr", "2026-01"),
      holdings: [holding({ symbol: "ENB", quantity: 10, bookCost: 1600 })],
    });
    const february = statement({
      source: src("acct_nr", "2026-02"),
      // Still held after the sale, so this is not a full close.
      holdings: [holding({ symbol: "ENB", quantity: 5, bookCost: 800 })],
      activity: [
        activityRow({
          code: "BUY",
          debit: 160,
          description: "ENB - Enbridge Inc: Bought shares (executed at 2026-02-10)",
        }),
        activityRow({
          code: "SELL",
          credit: 850,
          description: "ENB - Enbridge Inc: Sold 5.0000 shares (executed at 2026-02-14)",
        }),
      ],
    });
    const income = buildIncome([account], [january, february], 2026, new Set(["acct_nr"]));
    // The naive average (1760/10 * 5 = 880) would report a -30 loss on a
    // sale that could equally have been a gain; neither is knowable from
    // this data, so it counts as unknown rather than either guess.
    expect(income.realizedGains).toBe(0);
    expect(income.costUnknownSales).toBe(1);
  });

  test("a sale larger than the ledger's remaining quantity costs the covered part and marks the rest cost unknown, clamped at zero rather than negative", () => {
    const account = series({ maskedId: "acct_nr" });
    const january = statement({
      source: src("acct_nr", "2026-01"),
      holdings: [holding({ symbol: "ADI", quantity: 10, bookCost: 200 })], // $20/share
    });
    const february = statement({
      source: src("acct_nr", "2026-02"),
      holdings: [holding({ symbol: "ADI", quantity: 8, bookCost: 176 })],
      activity: [
        activityRow({
          code: "SELL",
          credit: 300,
          description: "ADI - Analog Devices Inc.: Sold 15.0000 shares (executed at 2026-02-03)",
        }),
        activityRow({
          code: "BUY",
          debit: 176,
          description: "ADI - Analog Devices Inc.: Bought 8.0000 shares (executed at 2026-02-05)",
        }),
      ],
    });
    const income = buildIncome([account], [january, february], 2026, new Set(["acct_nr"]));
    // 10 of the 15 sold are covered at $20/share: proceeds pro rata is
    // 300 * (10/15) = 200, minus the whole $200 cost = 0 gain. The other 5
    // have no cost basis at all, so the sale counts as cost unknown even
    // though part of it was priced.
    expect(income.realizedGains).toBeCloseTo(0, 2);
    expect(income.costUnknownSales).toBe(1);
    // The ledger clamps at zero rather than going negative: the BUY that
    // follows lands on a clean slate, matching the real February holding.
    const march = statement({
      source: src("acct_nr", "2026-03"),
      holdings: [],
      activity: [
        activityRow({
          code: "SELL",
          credit: 176,
          description: "ADI - Analog Devices Inc.: Sold 8.0000 shares (executed at 2026-03-02)",
        }),
      ],
    });
    const withMarch = buildIncome(
      [account],
      [january, february, march],
      2026,
      new Set(["acct_nr"]),
    );
    // Same as above, plus March's sale of the 8 shares bought in February at
    // their own $22/share cost: 176 - 176 = 0.
    expect(withMarch.realizedGains).toBeCloseTo(0, 2);
    expect(withMarch.costUnknownSales).toBe(1);
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

  test("a same month buy before the sale is costed against it, in date order", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      activity: [
        activityRow({
          date: "2026-03-05",
          code: "BUY",
          debit: 200,
          description: "AXP - American Express: Bought 10.0000 shares (executed at 2026-03-05)",
        }),
        activityRow({
          date: "2026-03-20",
          code: "SELL",
          credit: 130,
          description: "AXP - American Express: Sold 5.0000 shares (executed at 2026-03-20)",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    // average cost $20/share from the earlier buy, proceeds 130 - (5 * 20) = 30
    expect(income.realizedGains).toBeCloseTo(30, 2);
    expect(income.costUnknownSales).toBe(0);
  });

  test("a same month buy AFTER the sale is not costed against it -- the sale predates the shares", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      activity: [
        activityRow({
          date: "2026-03-05",
          code: "SELL",
          credit: 130,
          description: "AXP - American Express: Sold 5.0000 shares (executed at 2026-03-05)",
        }),
        activityRow({
          date: "2026-03-20",
          code: "BUY",
          debit: 200,
          description: "AXP - American Express: Bought 10.0000 shares (executed at 2026-03-20)",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.realizedGains).toBe(0);
    expect(income.costUnknownSales).toBe(1);
  });

  test("a stock split (STKREORG, no readable ratio) marks the symbol unknown for the rest of the statement", () => {
    const account = series({ maskedId: "acct_nr" });
    const january = statement({
      source: src("acct_nr", "2026-01"),
      holdings: [holding({ symbol: "NFLX", quantity: 0.0267, bookCost: 41.62 })],
    });
    const february = statement({
      source: src("acct_nr", "2026-02"),
      holdings: [],
      activity: [
        activityRow({
          date: "2026-02-01",
          code: "SELL",
          credit: 0.16,
          description: "NFLX - Netflix Inc: Sold 0.0001 shares (executed at 2026-01-31)",
        }),
        activityRow({
          date: "2026-02-02",
          code: "STKREORG",
          description: "NFLX - Netflix Inc: stock reorganization (executed at 2026-02-02)",
        }),
        activityRow({
          date: "2026-02-03",
          code: "SELL",
          credit: 85,
          description: "NFLX - Netflix Inc: Sold 0.57 shares (executed at 2026-02-03)",
        }),
      ],
    });
    const income = buildIncome([account], [january, february], 2026, new Set(["acct_nr"]));
    // Only the pre-split sale is priced: 0.16 - (0.0001 * 41.62/0.0267) = 0.0041
    expect(income.realizedGains).toBeCloseTo(0.0041, 3);
    // The post-split sale counts as cost unknown, never priced off the pre-split average.
    expect(income.costUnknownSales).toBe(1);
  });

  test("a SELL with a blank description counts as cost unknown, never a silent zero", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-02"),
      holdings: [holding({ symbol: "ENB", quantity: 20, bookCost: 400 })],
      activity: [activityRow({ code: "SELL", credit: 5.54, description: "" })],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.realizedGains).toBe(0);
    expect(income.costUnknownSales).toBe(1);
  });

  test("a readable symbol with an unreadable quantity, absent from the closing holdings, is a full close", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-06"),
      holdings: [],
      activity: [
        activityRow({
          date: "2026-06-01",
          code: "BUY",
          debit: 383.45,
          description: "AMHE - Harvest Amazon Enhanced High Income Shares ETF - Class A:",
        }),
        activityRow({
          date: "2026-06-02",
          code: "SELL",
          credit: 383.75,
          description: "AMHE - Harvest Amazon Enhanced High Income Shares ETF - Class A: Sold",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.realizedGains).toBeCloseTo(0.3, 2);
    expect(income.costUnknownSales).toBe(0);
  });

  test("the same unreadable quantity case, still open in the closing holdings, is cost unknown rather than guessed", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-06"),
      holdings: [holding({ symbol: "AMHE", quantity: 1, bookCost: 100 })],
      activity: [
        activityRow({
          code: "SELL",
          credit: 50,
          description: "AMHE - Harvest Amazon Enhanced High Income Shares ETF - Class A: Sold",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.realizedGains).toBe(0);
    expect(income.costUnknownSales).toBe(1);
  });

  test("a symbol two holdings both claim is ambiguous, and its sales are cost unknown", () => {
    const account = series({ maskedId: "acct_nr" });
    const january = statement({
      source: src("acct_nr", "2026-01"),
      holdings: [
        holding({
          symbol: "A",
          name: "Agilent Technologies Inc.",
          quantity: 0.1208,
          bookCost: 24.6,
        }),
        holding({ symbol: "A", name: "Aon plc.", quantity: 0.0387, bookCost: 18.78 }),
      ],
    });
    const february = statement({
      source: src("acct_nr", "2026-02"),
      holdings: [],
      activity: [
        activityRow({
          code: "SELL",
          credit: 30,
          description: "A - Agilent Technologies Inc.: Sold 0.1208 shares (executed at 2026-02-01)",
        }),
      ],
    });
    const income = buildIncome([account], [january, february], 2026, new Set(["acct_nr"]));
    expect(income.realizedGains).toBe(0);
    expect(income.costUnknownSales).toBe(1);
  });

  test("a CAD priced holding at a placeholder $0 market price is not trusted as Canadian", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-06"),
      holdings: [
        holding({
          symbol: "XOM",
          priceCurrency: "CAD",
          marketPrice: 0,
          assetClass: "US Equities and Alternatives",
        }),
      ],
      activity: [
        activityRow({
          code: "DIV",
          credit: 1.76,
          description:
            "XOM - Exxon Mobil Corp.: Cash dividend distribution, received on 2026-06-10",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.foreignDividends).toBe(1.76);
    expect(income.canadianDistributions).toBe(0);
  });

  test("a symbol seen priced in USD in an earlier statement is foreign even once sold out of the current one", () => {
    const account = series({ maskedId: "acct_nr" });
    const october = statement({
      source: src("acct_nr", "2025-10"),
      holdings: [holding({ symbol: "LNG", priceCurrency: "USD", marketPrice: 212 })],
    });
    const november = statement({
      source: src("acct_nr", "2025-11"),
      holdings: [],
      activity: [
        activityRow({
          code: "DIV",
          credit: 0.04,
          description:
            "LNG - Cheniere Energy Inc.: Cash dividend distribution, received on 2025-11-10",
        }),
      ],
    });
    const income = buildIncome([account], [october, november], 2025, new Set(["acct_nr"]));
    expect(income.foreignDividends).toBe(0.04);
    expect(income.canadianDistributions).toBe(0);
  });

  test("a STKDIS spin-off rebases the same symbol's quantity at unchanged cost", () => {
    const account = series({ maskedId: "acct_nr" });
    const january = statement({
      source: src("acct_nr", "2026-01"),
      holdings: [holding({ symbol: "XOM", quantity: 2, bookCost: 200 })],
    });
    const february = statement({
      source: src("acct_nr", "2026-02"),
      holdings: [holding({ symbol: "XOM", quantity: 3, bookCost: 200 })],
      activity: [
        activityRow({
          code: "STKDIS",
          description: "XOM - Exxon Mobil Corp.: Distribution of 1 shares (executed at 2026-02-02)",
        }),
        activityRow({
          code: "SELL",
          credit: 90,
          description: "XOM - Exxon Mobil Corp.: Sold 1.0000 shares (executed at 2026-02-05)",
        }),
      ],
    });
    const income = buildIncome([account], [january, february], 2026, new Set(["acct_nr"]));
    // Ledger after the distribution: 3 shares, $200 cost, $66.67/share.
    // 90 - (1 * 200/3) = 23.33
    expect(income.realizedGains).toBeCloseTo(23.33, 1);
  });

  test("corporateActions lists the year's stock dividends and spin-offs, symbol and date", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-06"),
      activity: [
        activityRow({
          code: "STKDIV",
          date: "2026-06-01",
          description:
            "FDXF - Fedex Freight Holding Company Inc.: Stock dividend distribution of 0.05",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.corporateActions).toEqual([{ symbol: "FDXF", date: "2026-06-01" }]);
  });

  test("corporateActions dedupes a same day pair of rows on the same symbol, the XOM spin-off shape", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-07"),
      activity: [
        activityRow({
          code: "STKDIS",
          date: "2026-07-02",
          description:
            "XOM - Exxon Mobil Corp.: Distribution of -1.3728 shares (executed at 2026-07-02)",
        }),
        activityRow({
          code: "STKDIS",
          date: "2026-07-02",
          description:
            "XOM - Exxonmobil Holdings Corp.: Distribution of 1.3728 shares (executed at 2026-07-02)",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.corporateActions).toEqual([{ symbol: "XOM", date: "2026-07-02" }]);
  });

  test("a '.U' USD unit class of a Canadian listed ETF is a Canadian distribution, even when the row itself pays in USD", () => {
    const account = series({ maskedId: "acct_nr" });
    const s = statement({
      source: src("acct_nr", "2026-03"),
      fxRate: 1.4,
      holdings: [
        holding({
          symbol: "HXQ.U",
          priceCurrency: "USD",
          assetClass: "US Equities and Alternatives",
        }),
      ],
      activity: [
        activityRow({
          code: "DIV",
          credit: 5,
          currency: "USD",
          description:
            "HXQ.U - Global X Nasdaq-100 Index Corporate Class: Cash dividend distribution",
        }),
      ],
    });
    const income = buildIncome([account], [s], 2026, new Set(["acct_nr"]));
    expect(income.canadianDistributions).toBeGreaterThan(0);
    expect(income.foreignDividends).toBe(0);
  });
});

/**
 * Skipped without the real datastore -- it is the owner's masked financial
 * history and this suite must still run somewhere that lacks it. Calls
 * `buildIncome` itself over `datastore.json`, never through the committed
 * `analytics.json`: reading `analytics.income` would compare the pipeline's
 * output to a golden copied from that SAME output, which stays green even
 * if a real rule (the split handling, an averaging bug) is deleted, because
 * both `bun run analytics` and `bun run goldens` would re-bless the same
 * wrong figure in one breath. Calling `buildIncome` here is the second,
 * independent computation that closes that gap.
 */
describe.if(existsSync(DATASTORE_PATH))("buildIncome over the real datastore", () => {
  async function incomeFor(year: number) {
    const datastore = (await Bun.file(DATASTORE_PATH).json()) as Datastore;
    const series = buildSeries(datastore.statements, datastore.accounts);
    const allAccountIds = new Set(series.map((s) => s.maskedId));
    return buildIncome(series, datastore.statements, year, allAccountIds);
  }

  test("2026 realized gains are positive and match the golden, the regression this fix pins", async () => {
    const income2026 = await incomeFor(2026);
    expect(income2026.realizedGains).toBeGreaterThan(0);
    expect(income2026.realizedGains).toBe(GOLDENS.incomeByYear["2026"].realizedGains);
    expect(income2026.canadianDistributions).toBe(
      GOLDENS.incomeByYear["2026"].canadianDistributions,
    );
    expect(income2026.foreignDividends).toBe(GOLDENS.incomeByYear["2026"].foreignDividends);
    expect(income2026.foreignTaxWithheld).toBe(GOLDENS.incomeByYear["2026"].foreignTaxWithheld);
    expect(income2026.interest).toBe(GOLDENS.incomeByYear["2026"].interest);
    expect(income2026.costUnknownSales).toBe(GOLDENS.incomeByYear["2026"].costUnknownSales);
  });

  test("2025 income matches the golden", async () => {
    const income2025 = await incomeFor(2025);
    expect(income2025.realizedGains).toBe(GOLDENS.incomeByYear["2025"].realizedGains);
    expect(income2025.canadianDistributions).toBe(
      GOLDENS.incomeByYear["2025"].canadianDistributions,
    );
    expect(income2025.foreignDividends).toBe(GOLDENS.incomeByYear["2025"].foreignDividends);
    expect(income2025.foreignTaxWithheld).toBe(GOLDENS.incomeByYear["2025"].foreignTaxWithheld);
    expect(income2025.interest).toBe(GOLDENS.incomeByYear["2025"].interest);
    expect(income2025.costUnknownSales).toBe(GOLDENS.incomeByYear["2025"].costUnknownSales);
  });
});
