import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Holding, Statement } from "../types";
import {
  classifyForeignProperty,
  foreignPropertySummary,
  t1135ThresholdStatus,
} from "./foreignProperty";
import type { AccountSeries } from "./types";

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
  return {
    file: `${accountNo}_${period}.pdf`,
    accountNo,
    period,
    template: "BROKERAGE" as const,
    version: 0,
  };
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
    expect(classifyForeignProperty("HXQ.U", "USD")).toBe("canadian");
  });

  test("HXS.U is Canadian too, via the same .U suffix rule -- no explicit listing needed", () => {
    expect(classifyForeignProperty("HXS.U", "USD")).toBe("canadian");
  });

  test("CHPX is foreign -- the US listed Global X Funds ETF, distinct from the Canadian CHPS", () => {
    expect(classifyForeignProperty("CHPX", "USD")).toBe("foreign");
  });

  test("CHPS (the Canadian listed one) is not foreign", () => {
    expect(classifyForeignProperty("CHPS", "CAD")).toBe("canadian");
  });

  test("a CAD-priced security is Canadian property by the currency rule alone, no symbol review needed", () => {
    expect(classifyForeignProperty("QCN", "CAD")).toBe("canadian");
    expect(classifyForeignProperty("L", "CAD")).toBe("canadian");
    expect(classifyForeignProperty("GOLD", "CAD")).toBe("canadian");
  });

  test("a USD-priced security is foreign by the currency rule alone, no symbol review needed", () => {
    expect(classifyForeignProperty("XOM", "USD")).toBe("foreign");
    // The same bare ticker as the Canadian `L` above, but priced in USD --
    // Loews Corp, not Loblaw. The currency decides, never the symbol alone.
    expect(classifyForeignProperty("L", "USD")).toBe("foreign");
  });
});

const THRESHOLDS = { filingThreshold: 100000, detailedThreshold: 250000 };

describe("t1135ThresholdStatus", () => {
  test("flags both thresholds once the cost amount reaches them", () => {
    expect(t1135ThresholdStatus(300000, THRESHOLDS)).toEqual({
      filingThresholdExceeded: true,
      detailedThresholdExceeded: true,
    });
  });

  test("flags neither below the filing threshold", () => {
    expect(t1135ThresholdStatus(50000, THRESHOLDS)).toEqual({
      filingThresholdExceeded: false,
      detailedThresholdExceeded: false,
    });
  });
});

describe("foreignPropertySummary", () => {
  test("registered accounts are excluded from the scope entirely", () => {
    const tfsa = series({ maskedId: "acct_tfsa", kind: "TFSA" as AccountKind });
    const statements = [
      statement({
        source: src("acct_tfsa", "2026-01"),
        holdings: [holding({ symbol: "CHPX", priceCurrency: "USD", bookCost: 200000 })],
      }),
    ];
    const summary = foreignPropertySummary(statements, [tfsa], 2026, new Set(["NonRegistered"]));
    expect(summary.maxForeignCost).toBe(0);
    expect(summary.monthsConsidered).toBe(0);
  });

  test("a month-by-month rising cost yields the true maximum, not a flat or inflated figure", () => {
    // Book cost here is already CAD (bookCostConverted: false means the
    // printed column itself was CAD, not that it needs converting) even
    // though the holding prices in USD -- the exact shape Corporate 91b8's
    // real statements take. A caller that re-converts this by priceCurrency
    // would double the figure.
    const statements = [
      statement({
        source: src("acct_nr", "2026-02"),
        fxRate: 1.3642,
        holdings: [holding({ symbol: "VOO", priceCurrency: "USD", bookCost: 18246.12 })],
      }),
      statement({
        source: src("acct_nr", "2026-06"),
        fxRate: 1.421,
        holdings: [holding({ symbol: "VOO", priceCurrency: "USD", bookCost: 34189.58 })],
      }),
      statement({
        source: src("acct_nr", "2026-08"),
        fxRate: 1.3866,
        holdings: [holding({ symbol: "VOO", priceCurrency: "USD", bookCost: 37765.51 })],
      }),
    ];
    const summary = foreignPropertySummary(
      statements,
      [series()],
      2026,
      new Set(["NonRegistered"]),
    );
    expect(summary.maxForeignCost).toBeCloseTo(37765.51, 2);
    expect(summary.yearEndForeignCost).toBeCloseTo(37765.51, 2);
    expect(summary.monthsConsidered).toBe(3);
  });

  test("max during the year differs from the year-end figure", () => {
    const statements = [
      statement({
        source: src("acct_nr", "2026-01"),
        holdings: [holding({ symbol: "CHPX", priceCurrency: "USD", bookCost: 150000 })],
      }),
      statement({
        source: src("acct_nr", "2026-06"),
        holdings: [holding({ symbol: "CHPX", priceCurrency: "USD", bookCost: 300000 })],
      }),
      statement({
        source: src("acct_nr", "2026-12"),
        holdings: [holding({ symbol: "CHPX", priceCurrency: "USD", bookCost: 180000 })],
      }),
    ];
    const summary = foreignPropertySummary(
      statements,
      [series()],
      2026,
      new Set(["NonRegistered"]),
    );
    expect(summary.maxForeignCost).toBe(300000);
    expect(summary.yearEndForeignCost).toBe(180000);
    expect(summary.monthsConsidered).toBe(3);
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
    );
    expect(summary.maxForeignCost).toBe(0);
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
      new Set(["NonRegistered", "Crypto"]),
    );
    expect(summary.maxForeignCost).toBe(0);
    expect(summary.cryptoCostAtYearEnd).toBe(60000);
  });

  test("a CAD-defaulted $0 price is corrected to the symbol's real currency from other sightings, never trusted as Canadian", () => {
    const statements = [
      // A properly priced USD sighting of XYZ elsewhere in the corpus --
      // what lets the $0-priced row below be corrected.
      statement({
        source: src("acct_other", "2026-01"),
        holdings: [
          holding({ symbol: "XYZ", priceCurrency: "USD", marketPrice: 50, bookCost: 1000 }),
        ],
      }),
      // The statement under test: a missing price defaults to marketPrice 0,
      // priceCurrency "CAD" -- the exact parser quirk CLAUDE.md documents.
      statement({
        source: src("acct_nr", "2026-02"),
        holdings: [
          holding({ symbol: "XYZ", priceCurrency: "CAD", marketPrice: 0, bookCost: 25000 }),
        ],
      }),
    ];
    const summary = foreignPropertySummary(
      statements,
      [series(), series({ maskedId: "acct_other" })],
      2026,
      new Set(["NonRegistered"]),
    );
    expect(summary.maxForeignCost).toBe(25000);
    expect(summary.unclassifiedCostAtYearEnd).toBe(0);
  });
});
