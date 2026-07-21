// Compute the per-account-month "ledger" dataset the filter-driven page uses.
import type { Datastore, Txn } from "./datastore";

const INCOME_TYPES = new Set(["DIV", "STKDIV", "INT"]);
const CASH_CURRENCIES = new Set(["CAD", "USD"]);

// Annual context figures. RESP is the CESG-matched annual amount, not the
// $50,000 lifetime contribution limit.
export const CONTRIBUTION_LIMITS: Record<string, Record<string, number>> = {
  TFSA: { "2022": 6000, "2023": 6500, "2024": 7000, "2025": 7000, "2026": 7000 },
  FHSA: { "2023": 8000, "2024": 8000, "2025": 8000, "2026": 8000 },
  RRSP: { "2022": 29210, "2023": 30780, "2024": 31560, "2025": 32490, "2026": 33810 },
  RESP: { "2022": 2500, "2023": 2500, "2024": 2500, "2025": 2500, "2026": 2500 },
};

export interface LedgerSeriesRow {
  account_id: string;
  month: string;
  contrib: number;
  external_in: number;
  external_out: number;
  deposits: number;
  income: number;
  inflow: number;
  outflow: number;
  cash: number | null;
  acb: number | null;
  interest: number;
  eligible_dividends: number;
  foreign_income: number;
  realized_gain: number;
}

export interface LedgerFlow {
  account_id: string;
  month: string;
  date: string;
  type: string;
  amount: number;
  description: string;
}

export interface Ledger {
  accounts: Array<{ id: string; kind: string; name: string; short_id: string; currency: string }>;
  months: string[];
  series: LedgerSeriesRow[];
  holdings: Array<{ account_id: string; symbol: string; qty: number; acb: number }>;
  limits: Record<string, Record<string, number>>;
  flows: LedgerFlow[];
}

export interface Analytics {
  ledger: Ledger;
}

const month = (date: string): string => date.slice(0, 7);
const round2 = (v: number): number => Math.round(v * 100) / 100;

interface Position {
  qty: number;
  cost: number;
}

function applyTrade(pos: Map<string, Position>, txn: Txn): void {
  const symbol = txn.symbol;
  if (!symbol || txn.quantity === null) return;
  let p = pos.get(symbol);
  if (!p) {
    p = { qty: 0, cost: 0 };
    pos.set(symbol, p);
  }
  if (txn.type === "BUY" || txn.type === "STKDIV") {
    p.qty += txn.quantity;
    if (txn.amount < 0) p.cost += -txn.amount;
  } else if (txn.type === "SELL" && p.qty > 0) {
    const avg = p.cost / p.qty;
    p.cost -= avg * Math.min(txn.quantity, p.qty);
    p.qty -= txn.quantity;
  }
}

function acbMonthly(store: Datastore): Map<string, number> {
  const byAcct = new Map<string, Txn[]>();
  for (const t of store.transactions) {
    if (t.symbol && t.quantity !== null && t.currency === "CAD") {
      const list = byAcct.get(t.account_id) ?? [];
      list.push(t);
      byAcct.set(t.account_id, list);
    }
  }
  const out = new Map<string, number>();
  for (const [accountId, txns] of byAcct) {
    const pos = new Map<string, Position>();
    for (const txn of [...txns].sort((a, b) => a.date.localeCompare(b.date))) {
      applyTrade(pos, txn);
      let total = 0;
      for (const p of pos.values()) if (p.qty > 1e-9) total += Math.max(p.cost, 0);
      out.set(`${accountId}|${month(txn.date)}`, total);
    }
  }
  return out;
}

function holdingsAcb(store: Datastore): Ledger["holdings"] {
  const pos = new Map<string, Position>();
  const txns = store.transactions
    .filter((t) => t.symbol && t.quantity !== null && t.currency === "CAD")
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const txn of txns) {
    const key = `${txn.account_id}|${txn.symbol}`;
    let p = pos.get(key);
    if (!p) {
      p = { qty: 0, cost: 0 };
      pos.set(key, p);
    }
    if (txn.type === "BUY" || txn.type === "STKDIV") {
      p.qty += txn.quantity ?? 0;
      if (txn.amount < 0) p.cost += -txn.amount;
    } else if (txn.type === "SELL" && p.qty > 0) {
      const avg = p.cost / p.qty;
      p.cost -= avg * Math.min(txn.quantity ?? 0, p.qty);
      p.qty -= txn.quantity ?? 0;
    }
  }
  const out: Ledger["holdings"] = [];
  for (const [key, p] of [...pos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (p.qty <= 1e-9) continue;
    const [accountId, symbol] = key.split("|");
    out.push({
      account_id: accountId ?? "",
      symbol: symbol ?? "",
      qty: Math.round(p.qty * 1e6) / 1e6,
      acb: round2(Math.max(p.cost, 0)),
    });
  }
  return out;
}

