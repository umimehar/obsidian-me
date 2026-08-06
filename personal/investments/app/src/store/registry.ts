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

/**
 * A corporate investing account prints "Non-Registered Cash Account" on its
 * statements exactly like a real personal non-registered account -- nothing
 * in the document distinguishes the two, so this cannot be derived by
 * `classifyAccountType` and must be owner-supplied. The CSV-era pipeline this
 * app replaces carried the same override for the same account; missing it
 * inflated 2026 eligible dividends from $202 to $645 by feeding corporate
 * investment income into the personal tax estimate. Investment income inside
 * a corporation is taxed in the corporation and only reaches the owner when
 * dividended out, so this account must stay out of any personal tax grouping.
 */
const KIND_OVERRIDES: Record<string, AccountKind> = { "91b8": "Corporate" };

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
  const accountNoByShortId = new Map<string, string>();
  for (const [accountNo, group] of byAccount) {
    const sorted = [...group].sort(
      (a, b) =>
        a.source.period.localeCompare(b.source.period) || a.source.version - b.source.version,
    );
    const latest = sorted[sorted.length - 1];
    const earliest = sorted[0];
    if (!latest || !earliest) continue;

    const { maskedId, shortId } = maskAccountNo(accountNo);
    const priorAccountNo = accountNoByShortId.get(shortId);
    if (priorAccountNo !== undefined && priorAccountNo !== accountNo) {
      const prior = maskAccountNo(priorAccountNo);
      throw new Error(
        `shortId collision between ${prior.maskedId} and ${maskedId}: both hash to ${shortId}`,
      );
    }
    accountNoByShortId.set(shortId, accountNo);

    const { kind: documentKind, style } = classifyAccountType(latest.accountType);
    const kind = KIND_OVERRIDES[shortId] ?? documentKind;

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
