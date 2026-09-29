import type { AccountKind } from "../../store/mask";
import { type AccountRecord, isPayrollDeposit } from "../../store/registry";
import type { ActivityRow, Statement } from "../../types";
import { convertToCad, isFeeRefund } from "../activity";
import type { FlowCategory, FlowRow, SourceCategory } from "./types";

const MOVEMENT_CODES = new Set([
  "CONT",
  "DEP",
  "TRFIN",
  "TRFINTF",
  "EFT",
  "E_TRFIN",
  "AFT_IN",
  "TRFOUT",
  "TRFOUTTF",
  "WD",
  "P2P_OUT",
  "CASH_PAYROLL",
  "CASH_INTERAC_IN",
  "CASH_INTERAC_OUT",
  "CASH_TRANSFER",
]);
const ZERO_CODES = new Set(["LOAN", "RECALL", "STKDIV", "STKDIS", "STKREORG", "ROC"]);
const INCOME_CODES = new Set([
  "DIV",
  "INT",
  "FPLINT",
  "CASHBACK",
  "REFER",
  "GIVEAWAY",
  "CASH_INTEREST",
  "CASH_REWARD",
]);
const FIXED: Readonly<Record<string, FlowCategory>> = {
  BUY: "buy",
  SELL: "saleProceeds",
  FEE: "fee",
  NRT: "withholding",
  GRANT: "grant",
  FXCONVERSION: "fxConversion",
  SPEND: "leftWealthsimple",
};
const IN_KIND = /Transfer of [\d.]+ shares (into|out of) the account/;
const SYMBOL = /^([A-Z0-9.]+) - /;
/** A crypto BUY/SELL description: "Purchase of 0.0028564000 BTC (executed at ...), FX Rate: ...". */
const CRYPTO_SYMBOL = /^(?:Purchase|Sale) of [\d.]+ ([A-Z]+) /;

function symbolOf(description: string): string {
  return SYMBOL.exec(description)?.[1] ?? CRYPTO_SYMBOL.exec(description)?.[1] ?? "";
}

/** A CASH template row's code, read off its description. The description itself never leaves the build. */
export function resolveCashCode(description: string): string {
  if (/^Direct deposit from/.test(description)) return "CASH_PAYROLL";
  if (/Interac e-Transfer® Received/.test(description)) return "CASH_INTERAC_IN";
  if (/Interac e-Transfer® Out/.test(description)) return "CASH_INTERAC_OUT";
  if (/^Interest earned/.test(description)) return "CASH_INTEREST";
  if (/^(Cash back|Referral bonus|Giveaway received)/.test(description)) return "CASH_REWARD";
  return "CASH_TRANSFER";
}

function outsideSource(kind: AccountKind, shortId: string, code: string): SourceCategory {
  if (kind === "Corporate") return "business";
  if (code === "AFT_IN" || code === "CASH_PAYROLL" || isPayrollDeposit(shortId, code)) {
    return "payroll";
  }
  if (code === "E_TRFIN" || code === "CASH_INTERAC_IN") return "interacIn";
  return "outsideBank";
}

function categoryOf(
  row: ActivityRow,
  code: string,
  signed: number,
  account: AccountRecord,
): FlowCategory {
  if (MOVEMENT_CODES.has(code)) {
    return signed > 0 ? outsideSource(account.kind, account.shortId, code) : "leftWealthsimple";
  }
  if (INCOME_CODES.has(code)) return "income";
  if (code === "REIMB") return isFeeRefund(row) ? "fee" : "income";
  const fixed = FIXED[code];
  if (fixed !== undefined) return fixed;
  throw new Error(`activity code ${code} has no flow category`);
}

/** One resolved row's shape, ahead of it being turned into a `FlowRow` or skipped. */
interface ResolvedRow {
  code: string;
  signed: number;
  inKind: boolean;
}

/** Resolves a row's CASH code and in-kind status, or throws for a nonzero zero-code row. */
function resolveRow(row: ActivityRow, s: Statement): ResolvedRow {
  const signed = row.credit - row.debit;
  const code = row.code === "" ? resolveCashCode(row.description) : row.code;
  const inKind = (code === "TRFIN" || code === "TRFOUT") && IN_KIND.test(row.description);
  if (ZERO_CODES.has(code) && signed !== 0) {
    throw new Error(`${s.source.file}: ${code} row carries cash (${signed})`);
  }
  return { code, signed, inKind };
}

function buildFlowRow(
  row: ActivityRow,
  index: number,
  s: Statement,
  account: AccountRecord,
  resolved: ResolvedRow,
): FlowRow {
  const { code, signed, inKind } = resolved;
  let category: FlowCategory;
  try {
    category = inKind ? "inKind" : categoryOf(row, code, signed, account);
  } catch (error) {
    throw new Error(`${s.source.file}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    id: `${account.shortId}:${s.source.period}:${s.source.template[0]}:${index}`,
    accountId: account.maskedId,
    period: s.source.period,
    date: row.date,
    code,
    category,
    movement: !inKind && MOVEMENT_CODES.has(code),
    amountCad: signed === 0 ? 0 : convertToCad(signed, row, s),
    currency: row.currency,
    amount: signed,
    fxRate: row.currency === "USD" ? s.fxRate : null,
    symbol: /^(BUY|SELL|DIV)$/.test(code) ? symbolOf(row.description) : "",
    pairId: null,
    lagDays: null,
  };
}

/**
 * One activity row turned into a `FlowRow`, or `null` for a row that carries
 * no cash and is not an in-kind transfer (a zero LOAN, RECALL, etc.). Split
 * out of `classifyStatement`, and split again into `resolveRow` and
 * `buildFlowRow`, to keep every function under the complexity limit.
 */
function classifyRow(
  row: ActivityRow,
  index: number,
  s: Statement,
  account: AccountRecord,
): FlowRow | null {
  const resolved = resolveRow(row, s);
  if (ZERO_CODES.has(resolved.code)) return null;
  if (resolved.signed === 0 && !resolved.inKind) return null;
  return buildFlowRow(row, index, s, account, resolved);
}

/** Every cash moving row of one statement as a `FlowRow`, in CAD at the statement's own rate. */
export function classifyStatement(s: Statement, account: AccountRecord): FlowRow[] {
  const rows: FlowRow[] = [];
  s.activity.forEach((row, index) => {
    const flowRow = classifyRow(row, index, s, account);
    if (flowRow !== null) rows.push(flowRow);
  });
  return rows;
}
