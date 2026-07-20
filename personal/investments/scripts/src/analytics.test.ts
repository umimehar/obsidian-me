import { describe, expect, it, test } from "bun:test";
import { buildGrowth, computeAnalytics } from "./analytics";
import type { Account, Datastore, Txn } from "./datastore";

function txn(partial: Partial<Txn>): Txn {
  return {
    account_id: "acct_a",
    date: "2025-03-01",
    post_date: null,
    type: "OTHER",
    raw_type: "",
    symbol: null,
    quantity: null,
    unit_price: null,
    fx_rate: null,
    amount: 0,
    balance: null,
    currency: "CAD",
    description_redacted: "",
    ...partial,
  };
}

function acct(id: string, kind: string): Account {
  return {
    masked_id: id,
    kind,
    name: kind,
    short_id: id.slice(5, 9),
    currency: "CAD",
    first_activity: "2025-03",
    last_activity: "2025-03",
    txn_count: 0,
  };
}

function store(txns: Txn[], accounts: Account[]): Datastore {
  return {
    meta: {
      generated_at: "",
      schema_version: 1,
      file_count: 1,
      txn_count: txns.length,
      source_range: { start: null, end: null },
      warnings: { unmapped_types: {} },
    },
    accounts,
    transactions: txns,
  };
}

test("ledger has the expected shape", () => {
  const l = computeAnalytics(
    store([txn({ type: "CONTRIB", amount: 500, balance: 500 })], [acct("acct_a", "TFSA")]),
  ).ledger;
  expect(l.accounts[0]).toMatchObject({ id: "acct_a", kind: "TFSA", name: "TFSA" });
  expect(l.months).toContain("2025-03");
  expect(l.series[0]).toMatchObject({ contrib: 500, cash: 500 });
  expect(l.limits.TFSA?.["2025"]).toBe(7000);
});

test("holdings use adjusted cost base, reduced on sell", () => {
  const txns = [
    txn({ date: "2025-03-01", type: "BUY", symbol: "L", quantity: 1, amount: -60 }),
    txn({ date: "2025-04-01", type: "BUY", symbol: "L", quantity: 0.5, amount: -20 }),
    txn({ date: "2025-05-01", type: "SELL", symbol: "L", quantity: 0.5, amount: 30 }),
  ];
  const holding = computeAnalytics(store(txns, [acct("acct_a", "TFSA")])).ledger.holdings.find(
    (h) => h.symbol === "L",
  );
  // avg cost after buys = 80/1.5 = 53.33; sell 0.5 removes 26.67 -> acb 53.33
  expect(holding?.qty).toBeCloseTo(1, 6);
  expect(holding?.acb).toBeCloseTo(53.33, 1);
});

test("accounts with no CAD ledger activity are dropped from the account list", () => {
  const txns = [
    txn({ account_id: "acct_a", type: "CONTRIB", amount: 500 }),
    txn({ account_id: "acct_usd", type: "INT", amount: 3, currency: "USD" }),
  ];
  const l = computeAnalytics(store(txns, [acct("acct_a", "TFSA"), acct("acct_usd", "USD")])).ledger;
  expect(l.accounts.map((a) => a.id)).toEqual(["acct_a"]);
});

test("credit card rows do not count as cash inflow", () => {
  const txns = [txn({ account_id: "acct_c", type: "CARD_PURCHASE", amount: 37.4 })];
  const series = computeAnalytics(store(txns, [acct("acct_c", "CreditCard")])).ledger.series;
  expect(series.every((s) => s.inflow === 0)).toBe(true);
});

describe("buildGrowth", () => {
  const accounts = [
    { id: "a1", kind: "TFSA", name: "TFSA", short_id: "aaaa", currency: "CAD" },
    { id: "a2", kind: "NonRegistered", name: "US", short_id: "bbbb", currency: "USD" },
  ];
  const holdings = [
    { account_id: "a1", symbol: "XEQT", qty: 10, acb: 300 },
    { account_id: "a2", symbol: "AAPL", qty: 2, acb: 200 },
  ];
  const prices = {
    as_of: "2026-07-20T00:00:00Z",
    fx_usd_cad: 1.4,
    quotes: {
      XEQT: { symbol: "XEQT", price: 35, currency: "CAD" },
      AAPL: { symbol: "AAPL", price: 150, currency: "USD" },
    },
  };

  it("computes CAD market value converting USD via fx", () => {
    const g = buildGrowth(holdings, accounts, prices);
    // XEQT: 10*35 = 350 (CAD). AAPL: 2*150*1.4 = 420 (CAD).
    expect(g.total.market).toBe(770);
    expect(g.total.cost).toBe(500);
    expect(g.total.gain).toBe(270);
  });

  it("falls back to cost when a symbol is unpriced and lowers coverage", () => {
    const g2 = buildGrowth(holdings, accounts, { ...prices, quotes: { XEQT: prices.quotes.XEQT } });
    expect(g2.total.market).toBe(350 + 200); // AAPL falls back to its 200 cost
    expect(g2.coverage).toBeCloseTo(300 / 500, 5);
  });

  it("reports gainPct of 0 when cost is 0", () => {
    const g = buildGrowth([{ account_id: "a1", symbol: "X", qty: 1, acb: 0 }], accounts, {
      as_of: "x",
      fx_usd_cad: 1,
      quotes: { X: { symbol: "X", price: 5, currency: "CAD" } },
    });
    expect(g.total.gainPct).toBe(0);
  });
});
