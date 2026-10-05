import { describe, expect, test } from "bun:test";
import rawDatastore from "@data/datastore.json";
import { GOLDENS } from "../goldens";
import type { Datastore } from "../store/datastore";
import type { AccountRecord } from "../store/registry";
import type { CashSummary, Currency, Holding, Statement } from "../types";
import { INDEX_GROUPS, buildHoldings } from "./holdings";

const DATASTORE = rawDatastore as Datastore;
const HOLDINGS = buildHoldings(DATASTORE.statements, DATASTORE.accounts);

describe("buildHoldings, over the real corpus", () => {
  test("period, total and behind match the golden", () => {
    expect(HOLDINGS.period).toBe(GOLDENS.holdings.period);
    expect(HOLDINGS.total).toBeCloseTo(GOLDENS.holdings.total, 6);
    expect(HOLDINGS.behind).toEqual(GOLDENS.holdings.behind);
  });

  test("total is within a cent per account of the portfolio total", () => {
    const tolerance = DATASTORE.accounts.length * 0.01;
    expect(Math.abs(HOLDINGS.total - GOLDENS.portfolio.total)).toBeLessThanOrEqual(tolerance);
  });

  test("VFV and VOO sum into the S&P 500 group, matching the golden value, share and account count", () => {
    const group = HOLDINGS.groups.find((g) => g.label === "S&P 500");
    expect(group).toBeDefined();
    expect(group?.symbols).toContain("VFV");
    expect(group?.value).toBeCloseTo(GOLDENS.holdings.sp500.value, 6);
    expect(group?.share).toBeCloseTo(GOLDENS.holdings.sp500.share, 9);
    expect(group?.accounts.length).toBe(GOLDENS.holdings.sp500.accountCount);
  });

  test("the top 10 symbols by value match the golden", () => {
    const top = HOLDINGS.holdings.slice(0, 10).map((h) => ({
      symbol: h.symbol,
      currency: h.priceCurrency,
      value: h.value,
      accounts: h.accounts,
    }));
    expect(top).toEqual(GOLDENS.holdings.topSymbols);
  });

  test("the cash rows by currency match the golden", () => {
    const cad = HOLDINGS.holdings.find((h) => h.symbol === "" && h.priceCurrency === "CAD");
    const usd = HOLDINGS.holdings.find((h) => h.symbol === "" && h.priceCurrency === "USD");
    expect(cad?.value).toBeCloseTo(GOLDENS.holdings.cash.CAD, 6);
    expect(usd?.value).toBeCloseTo(GOLDENS.holdings.cash.USD, 6);
  });

  test("shares sum to 1 within 1e-9", () => {
    const sum = HOLDINGS.holdings.reduce((total, h) => total + h.share, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  test("every holding is attributed to at least one real account label, never a masked id", () => {
    for (const holding of HOLDINGS.holdings) {
      expect(holding.accounts.length).toBeGreaterThan(0);
      for (const label of holding.accounts) {
        expect(typeof label).toBe("string");
        expect(label).not.toMatch(/^acct_[0-9a-f]{8}$/);
      }
    }
  });

  test("index groups only ever list configured symbols", () => {
    for (const group of HOLDINGS.groups) {
      const configured = INDEX_GROUPS[group.label];
      expect(configured).toBeDefined();
      for (const symbol of group.symbols) expect(configured).toContain(symbol);
    }
  });

  test("currency split matches the golden and sums to the total, within a cent per account", () => {
    expect(HOLDINGS.currency).toEqual(GOLDENS.holdings.currency);
    const tolerance = DATASTORE.accounts.length * 0.01;
    expect(Math.abs(HOLDINGS.currency.CAD + HOLDINGS.currency.USD - HOLDINGS.total)).toBeLessThan(
      tolerance,
    );
  });

  test("asset classes match the golden and sum to the total", () => {
    expect(HOLDINGS.assetClasses).toEqual(GOLDENS.holdings.assetClasses);
    const sum = HOLDINGS.assetClasses.reduce((total, c) => total + c.value, 0);
    expect(Math.abs(sum - HOLDINGS.total)).toBeLessThan(0.01);
  });

  test("the reported period is one the corpus actually reports", () => {
    expect(HOLDINGS.period.length).toBe(7);
    expect(HOLDINGS.period <= GOLDENS.corpus.latestPeriod).toBe(true);
  });

  test("holdings render in descending value order", () => {
    for (let i = 1; i < HOLDINGS.holdings.length; i++) {
      const previous = HOLDINGS.holdings[i - 1];
      const current = HOLDINGS.holdings[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous !== undefined && current !== undefined) {
        expect(previous.value).toBeGreaterThanOrEqual(current.value);
      }
    }
  });

  test("L keys apart into Loblaw (CAD) and Loews Corp (USD), never merged, matching the golden", () => {
    const entries = HOLDINGS.holdings
      .filter((h) => h.symbol === "L")
      .map((h) => ({
        currency: h.priceCurrency,
        name: h.name,
        value: h.value,
        accounts: h.accounts,
      }));
    expect(entries).toEqual(GOLDENS.holdings.lRows);
    expect(entries.length).toBe(2);
    const cad = entries.find((e) => e.currency === "CAD");
    const usd = entries.find((e) => e.currency === "USD");
    expect(cad?.name).toBe("Loblaw Cos. Ltd.");
    expect(usd?.name).toBe("Loews Corp.");
  });

  test("WSE401 carries its pending valuation through to the model", () => {
    const wse = HOLDINGS.holdings.find((h) => h.symbol === "WSE401");
    expect(wse?.pendingValuation).toBe(true);
  });
});

// --- Fixtures, for behaviour the real corpus does not currently exercise ---

function account(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "Fixture account",
    kind: "NonRegistered",
    style: "self-directed",
    purpose: "growth",
    inTotals: true,
    firstPeriod: "2026-01",
    lastPeriod: "2026-08",
    statementCount: 1,
    typeHistory: [],
    ...overrides,
  };
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    name: "Fixture Holding",
    symbol: "FIX",
    quantity: 1,
    segregatedQuantity: 0,
    marketPrice: 10,
    priceCurrency: "CAD",
    marketValue: 10,
    marketValueConverted: false,
    bookCost: 8,
    assetClass: "Fixture Class",
    pendingValuation: false,
    bookCostConverted: false,
    ...overrides,
  };
}

function cash(overrides: Partial<CashSummary> = {}): CashSummary {
  return {
    currency: "CAD",
    opening: 0,
    closing: 0,
    totalIn: null,
    totalOut: null,
    paidIn: null,
    paidOut: null,
    ...overrides,
  };
}

function statement(overrides: {
  accountNo?: string;
  period?: string;
  fxRate?: number | null;
  holdings?: Holding[];
  cash?: CashSummary[];
  cashMarketValue?: number;
}): Statement {
  const { accountNo = "acct_0001", period = "2026-08" } = overrides;
  return {
    source: {
      file: `${accountNo}_${period}_BROKERAGE.pdf`,
      accountNo,
      period,
      template: "BROKERAGE",
      version: 0,
    },
    accountType: "",
    periodStart: `${period}-01`,
    periodEnd: `${period}-28`,
    portfolio:
      overrides.cashMarketValue === undefined
        ? null
        : {
            cashMarketValue: overrides.cashMarketValue,
            cashBookCost: 0,
            classes: [],
            totalMarketValue: 0,
            totalBookCost: 0,
          },
    cash: overrides.cash ?? [],
    holdings: overrides.holdings ?? [],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: overrides.fxRate ?? null,
    returns: null,
    balances: null,
  };
}

describe("buildHoldings, fixtures", () => {
  test("resolves a $0-priced row's currency from the SAME account's own history, over a same-period sighting on a different account", () => {
    const accounts = [
      account({ maskedId: "acct_a", label: "Account A" }),
      account({ maskedId: "acct_b", label: "Account B" }),
    ];
    const statements = [
      // Account A priced XYZ properly in USD in an earlier month.
      statement({
        accountNo: "acct_a",
        period: "2026-06",
        holdings: [
          holding({
            symbol: "XYZ",
            name: "Xyz Corp",
            marketPrice: 50,
            priceCurrency: "USD",
            marketValue: 500,
          }),
        ],
      }),
      // Account A's own XYZ at the target period, price omitted (the $0/CAD quirk).
      statement({
        accountNo: "acct_a",
        period: "2026-08",
        holdings: [
          holding({
            symbol: "XYZ",
            name: "Xyz Corp",
            marketPrice: 0,
            priceCurrency: "CAD",
            marketValue: 520,
          }),
        ],
      }),
      // A DIFFERENT account prices XYZ in CAD in the SAME target period -- a distractor a
      // period-only resolution would wrongly prefer over account A's own USD history.
      statement({
        accountNo: "acct_b",
        period: "2026-08",
        holdings: [
          holding({
            symbol: "XYZ",
            name: "Xyz Corp",
            marketPrice: 40,
            priceCurrency: "CAD",
            marketValue: 400,
          }),
        ],
      }),
    ];
    const result = buildHoldings(statements, accounts);
    const xyzUsd = result.holdings.find((h) => h.symbol === "XYZ" && h.priceCurrency === "USD");
    expect(xyzUsd?.value).toBe(520);
  });

  test("cash is booked to its own currency, not folded into CAD", () => {
    const accounts = [account()];
    const statements = [
      statement({
        cash: [cash({ currency: "CAD", closing: 100 }), cash({ currency: "USD", closing: 50 })],
        fxRate: 1.4,
      }),
    ];
    const result = buildHoldings(statements, accounts);
    expect(result.currency.CAD).toBe(100);
    expect(result.currency.USD).toBeCloseTo(50 * 1.4, 6);
  });

  test("a symbol held by several accounts lists every one of them, not a truncated list", () => {
    const accounts = [
      account({ maskedId: "acct_a", label: "Account A" }),
      account({ maskedId: "acct_b", label: "Account B" }),
      account({ maskedId: "acct_c", label: "Account C" }),
    ];
    const statements = ["acct_a", "acct_b", "acct_c"].map((accountNo) =>
      statement({ accountNo, holdings: [holding({ symbol: "WIDE", name: "Wide Corp" })] }),
    );
    const result = buildHoldings(statements, accounts);
    const wide = result.holdings.find((h) => h.symbol === "WIDE");
    expect(wide?.accounts.sort()).toEqual(["Account A", "Account B", "Account C"]);
  });

  test("an account with no statement at the target period is named in behind, not silently dropped", () => {
    const accounts = [
      account({ maskedId: "acct_a", label: "Account A" }),
      account({ maskedId: "acct_b", label: "Account B" }),
    ];
    const statements = [
      statement({ accountNo: "acct_a", period: "2026-08" }),
      statement({ accountNo: "acct_b", period: "2026-07" }),
    ];
    const result = buildHoldings(statements, accounts);
    expect(result.period).toBe("2026-08");
    expect(result.behind).toEqual(["Account B"]);
  });
});

describe("buildHoldings, cashByAccount", () => {
  test("two accounts sharing the same CAD cash currency keep distinct per-account totals, unlike the pooled `Cash (CAD)` holding row", () => {
    const accounts = [
      account({ maskedId: "acct_a", label: "Account A" }),
      account({ maskedId: "acct_b", label: "Account B" }),
    ];
    const statements = [
      statement({
        accountNo: "acct_a",
        cashMarketValue: 176.51,
        cash: [cash({ currency: "CAD", closing: 176.51 })],
      }),
      statement({
        accountNo: "acct_b",
        cashMarketValue: 176.51,
        cash: [cash({ currency: "CAD", closing: 176.51 })],
      }),
    ];
    const result = buildHoldings(statements, accounts);
    // The pooled holding row sums both accounts' cash into one entry --
    // exactly the figure `cashByAccount` must NOT attribute to either
    // account alone.
    const pooledCash = result.holdings.find((h) => h.symbol === "" && h.priceCurrency === "CAD");
    expect(pooledCash?.value).toBeCloseTo(353.02, 6);
    expect(result.cashByAccount.acct_a).toBeCloseTo(176.51, 6);
    expect(result.cashByAccount.acct_b).toBeCloseTo(176.51, 6);
  });

  test("a BROKERAGE statement reads cashByAccount off portfolio.cashMarketValue, not a re-sum of cash[]", () => {
    const accounts = [account({ maskedId: "acct_a", label: "Account A" })];
    const statements = [
      statement({
        accountNo: "acct_a",
        cashMarketValue: 999,
        cash: [cash({ currency: "CAD", closing: 1 })],
      }),
    ];
    const result = buildHoldings(statements, accounts);
    expect(result.cashByAccount.acct_a).toBe(999);
  });

  test("an account with no BROKERAGE statement at the target period has no cashByAccount entry", () => {
    const accounts = [
      account({ maskedId: "acct_a", label: "Account A" }),
      account({ maskedId: "acct_b", label: "Account B" }),
    ];
    const statements = [
      statement({ accountNo: "acct_a", period: "2026-08", cashMarketValue: 50 }),
      statement({ accountNo: "acct_b", period: "2026-07", cashMarketValue: 50 }),
    ];
    const result = buildHoldings(statements, accounts);
    expect(result.cashByAccount.acct_a).toBe(50);
    expect(result.cashByAccount.acct_b).toBeUndefined();
  });
});
