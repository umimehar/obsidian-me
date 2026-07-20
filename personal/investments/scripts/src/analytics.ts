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
  deposits: number;
  income: number;
  inflow: number;
  outflow: number;
  cash: number | null;
  acb: number | null;
}

export interface Ledger {
  accounts: Array<{ id: string; kind: string; name: string; short_id: string; currency: string }>;
  months: string[];
  series: LedgerSeriesRow[];
  holdings: Array<{ account_id: string; symbol: string; qty: number; acb: number }>;
  limits: Record<string, Record<string, number>>;
  tax: Tax;
}

export interface Analytics {
  ledger: Ledger;
}

const month = (date: string): string => date.slice(0, 7);
const round2 = (v: number): number => Math.round(v * 100) / 100;

function kindsOf(store: Datastore): Map<string, string> {
  return new Map(store.accounts.map((a) => [a.masked_id, a.kind]));
}

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

// Money genuinely put into an account nets across three codes, not one.
// Wealthsimple only tags a deposit "CONT" when it lands in the registered
// account as an explicit contribution; the same money often arrives coded
// TRFIN instead (e.g. the Managed TFSA and RESP each received a 450 deposit
// as a transfer, and Direct Indexing / Non-registered are funded almost
// entirely by TRFIN). Summing CONT alone therefore undercounts real deposits.
// `deposits` = CONT + TRANSFER_IN - TRANSFER_OUT is the net-money-in figure
// that lines up with the brokerage app's "Net deposits".
//
// Caveat kept deliberately visible: the statements cannot tell an INTERNAL
// transfer between your own accounts from an EXTERNAL withdrawal/deposit — both
// are just TRFIN/TRFOUT — so `deposits` will not tie to the app to the cent when
// money was shuffled between your own accounts (see d77c's 2023 setup churn).
const DEPOSIT_TYPES = new Set(["CONTRIB", "TRANSFER_IN", "TRANSFER_OUT"]);

interface FlowRec {
  contrib: number;
  deposits: number;
  income: number;
  inflow: number;
  outflow: number;
}

function foldFlow(txn: Txn, r: FlowRec): void {
  const { type, amount } = txn;
  if (INCOME_TYPES.has(type) && amount > 0) r.income += amount;
  if (type === "CONTRIB") r.contrib += amount;
  if (DEPOSIT_TYPES.has(type)) r.deposits += amount;
  // inflow/outflow count only external money movement (deposits/withdrawals
  // to/from the account), not internal churn like BUY/SELL/DIV/INT.
  if (type === "CONTRIB" || type === "TRANSFER_IN") r.inflow += amount;
  if (type === "TRANSFER_OUT") r.outflow += amount;
}

type LedgerCore = Omit<Ledger, "tax">;

export function buildLedger(store: Datastore): LedgerCore {
  const acb = acbMonthly(store);
  const rec = new Map<string, FlowRec>();
  const cash = new Map<string, [string, number]>();
  for (const txn of store.transactions) {
    if (txn.currency !== "CAD") continue;
    const key = `${txn.account_id}|${month(txn.date)}`;
    let r = rec.get(key);
    if (!r) {
      r = { contrib: 0, deposits: 0, income: 0, inflow: 0, outflow: 0 };
      rec.set(key, r);
    }
    foldFlow(txn, r);
    if (txn.balance !== null) {
      const prev = cash.get(key);
      if (!prev || txn.date >= prev[0]) cash.set(key, [txn.date, txn.balance]);
    }
  }
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
      deposits: round2(r.deposits),
      income: round2(r.income),
      inflow: round2(r.inflow),
      outflow: round2(r.outflow),
      cash: c ? round2(c[1]) : null,
      acb: acb.has(key) ? round2(acb.get(key) ?? 0) : null,
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
  };
}

export function computeAnalytics(store: Datastore): Analytics {
  const core = buildLedger(store);
  const currentYear = (store.meta.source_range.end ?? new Date().toISOString()).slice(0, 4);
  const ledger: Ledger = {
    ...core,
    tax: buildTax(store, currentYear),
  };
  return { ledger };
}

export interface TaxYear {
  year: string;
  room: Array<{ group: string; used: number; limit: number; remaining: number }>;
  rrsp_deduction_available: number;
  income: { interest: number; eligible_dividends: number; foreign_income: number };
  realized_gains: number;
}
export interface Tax {
  current_year: string;
  years: TaxYear[];
}

const TAXABLE_KINDS = new Set(["NonRegistered", "DirectIndexing", "Crypto", "PE", "Other"]);
const REG_GROUP: Record<string, string> = {
  TFSA: "TFSA",
  ManagedTFSA: "TFSA",
  FHSA: "FHSA",
  RRSP: "RRSP",
  RESP: "RESP",
};

function realizedGainByYear(store: Datastore, taxable: Set<string>): Map<string, number> {
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
      out.set(t.date.slice(0, 4), (out.get(t.date.slice(0, 4)) ?? 0) + gain);
      p.cost -= costOut;
      p.qty -= t.quantity ?? 0;
    }
  }
  return out;
}

export function buildTax(store: Datastore, currentYear: string): Tax {
  const kinds = kindsOf(store);
  const taxable = new Set(
    store.accounts.filter((a) => TAXABLE_KINDS.has(a.kind)).map((a) => a.masked_id),
  );
  const years = new Set<string>([currentYear]);
  for (const t of store.transactions) years.add(t.date.slice(0, 4));

  const gainsByYear = realizedGainByYear(store, taxable);

  const built: TaxYear[] = [...years]
    .filter((y) => y)
    .sort()
    .map((year) => {
      const income = { interest: 0, eligible_dividends: 0, foreign_income: 0 };
      const roomUsed: Record<string, number> = { TFSA: 0, FHSA: 0, RRSP: 0, RESP: 0 };
      for (const t of store.transactions) {
        if (t.date.slice(0, 4) !== year) continue;
        const group = REG_GROUP[kinds.get(t.account_id) ?? ""];
        if (group && t.type === "CONTRIB") roomUsed[group] = (roomUsed[group] ?? 0) + t.amount;
        if (!taxable.has(t.account_id)) continue;
        if (t.type === "INT" && t.amount > 0) income.interest += t.amount;
        if ((t.type === "DIV" || t.type === "STKDIV") && t.amount > 0) {
          if (t.currency === "USD") income.foreign_income += t.amount;
          else income.eligible_dividends += t.amount;
        }
      }
      const room = (["TFSA", "FHSA", "RRSP", "RESP"] as const).map((group) => {
        const limit = CONTRIBUTION_LIMITS[group]?.[year] ?? 0;
        const used = round2(roomUsed[group] ?? 0);
        return {
          group,
          used,
          limit,
          remaining: round2(limit - used),
        };
      });
      const rrsp = room.find((r) => r.group === "RRSP");
      return {
        year,
        room,
        rrsp_deduction_available: Math.max(rrsp?.remaining ?? 0, 0),
        income: {
          interest: round2(income.interest),
          eligible_dividends: round2(income.eligible_dividends),
          foreign_income: round2(income.foreign_income),
        },
        realized_gains: round2(gainsByYear.get(year) ?? 0),
      };
    });
  return { current_year: currentYear, years: built };
}
