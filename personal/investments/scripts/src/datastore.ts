// Assemble parsed, classified, masked rows into a datastore object.
import { classify } from "./classify";
import {
  type Redactions,
  accountCodeFromFilename,
  detectKind,
  maskAccountCode,
  redact,
  shortAccountId,
} from "./mask";
import { type RawRow, SCHEMA_CARD, discoverCsvs, parseCsv } from "./parse";

const SCHEMA_VERSION = 1;

// Display names, keyed by `short_id` — the 4-char hash prefix the page already
// shows, never the real account number, which must never reach source control.
// The owner asked for these by name to tell four RRSPs apart; see this
// project's CLAUDE.md. Accounts absent here fall back to their kind.
// Kind overrides, keyed by `short_id`, for accounts whose kind cannot be read
// off the statement filename. 91b8 arrives as "Other" because its filename is
// a company name; it is a corporate investing account, and its own kind
// matters: it is deliberately absent from TAXABLE_KINDS in analytics.ts, since
// investment income inside a corporation is taxed in the corporation, not on
// the owner's personal return. Leaving it as "Other" fed its dividends into
// the personal tax estimate.
const ACCOUNT_KINDS: Record<string, string> = {
  "91b8": "Corporate",
};

const ACCOUNT_LABELS: Record<string, string> = {
  "2318": "Umar RRSP",
  d6d9: "Umar RRSP PE",
  "97ab": "Maham Spousal RRSP",
  // 8cd3 is a staging account: 81,057 in, 81,057 out, ends at zero. It routes
  // contributions to the three RRSPs above and holds nothing of its own.
  "8cd3": "RRSP staging",
  "91b8": "Corporate Investing",
};
const KNOWN_OTHER = new Set(["ROC"]);

export interface Txn {
  account_id: string;
  date: string;
  post_date: string | null;
  type: string;
  raw_type: string;
  symbol: string | null;
  quantity: number | null;
  unit_price: number | null;
  fx_rate: number | null;
  amount: number;
  balance: number | null;
  currency: string;
  description_redacted: string;
}

export interface Account {
  masked_id: string;
  kind: string;
  name: string;
  short_id: string;
  currency: string;
  first_activity: string;
  last_activity: string;
  txn_count: number;
}

export interface Datastore {
  meta: {
    generated_at: string;
    schema_version: number;
    file_count: number;
    txn_count: number;
    source_range: { start: string | null; end: string | null };
    warnings: { unmapped_types: Record<string, number> };
  };
  accounts: Account[];
  transactions: Txn[];
}

function toFloat(value: string | undefined): number | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  const n = Number.parseFloat(text);
  return Number.isNaN(n) ? null : n;
}

function rowToTxn(row: RawRow, accountId: string, red: Redactions): Txn {
  const isCard = row.schema === SCHEMA_CARD;
  const date = isCard ? (row.fields.transaction_date ?? "") : (row.fields.date ?? "");
  const description = isCard ? (row.fields.details ?? "") : (row.fields.description ?? "");
  const ex = classify(row);
  return {
    account_id: accountId,
    date,
    post_date: isCard ? (row.fields.post_date ?? null) : null,
    type: ex.type,
    raw_type: isCard ? (row.fields.type ?? "") : (row.fields.transaction ?? ""),
    symbol: ex.symbol,
    quantity: ex.quantity,
    unit_price: ex.unitPrice,
    fx_rate: ex.fxRate,
    amount: toFloat(row.fields.amount) ?? 0,
    balance: toFloat(row.fields.balance),
    currency: row.fields.currency ?? "",
    description_redacted: redact(description, red),
  };
}

function touchAccount(
  accounts: Map<string, Account>,
  accountId: string,
  kind: string,
  shortId: string,
  txn: Txn,
): void {
  let acct = accounts.get(accountId);
  if (!acct) {
    acct = {
      masked_id: accountId,
      kind,
      name: ACCOUNT_LABELS[shortId] ?? kind,
      short_id: shortId,
      currency: txn.currency,
      first_activity: txn.date,
      last_activity: txn.date,
      txn_count: 0,
    };
    accounts.set(accountId, acct);
  }
  acct.txn_count += 1;
  if (txn.date < acct.first_activity) acct.first_activity = txn.date;
  if (txn.date > acct.last_activity) acct.last_activity = txn.date;
}

function collectWarnings(transactions: Txn[]): { unmapped_types: Record<string, number> } {
  const unmapped: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type === "OTHER" && !KNOWN_OTHER.has(t.raw_type.trim().toUpperCase())) {
      unmapped[t.raw_type] = (unmapped[t.raw_type] ?? 0) + 1;
    }
  }
  return { unmapped_types: unmapped };
}

function dateRange(transactions: Txn[]): { start: string | null; end: string | null } {
  const dates = transactions.map((t) => t.date).filter((d) => d);
  if (dates.length === 0) return { start: null, end: null };
  dates.sort();
  return { start: dates[0] ?? null, end: dates[dates.length - 1] ?? null };
}

export function buildDatastore(sourceDir: string, redactions: Redactions): Datastore {
  const files = discoverCsvs(sourceDir);
  const accounts = new Map<string, Account>();
  const transactions: Txn[] = [];
  for (const path of files) {
    const name = path.split("/").pop() ?? path;
    const accountId = maskAccountCode(accountCodeFromFilename(name));
    const shortId = shortAccountId(accountCodeFromFilename(name));
    const kind = ACCOUNT_KINDS[shortId] ?? detectKind(name);
    for (const row of parseCsv(path)) {
      const txn = rowToTxn(row, accountId, redactions);
      transactions.push(txn);
      touchAccount(accounts, accountId, kind, shortId, txn);
    }
  }
  const sorted = [...accounts.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  return {
    meta: {
      generated_at: new Date().toISOString(),
      schema_version: SCHEMA_VERSION,
      file_count: files.length,
      txn_count: transactions.length,
      source_range: dateRange(transactions),
      warnings: collectWarnings(transactions),
    },
    accounts: sorted,
    transactions,
  };
}
