import { expect, test } from "bun:test";
import { computeAnalytics, externalFlow } from "./analytics";
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
  expect(l.flows).toBeDefined();
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

test("inflow/outflow count only external TRANSFER_IN/TRANSFER_OUT, by raw_type/description", () => {
  const txns = [
    txn({ type: "CONTRIB", amount: 500 }),
    txn({ type: "TRANSFER_IN", raw_type: "EFT", amount: 200 }),
    txn({
      type: "TRANSFER_OUT",
      raw_type: "E_TRFOUT",
      amount: -150,
      description_redacted: "e-Transfer sent",
    }),
  ];
  const series = computeAnalytics(store(txns, [acct("acct_a", "TFSA")])).ledger.series;
  expect(series[0]).toMatchObject({
    inflow: 700,
    outflow: -150,
    external_in: 700,
    external_out: -150,
    deposits: 550,
  });
});

test("externalFlow: an EFT TRANSFER_IN is external, a TRFINTF TRANSFER_IN is internal", () => {
  expect(externalFlow(txn({ type: "TRANSFER_IN", raw_type: "EFT" }))).toBe("in");
  expect(externalFlow(txn({ type: "TRANSFER_IN", raw_type: "TRFINTF" }))).toBeNull();
});

test("externalFlow: a plain 'Transfer out to RRSP' TRFOUT is internal, an E_TRFOUT is external", () => {
  expect(
    externalFlow(
      txn({
        type: "TRANSFER_OUT",
        raw_type: "TRFOUT",
        description_redacted: "Transfer out to RRSP",
      }),
    ),
  ).toBeNull();
  expect(externalFlow(txn({ type: "TRANSFER_OUT", raw_type: "E_TRFOUT" }))).toBe("out");
});

test("internal transfers (TRFINTF/TRFOUTTF/generic TRFOUT) do not count as external_in/out", () => {
  const txns = [
    txn({ type: "TRANSFER_IN", raw_type: "TRFINTF", amount: 300 }),
    txn({ type: "TRANSFER_OUT", raw_type: "TRFOUTTF", amount: -100 }),
    txn({
      type: "TRANSFER_OUT",
      raw_type: "TRFOUT",
      amount: -50,
      description_redacted: "Transfer out",
    }),
  ];
  const series = computeAnalytics(store(txns, [acct("acct_a", "TFSA")])).ledger.series;
  // external_in/out and the cashflow inflow/outflow exclude internal transfers,
  // but `deposits` (net money in) includes every transfer: 300 in - 150 out = 150.
  // These internal transfers cancel across accounts at the portfolio aggregate.
  expect(series[0]).toMatchObject({
    external_in: 0,
    external_out: 0,
    deposits: 150,
    inflow: 0,
    outflow: 0,
  });
});

test("CAD dividend in a taxable account lands in eligible_dividends", () => {
  const txns = [txn({ type: "DIV", amount: 100, currency: "CAD" })];
  const series = computeAnalytics(store(txns, [acct("acct_a", "NonRegistered")])).ledger.series;
  expect(series[0]).toMatchObject({ eligible_dividends: 100, foreign_income: 0, interest: 0 });
});

test("USD dividend in a taxable account lands in foreign_income", () => {
  const txns = [
    txn({ type: "DIV", amount: 50, currency: "USD" }),
    txn({ type: "CONTRIB", amount: 1, currency: "CAD" }),
  ];
  const series = computeAnalytics(store(txns, [acct("acct_a", "NonRegistered")])).ledger.series;
  expect(series[0]).toMatchObject({ foreign_income: 50, eligible_dividends: 0 });
});

test("interest in a taxable account lands in interest", () => {
  const txns = [txn({ type: "INT", amount: 20, currency: "CAD" })];
  const series = computeAnalytics(store(txns, [acct("acct_a", "NonRegistered")])).ledger.series;
  expect(series[0]).toMatchObject({ interest: 20, eligible_dividends: 0, foreign_income: 0 });
});

test("a registered account's dividend contributes nothing to the tax splits", () => {
  const txns = [txn({ type: "DIV", amount: 100, currency: "CAD" })];
  const series = computeAnalytics(store(txns, [acct("acct_a", "TFSA")])).ledger.series;
  expect(series[0]).toMatchObject({ eligible_dividends: 0, foreign_income: 0, interest: 0 });
  // income (the coarse Growth-section figure) is unaffected by the taxable split.
  expect(series[0]?.income).toBe(100);
});

test("a sell produces the right realized_gain in the sell's month", () => {
  const txns = [
    txn({ type: "BUY", symbol: "X", quantity: 10, amount: -100, date: "2025-01-01" }),
    txn({ type: "SELL", symbol: "X", quantity: 5, amount: 80, date: "2025-02-01" }),
  ];
  const series = computeAnalytics(store(txns, [acct("acct_a", "NonRegistered")])).ledger.series;
  // avg cost 10/share; sold 5 -> cost 50; proceeds 80 -> gain 30, in the sell's month.
  const feb = series.find((s) => s.month === "2025-02");
  expect(feb?.realized_gain).toBe(30);
  const jan = series.find((s) => s.month === "2025-01");
  expect(jan?.realized_gain).toBe(0);
});

test("flows contains only external transactions, excluding internal transfers", () => {
  const txns = [
    txn({ type: "CONTRIB", amount: 500, date: "2025-03-05", description_redacted: "Contribution" }),
    txn({
      type: "TRANSFER_IN",
      raw_type: "EFT",
      amount: 200,
      date: "2025-03-10",
      description_redacted: "Transfer in",
    }),
    txn({
      type: "TRANSFER_OUT",
      raw_type: "E_TRFOUT",
      amount: -150,
      date: "2025-04-01",
      description_redacted: "Transfer out",
    }),
    // internal transfer between the owner's own accounts — excluded.
    txn({
      type: "TRANSFER_IN",
      raw_type: "TRFINTF",
      amount: 999,
      date: "2025-04-02",
      description_redacted: "Transfer in",
    }),
    txn({ type: "BUY", symbol: "L", quantity: 1, amount: -60, date: "2025-03-06" }),
    txn({ type: "DIV", amount: 10, date: "2025-03-07" }),
  ];
  const flows = computeAnalytics(store(txns, [acct("acct_a", "TFSA")])).ledger.flows;
  expect(flows).toHaveLength(3);
  expect(flows.map((f) => f.type)).toEqual(["CONTRIB", "TRANSFER_IN", "TRANSFER_OUT"]);
  expect(flows[0]).toMatchObject({
    account_id: "acct_a",
    month: "2025-03",
    date: "2025-03-05",
    amount: 500,
    description: "Contribution",
  });
});
