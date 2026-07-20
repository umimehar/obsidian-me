import { describe, expect, it, test } from "bun:test";
import { buildTax, computeAnalytics } from "./analytics";
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
  expect(l.tax).toBeDefined();
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

test("inflow/outflow count only external CONTRIB/TRANSFER money, not BUY/SELL/DIV", () => {
  const txns = [
    txn({ type: "BUY", symbol: "L", quantity: 1, amount: -60 }),
    txn({ type: "SELL", symbol: "L", quantity: 1, amount: 65 }),
    txn({ type: "DIV", amount: 10 }),
  ];
  const series = computeAnalytics(store(txns, [acct("acct_a", "TFSA")])).ledger.series;
  expect(series.every((s) => s.inflow === 0 && s.outflow === 0)).toBe(true);
});

test("inflow/outflow count external CONTRIB/TRANSFER_IN/TRANSFER_OUT", () => {
  const txns = [
    txn({ type: "CONTRIB", amount: 500 }),
    txn({ type: "TRANSFER_IN", amount: 200 }),
    txn({ type: "TRANSFER_OUT", amount: -150 }),
  ];
  const series = computeAnalytics(store(txns, [acct("acct_a", "TFSA")])).ledger.series;
  expect(series[0]).toMatchObject({ inflow: 700, outflow: -150 });
});

describe("buildTax", () => {
  function txn(p: Partial<Txn>): Txn {
    return {
      account_id: "t1",
      date: "2026-03-01",
      post_date: null,
      type: "DIV",
      raw_type: "",
      symbol: null,
      quantity: null,
      unit_price: null,
      fx_rate: null,
      amount: 0,
      balance: null,
      currency: "CAD",
      description_redacted: "",
      ...p,
    };
  }
  function store(txns: Txn[], kind = "NonRegistered"): Datastore {
    return {
      meta: {
        generated_at: "",
        schema_version: 1,
        file_count: 0,
        txn_count: txns.length,
        source_range: { start: null, end: null },
        warnings: { unmapped_types: {} },
      },
      accounts: [
        {
          masked_id: "t1",
          kind,
          name: kind,
          short_id: "t1t1",
          currency: "CAD",
          first_activity: "",
          last_activity: "",
          txn_count: txns.length,
        },
      ],
      transactions: txns,
    };
  }

  it("buckets CAD dividends as eligible and USD dividends as foreign", () => {
    const t = buildTax(
      store([
        txn({ type: "DIV", amount: 100, currency: "CAD" }),
        txn({ type: "DIV", amount: 50, currency: "USD" }),
        txn({ type: "INT", amount: 20, currency: "CAD", description_redacted: "Interest earned" }),
      ]),
      "2026",
    );
    const y = t.years.find((x) => x.year === "2026");
    expect(y?.income.eligible_dividends).toBe(100);
    expect(y?.income.foreign_income).toBe(50);
    expect(y?.income.interest).toBe(20);
  });

  it("computes realized gains from sells against average cost", () => {
    const t = buildTax(
      store([
        txn({ type: "BUY", symbol: "X", quantity: 10, amount: -100, date: "2026-01-01" }),
        txn({ type: "SELL", symbol: "X", quantity: 5, amount: 80, date: "2026-02-01" }),
      ]),
      "2026",
    );
    // avg cost 10/share; sold 5 -> cost 50; proceeds 80 -> gain 30.
    expect(t.years.find((x) => x.year === "2026")?.realized_gains).toBe(30);
  });

  it("excludes registered accounts from taxable income and gains", () => {
    const t = buildTax(store([txn({ type: "DIV", amount: 100, currency: "CAD" })], "TFSA"), "2026");
    expect(t.years.find((x) => x.year === "2026")?.income.eligible_dividends).toBe(0);
  });

  it("reports negative remaining room when used exceeds the annual limit, without a false over flag", () => {
    // Unused room carries forward from prior years, so exceeding this year's
    // annual limit is not necessarily an over-contribution — the room entry
    // must not assert one; it should only report the raw remaining figure.
    const t = buildTax(
      store([txn({ type: "CONTRIB", amount: 9000, date: "2026-05-01" })], "TFSA"),
      "2026",
    );
    const room = t.years.find((x) => x.year === "2026")?.room.find((r) => r.group === "TFSA");
    expect(room).not.toHaveProperty("over");
    expect(room?.remaining).toBe(7000 - 9000);
  });
});
