import type { Statement } from "../types";
import { type AccountKind, type ManagementStyle, classifyAccountType, maskAccountNo } from "./mask";

export type Purpose = "retirement" | "house" | "education" | "business" | "spending" | "unassigned";

export interface AccountRecord {
  maskedId: string;
  shortId: string;
  label: string;
  kind: AccountKind;
  style: ManagementStyle;
  purpose: Purpose;
  inTotals: boolean;
  firstPeriod: string;
  lastPeriod: string;
  statementCount: number;
  /** Distinct account-type wordings seen, oldest first. Wording drifts over years. */
  typeHistory: string[];
}

/** Owner-reviewed, keyed by the 4-char short id the interface shows. */
const LABELS: Record<string, string> = {};
const PURPOSES: Record<string, Purpose> = {};

const EXCLUDED_KINDS: readonly AccountKind[] = ["Chequing"];

/**
 * Kind comes from the account's MOST RECENT statement, because the wording has
 * changed twice and the latest form is the one the mapping table is richest in.
 * Earlier statements disagreeing on kind is a reconciliation finding (Task 10),
 * not something resolved here.
 */
export function buildRegistry(statements: readonly Statement[]): AccountRecord[] {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) {
    const list = byAccount.get(s.source.accountNo) ?? [];
    list.push(s);
    byAccount.set(s.source.accountNo, list);
  }

  const records: AccountRecord[] = [];
  for (const [accountNo, group] of byAccount) {
    const sorted = [...group].sort((a, b) => a.source.period.localeCompare(b.source.period));
    const latest = sorted[sorted.length - 1];
    const earliest = sorted[0];
    if (!latest || !earliest) continue;

    const { maskedId, shortId } = maskAccountNo(accountNo);
    const { kind, style } = classifyAccountType(latest.accountType);

    records.push({
      maskedId,
      shortId,
      label: LABELS[shortId] ?? `${kind} ${shortId}`,
      kind,
      style,
      purpose: PURPOSES[shortId] ?? "unassigned",
      inTotals: !EXCLUDED_KINDS.includes(kind),
      firstPeriod: earliest.source.period,
      lastPeriod: latest.source.period,
      statementCount: sorted.length,
      typeHistory: [...new Set(sorted.map((s) => s.accountType))],
    });
  }
  return records.sort((a, b) => a.shortId.localeCompare(b.shortId));
}
