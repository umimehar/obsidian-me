import { periodExtent } from "./portfolioSeries";
import type { AccountSeries } from "./types";

export { periodExtent as cashflowPeriodExtent };

/**
 * One period's deposits and withdrawals, summed over the `inTotals: true`
 * accounts that have a statement that period.
 *
 * `deposits` and `withdrawals` are real, stated zeroes here, never a stand-in
 * for absence -- `MonthPoint.deposits`/`withdrawals` are zero whenever a
 * statement states no `paidIn`/`paidOut` block (a CASH-template statement),
 * which is a fact about that month, not a missing figure. The absence this
 * module actually cares about is a period with no `CashflowPoint` at all: no
 * account had a statement that period, so there is nothing to sum and the
 * period is left out of the returned array rather than zero-filled.
 */
export interface CashflowPoint {
  /** `YYYY-MM`. */
  period: string;
  deposits: number;
  withdrawals: number;
  /** How many accounts had a statement this period, and so contributed to the sum. */
  accountCount: number;
}

interface Accumulator {
  deposits: number;
  withdrawals: number;
  accountCount: number;
}

/**
 * Builds the monthly cashflow series from the per-account series in
 * `analytics.json`: deposits and withdrawals, summed across the
 * `inTotals: true` accounts, one entry per period any of them has a
 * statement for.
 *
 * Matches `buildPortfolioSeries`'s two rules, applied to a field that is
 * never null instead of one that sometimes is:
 *
 * - Only `inTotals: true` accounts contribute (the Cash/Chequing accounts
 *   are excluded from every total).
 * - A period contributes to the map only when an account actually has a
 *   `MonthPoint` for it. `deposits`/`withdrawals` are never null, so unlike
 *   `buildPortfolioSeries` there is no per-field skip -- the presence of the
 *   month itself, not a null check on its fields, is what decides whether a
 *   period is drawn. A month absent from `months[]` entirely never reaches
 *   this loop, so it is not in the returned array either, which is what
 *   keeps a real stated zero and an unstated month two different things all
 *   the way to the chart.
 */
export function buildCashflowSeries(series: readonly AccountSeries[]): CashflowPoint[] {
  const byPeriod = new Map<string, Accumulator>();

  for (const account of series) {
    if (!account.inTotals) continue;
    for (const month of account.months) {
      const entry = byPeriod.get(month.period) ?? { deposits: 0, withdrawals: 0, accountCount: 0 };
      entry.deposits += month.deposits;
      entry.withdrawals += month.withdrawals;
      entry.accountCount += 1;
      byPeriod.set(month.period, entry);
    }
  }

  return [...byPeriod.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([period, totals]) => ({ period, ...totals }));
}