// Wealthsimple codes both an external bank deposit and an internal transfer
// between the owner's own accounts as TRANSFER_IN/TRANSFER_OUT — the coded
// type alone cannot tell them apart. `raw_type` (the original statement
// code) can: bank EFTs, direct deposits, e-transfers received, and generic
// deposits carry a distinct code from account-to-account transfers. See
// CLAUDE.md's "External versus internal transfers" section for the full
// rationale and the hub-account caveat.
const EXTERNAL_IN_CODES = new Set(["EFT", "AFT_IN", "E_TRFIN", "DEP", "TRFIN"]);
const EXTERNAL_OUT_CODES = new Set(["E_TRFOUT", "P2P_SENT"]);
const EXTERNAL_OUT_DESC = /money transfer out|e-?transfer/i;

// `deposits` is the net-of-all-transfers money-in figure: CONTRIB plus every
// TRANSFER_IN and TRANSFER_OUT, netted. Internal transfers between the owner's
// own accounts appear as a matching out and in that cancel across accounts, so
// the aggregate equals true net external money in (about $215,013) without the
// hub-account double counting that summing gross `external_in` produces.
const DEPOSIT_TYPES = new Set(["CONTRIB", "TRANSFER_IN", "TRANSFER_OUT"]);

// Classifies a transaction as external money in/out, or internal (null).
// CONTRIB is always external in. TRANSFER_IN/TRANSFER_OUT are external only
// when the raw statement code (or, for withdrawals, the description) marks
// them as a real bank movement rather than a transfer between the owner's
// own accounts.
export function externalFlow(txn: Txn): "in" | "out" | null {
  if (txn.type === "CONTRIB") return "in";
  if (txn.type === "TRANSFER_IN" && EXTERNAL_IN_CODES.has(txn.raw_type)) return "in";
  if (
    txn.type === "TRANSFER_OUT" &&
    (EXTERNAL_OUT_CODES.has(txn.raw_type) || EXTERNAL_OUT_DESC.test(txn.description_redacted))
  ) {
    return "out";
  }
  return null;
}

const TAXABLE_KINDS = new Set(["NonRegistered", "DirectIndexing", "Crypto", "PE", "Other"]);

function taxableAccounts(store: Datastore): Set<string> {
  return new Set(store.accounts.filter((a) => TAXABLE_KINDS.has(a.kind)).map((a) => a.masked_id));
}

interface FlowRec {
  contrib: number;
  external_in: number;
  external_out: number;
  net_deposits: number;
  income: number;
  interest: number;
  eligible_dividends: number;
  foreign_income: number;
}

// CAD-tagged fields only: contrib/external_in/external_out/income are cash
// flow figures, and the currency field is too dirty to convert non-CAD
// amounts into CAD (see CLAUDE.md).
function foldFlow(txn: Txn, r: FlowRec): void {
  const { type, amount } = txn;
  if (INCOME_TYPES.has(type) && amount > 0) r.income += amount;
  if (type === "CONTRIB") r.contrib += amount;
  if (DEPOSIT_TYPES.has(type)) r.net_deposits += amount;
  const ext = externalFlow(txn);
  if (ext === "in") r.external_in += amount;
  if (ext === "out") r.external_out += amount;
}

// Taxable income splits are not CAD-gated: interest and dividends earned in
// USD are still real taxable income, just bucketed as foreign income instead
// of eligible dividends.
function foldTaxIncome(txn: Txn, r: FlowRec): void {
  const { type, amount, currency } = txn;
  if (type === "INT" && amount > 0) r.interest += amount;
  if ((type === "DIV" || type === "STKDIV") && amount > 0) {
    if (currency === "USD") r.foreign_income += amount;
    else if (currency === "CAD") r.eligible_dividends += amount;
  }
}

