// Normalize raw transaction codes and extract structured fields from descriptions.
import { type RawRow, SCHEMA_CARD } from "./parse";

const TYPE_MAP: Record<string, string> = {
  BUY: "BUY",
  SELL: "SELL",
  DIV: "DIV",
  STKDIV: "STKDIV",
  INT: "INT",
  FPLINT: "INT",
  FEE: "FEE",
  NRT: "TAX",
  CONT: "CONTRIB",
  GRANT: "GRANT",
  TRFIN: "TRANSFER_IN",
  TRFINTF: "TRANSFER_IN",
  E_TRFIN: "TRANSFER_IN",
  AFT_IN: "TRANSFER_IN",
  TRFOUT: "TRANSFER_OUT",
  TRFOUTTF: "TRANSFER_OUT",
  E_TRFOUT: "TRANSFER_OUT",
  FXCONVERSION: "FX",
  LOAN: "LENDING",
  RECALL: "LENDING",
  STKREORG: "REORG",
  CASHBACK: "REWARD",
  REIMB: "REWARD",
  REFER: "REWARD",
  GIVEAWAY: "REWARD",
  AFFILIATE: "REWARD",
  SPEND: "CARD_PURCHASE",
  DEP: "TRANSFER_IN",
  P2P_SENT: "TRANSFER_OUT",
  ROC: "OTHER",
};

const SIGN_BASED = new Set(["EFT"]);

const SYMBOL_RE = /^([A-Z0-9][A-Z0-9./]*)\s+-\s+/;
const SHARES_RE =
  /(?:Bought|Sold)\s+([\d.]+)\s+(?:shares?|ounces?|units?|coins?)(?:\s+at\s+\$([\d.]+)\s+per\s+\w+)?/;
const CRYPTO_RE = /(?:Purchase|Sale) of ([\d.]+)\s+([A-Z]{2,10})\b/;
const STKDIV_RE = /distribution of ([\d.]+)\s+units.*?valued at \$([\d.]+)/;
const FX_RE = /FX Rate:\s*([\d.]+)/;

export interface Extracted {
  readonly type: string;
  readonly symbol: string | null;
  readonly quantity: number | null;
  readonly unitPrice: number | null;
  readonly fxRate: number | null;
}

function cardType(rawType: string): string {
  const lowered = rawType.trim().toLowerCase();
  if (lowered.startsWith("purchase")) return "CARD_PURCHASE";
  if (lowered.startsWith("payment")) return "CARD_PAYMENT";
  if (lowered.startsWith("refund")) return "CARD_REFUND";
  return "REWARD";
}

export function normalizeType(rawType: string, amount: number, schema: string): string {
  if (schema === SCHEMA_CARD) return cardType(rawType);
  const code = rawType.trim().toUpperCase();
  if (SIGN_BASED.has(code)) return amount >= 0 ? "TRANSFER_IN" : "TRANSFER_OUT";
  return TYPE_MAP[code] ?? "OTHER";
}

interface Details {
  symbol: string | null;
  quantity: number | null;
  unitPrice: number | null;
  fxRate: number | null;
}

function extractDetails(description: string): Details {
  let symbol: string | null = null;
  let quantity: number | null = null;
  let unitPrice: number | null = null;
  const sym = SYMBOL_RE.exec(description);
  if (sym?.[1]) symbol = sym[1];
  const shares = SHARES_RE.exec(description);
  const stkdiv = STKDIV_RE.exec(description);
  const crypto = CRYPTO_RE.exec(description);
  if (shares?.[1]) {
    quantity = Number.parseFloat(shares[1]);
    unitPrice = shares[2] ? Number.parseFloat(shares[2]) : null;
  } else if (stkdiv?.[1] && stkdiv[2]) {
    quantity = Number.parseFloat(stkdiv[1]);
    unitPrice = Number.parseFloat(stkdiv[2]);
  } else if (crypto?.[1] && crypto[2]) {
    quantity = Number.parseFloat(crypto[1]);
    symbol = crypto[2];
  }
  const fx = FX_RE.exec(description);
  const fxRate = fx?.[1] ? Number.parseFloat(fx[1]) : null;
  return { symbol, quantity, unitPrice, fxRate };
}

// Derive a per-unit price when the description omits it; only for same-currency
// rows (an FX-converted amount cannot be divided by a native-currency price).
function deriveUnitPrice(d: Details, amount: number): number | null {
  if (d.unitPrice !== null || d.quantity === null || d.quantity === 0) return d.unitPrice;
  if (d.fxRate !== null || amount === 0) return d.unitPrice;
  return Math.round((Math.abs(amount) / d.quantity) * 10000) / 10000;
}

export function classify(row: RawRow): Extracted {
  const isCard = row.schema === SCHEMA_CARD;
  const rawType = isCard ? (row.fields.type ?? "") : (row.fields.transaction ?? "");
  const description = isCard ? (row.fields.details ?? "") : (row.fields.description ?? "");
  const amount = Number.parseFloat(row.fields.amount ?? "") || 0;
  const type = normalizeType(rawType, amount, row.schema);
  const d = extractDetails(description);
  const unitPrice = deriveUnitPrice(d, amount);
  return { type, symbol: d.symbol, quantity: d.quantity, unitPrice, fxRate: d.fxRate };
}
