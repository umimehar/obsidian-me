import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Holding, Statement } from "../types";
import type { AccountSeries } from "./types";
import { classifyForeignProperty, foreignPropertySummary } from "./foreignProperty";

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

function series(over: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_nr",
    shortId: "0001",
    label: "Non-registered",
    kind: "NonRegistered" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "growth",
    inTotals: true,
    months: [],
    contributionsByYear: {},
    ...over,
  };
}

function src(accountNo: string, period: string) {
  return { file: `${accountNo}_${period}.pdf`, accountNo, period, template: "BROKERAGE" as const, version: 0 };
}

function statement(over: Partial<Statement> = {}): Statement {
  return {
    source: src("acct_nr", "2026-01"),
    accountType: "Non-Registered Cash Account",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
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

describe("classifyForeignProperty", () => {
  test("HXQ.U is Canadian -- a USD unit class of a Canadian listed ETF, not foreign", () => {
    expect(classifyForeignProperty(holding({ symbol: "HXQ.U", priceCurrency: "USD" }))).toBe(
      "canadian",
    );
  });

  test("CHPX is foreign -- the US listed Global X Funds ETF, distinct from the Canadian CHPS", () => {
    expect(classifyForeignProperty(holding({ symbol: "CHPX" }))).toBe("foreign");
  });

  test("CHPS (the Canadian listed one) is not foreign", () => {
    expect(classifyForeignProperty(holding({ symbol: "CHPS" }))).toBe("canadian");
  });

  test("an unreviewed symbol with no US Equities asset class is unclassified, never guessed", () => {
    expect(classifyForeignProperty(holding({ symbol: "ZZZZ", assetClass: "Other" }))).toBe(
      "unclassified",
    );
  });

  test("a direct-indexing US stock with no individual symbol review still classifies via its US Equities asset class", () => {
    expect(
      classifyForeignProperty(holding({ symbol: "XOM", assetClass: "US Equities - Energy" })),
    ).toBe("foreign");
  });
});

const THRESHOLDS = { filingThreshold: 100000, detailedThreshold: 250000 };

describe("foreignPropertySummary", () => {
  test("registered accounts are excluded from the scope entirely", () => {
    const tfsa = series({ maskedId: "acct_tfsa", kind: "TFSA" as AccountKind });
    const statements = [
      statement({
        source: src("acct_tfsa", "2026-01"),
        holdings: [holding({ symbol: "CHPX", bookCost: 200000 })],
      }),
    ];
    const summary = foreignPropertySummary(
      statements,
      [tfsa],
      2026,
      new Set(["NonRegistered"]),
      THRESHOLDS,
    );
    expect(summary.maxForeignCost).toBe(0);
    expect(summary.monthsConsidered).toBe(0);
  });

  test("max during the year differs from the year-end figure", () => {
    const statements = [
      statement({
        source: src("acct_nr", "2026-01"),
        holdings: [holding({ symbol: "CHPX", bookCost: 150000 })],
      }),
      statement({
        source: src("acct_nr", "2026-06"),
        holdings: [holding({ symbol: "CHPX", bookCost: 300000 })],
      }),
      statement({
        source: src("acct_nr", "2026-12"),
        holdings: [holding({ symbol: "CHPX", bookCost: 180000 })],
      }),
    ];
    const summary = foreignPropertySummary(
      statements,
      [series()],
      2026,
      new Set(["NonRegistered"]),
      THRESHOLDS,
    );
    expect(summary.maxForeignCost).toBe(300000);
    expect(summary.yearEndForeignCost).toBe(180000);
    expect(summary.monthsConsidered).toBe(3);
    expect(summary.detailedThresholdExceeded).toBe(true);
  });

  test("Canadian-listed holdings never count toward the foreign total, even in USD units", () => {
    const statements = [
      statement({
        fxRate: 1.4,
        holdings: [holding({ symbol: "HXQ.U", priceCurrency: "USD", bookCost: 500000 })],
      }),
    ];
    const summary = foreignPropertySummary(
      statements,
      [series()],
      2026,
      new Set(["NonRegistered"]),
      THRESHOLDS,
    );
    expect(summary.maxForeignCost).toBe(0);
    expect(summary.filingThresholdExceeded).toBe(false);
  });

  test("Crypto holdings are reported apart from the foreign total, never folded in either way", () => {
    const crypto = series({ maskedId: "acct_crypto", kind: "Crypto" as AccountKind });
    const statements = [
      statement({
        source: src("acct_crypto", "2026-12"),
        holdings: [holding({ symbol: "BTC", assetClass: "Crypto", bookCost: 60000 })],
      }),
    ];
    const summary = foreignPropertySummary(
      statements,
      [crypto],
      2026,
      new Set(["NonRegistered"]),
      THRESHOLDS,
    );
    expect(summary.maxForeignCost).toBe(0);
    expect(summary.cryptoCostAtYearEnd).toBe(60000);
  });

  test("an unclassified holding is never folded into the foreign total", () => {
    const statements = [
      statement({ holdings: [holding({ symbol: "ZZZZ", assetClass: "Other", bookCost: 999999 })] }),
    ];
    const summary = foreignPropertySummary(
      statements,
      [series()],
      2026,
      new Set(["NonRegistered"]),
      THRESHOLDS,
    );
    expect(summary.maxForeignCost).toBe(0);
    expect(summary.unclassifiedCostAtYearEnd).toBe(999999);
  });
});
