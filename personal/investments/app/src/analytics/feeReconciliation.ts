import type { AnalyticsOutput } from "./build";

/** One account's gap, for one year, between its stated fees and what activity rows account for. */
export interface FeeGap {
  maskedId: string;
  label: string;
  /** Stated minus derived, CAD. Positive: the statements state more than any FEE/REIMB row does. */
  gap: number;
}

function periodYear(period: string): number {
  return Number(period.slice(0, 4));
}

/** An account's derived (activity-row) and stated (cash-summary) fee totals for one year. */
function feeTotalsByAccount(
  activity: AnalyticsOutput["activity"],
  statedFees: AnalyticsOutput["statedFees"],
  year: number,
): { derived: Map<string, number>; stated: Map<string, number> } {
  const derived = new Map<string, number>();
  for (const [period, byAccount] of Object.entries(activity)) {
    if (periodYear(period) !== year) continue;
    for (const [id, totals] of Object.entries(byAccount)) {
      derived.set(id, (derived.get(id) ?? 0) + totals.fees);
    }
  }
  const stated = new Map<string, number>();
  for (const [period, byAccount] of Object.entries(statedFees)) {
    if (periodYear(period) !== year) continue;
    for (const [id, fee] of Object.entries(byAccount)) {
      stated.set(id, (stated.get(id) ?? 0) + fee);
    }
  }
  return { derived, stated };
}

/**
 * Where an `inTotals` account's statements state more (or less) in fees,
 * for one calendar year, than any `FEE`/`REIMB` activity row accounts for --
 * a fact about an account that bundles a trading cost into a trade's own
 * price rather than itemising it, never a parsing gap to chase. Sorted by
 * the size of the gap, largest first; a gap under a cent is rounding, not a
 * finding, and is left out.
 */
export function feeReconciliationGaps(analytics: AnalyticsOutput, year: number): FeeGap[] {
  const { derived, stated } = feeTotalsByAccount(analytics.activity, analytics.statedFees, year);
  const gaps: FeeGap[] = [];
  for (const account of analytics.series) {
    if (!account.inTotals) continue;
    const gap = (stated.get(account.maskedId) ?? 0) - (derived.get(account.maskedId) ?? 0);
    if (Math.abs(gap) > 0.01) gaps.push({ maskedId: account.maskedId, label: account.label, gap });
  }
  return gaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}
