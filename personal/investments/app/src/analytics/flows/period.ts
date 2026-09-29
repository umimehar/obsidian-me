import type { FlowAccount, FlowsData } from "./types";

/** Inclusive "YYYY-MM" bounds. String comparison sorts these correctly. */
export interface FlowPeriod {
  from: string;
  to: string;
}

export function inPeriod(period: string, p: FlowPeriod): boolean {
  return period >= p.from && period <= p.to;
}

/** The full span the committed cash blocks cover. */
export function allTime(data: FlowsData): FlowPeriod {
  const periods = data.blocks.map((b) => b.period);
  if (periods.length === 0) throw new Error("no flow blocks to bound a period");
  return {
    from: periods.reduce((min, p) => (p < min ? p : min)),
    to: periods.reduce((max, p) => (p > max ? p : max)),
  };
}

/** The latest reported month, as a one-month period. */
export function latestMonth(data: FlowsData): FlowPeriod {
  const { to } = allTime(data);
  return { from: to, to };
}

export function yearPeriod(year: number): FlowPeriod {
  return { from: `${year}-01`, to: `${year}-12` };
}

/**
 * Every selected, still-active account missing a statement at the period's
 * end: still open (its own recorded range covers `p.to`) with no block
 * there, or fell behind before `p.to` while some OTHER selected account
 * does report at `p.to` -- evidence the period genuinely closed and this
 * account simply lagged, rather than the whole corpus not having reached
 * that month yet for anyone. An account `build.ts` marked `closed` (its
 * latest statement states a $0 balance) is never named: it stopped
 * reporting because it was closed, not because it is missing.
 */
export function missingAccounts(
  data: FlowsData,
  p: FlowPeriod,
  accounts: ReadonlySet<string>,
): FlowAccount[] {
  const selected = data.accounts.filter((a) => accounts.has(a.accountId) && !a.closed);
  const reportedAtTo = new Set(
    data.blocks.filter((b) => b.period === p.to).map((b) => b.accountId),
  );
  const anyReportsAtTo = selected.some((a) => reportedAtTo.has(a.accountId));

  return selected.filter((a) => {
    if (reportedAtTo.has(a.accountId)) return false;
    const stillOpen = a.firstPeriod <= p.to && a.lastPeriod >= p.to;
    if (stillOpen) return true;
    return a.lastPeriod < p.to && anyReportsAtTo;
  });
}