// Realized capital gain, bucketed by account and the month of the sell.
// Taxable accounts only, mirroring the account scope Tax previously used —
// not currency filtered, since a sell's proceeds are what CRA taxes.
function realizedGainMonthly(store: Datastore, taxable: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  const pos = new Map<string, Position>();
  const txns = store.transactions
    .filter((t) => t.symbol && t.quantity !== null && taxable.has(t.account_id))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const t of txns) {
    const key = `${t.account_id}|${t.symbol}`;
    let p = pos.get(key);
    if (!p) {
      p = { qty: 0, cost: 0 };
      pos.set(key, p);
    }
    if (t.type === "BUY" || t.type === "STKDIV") {
      p.qty += t.quantity ?? 0;
      if (t.amount < 0) p.cost += -t.amount;
    } else if (t.type === "SELL" && p.qty > 0) {
      const q = Math.min(t.quantity ?? 0, p.qty);
      const costOut = (p.cost / p.qty) * q;
      const gain = t.amount - costOut; // proceeds are positive on a sell
      const bucket = `${t.account_id}|${month(t.date)}`;
      out.set(bucket, (out.get(bucket) ?? 0) + gain);
      p.cost -= costOut;
      p.qty -= t.quantity ?? 0;
    }
  }
  return out;
}

// The transaction-level backing data for the cashflow chart and drill-down:
// every external CONTRIB/TRANSFER_IN/TRANSFER_OUT row, excluding internal
// transfers between the owner's own accounts.
function buildFlows(store: Datastore): LedgerFlow[] {
  return store.transactions
    .filter((t) => externalFlow(t) !== null)
    .map((t) => ({
      account_id: t.account_id,
      month: month(t.date),
      date: t.date,
      type: t.type,
      amount: t.amount,
      description: t.description_redacted,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildLedger(store: Datastore): Ledger {
  const acb = acbMonthly(store);
  const taxable = taxableAccounts(store);
  const gains = realizedGainMonthly(store, taxable);
  const rec = new Map<string, FlowRec>();
  const cash = new Map<string, [string, number]>();
  const recFor = (key: string): FlowRec => {
    let r = rec.get(key);
    if (!r) {
      r = {
        contrib: 0,
        external_in: 0,
        external_out: 0,
        net_deposits: 0,
        income: 0,
        interest: 0,
        eligible_dividends: 0,
        foreign_income: 0,
      };
      rec.set(key, r);
    }
    return r;
  };
  for (const txn of store.transactions) {
    const key = `${txn.account_id}|${month(txn.date)}`;
    if (txn.currency === "CAD") {
      foldFlow(txn, recFor(key));
      if (txn.balance !== null) {
        const prev = cash.get(key);
        if (!prev || txn.date >= prev[0]) cash.set(key, [txn.date, txn.balance]);
      }
    }
    if (taxable.has(txn.account_id)) foldTaxIncome(txn, recFor(key));
  }
  // A sell realizing a gain is not always accompanied by a CAD-tagged or
  // taxable-income transaction in the same account/month, so make sure its
  // bucket still gets a series row.
  for (const key of gains.keys()) recFor(key);

  const monthSet = new Set<string>();
  for (const k of rec.keys()) monthSet.add(k.split("|")[1] ?? "");
  for (const k of cash.keys()) monthSet.add(k.split("|")[1] ?? "");
  for (const k of acb.keys()) monthSet.add(k.split("|")[1] ?? "");
  const months = [...monthSet].filter((m) => m).sort();

  const series: LedgerSeriesRow[] = [];
  for (const [key, r] of [...rec.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [accountId, m] = key.split("|");
    const c = cash.get(key);
    series.push({
      account_id: accountId ?? "",
      month: m ?? "",
      contrib: round2(r.contrib),
      external_in: round2(r.external_in),
      external_out: round2(r.external_out),
      deposits: round2(r.net_deposits),
      income: round2(r.income),
      inflow: round2(r.external_in),
      outflow: round2(r.external_out),
      cash: c ? round2(c[1]) : null,
      acb: acb.has(key) ? round2(acb.get(key) ?? 0) : null,
      interest: round2(r.interest),
      eligible_dividends: round2(r.eligible_dividends),
      foreign_income: round2(r.foreign_income),
      realized_gain: round2(gains.get(key) ?? 0),
    });
  }
  const active = new Set<string>();
  for (const row of series) active.add(row.account_id);
  return {
    accounts: store.accounts
      .filter((a) => active.has(a.masked_id))
      .map((a) => ({
        id: a.masked_id,
        kind: a.kind,
        name: a.name ?? a.kind,
        short_id: a.short_id ?? a.masked_id.slice(5, 9),
        currency: a.currency,
      })),
    months,
    series,
    holdings: holdingsAcb(store),
    limits: CONTRIBUTION_LIMITS,
    flows: buildFlows(store),
  };
}

export function computeAnalytics(store: Datastore): Analytics {
  return { ledger: buildLedger(store) };
}
