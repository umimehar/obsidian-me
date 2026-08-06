import type { AccountSeries } from "../../analytics/types";

/**
 * One period's portfolio total, summed over the `inTotals: true` accounts
 * that actually have a stated figure that period.
 */
export interface PortfolioPoint {
  /** `YYYY-MM`. */
  period: string;
  marketValue: number;
  bookCost: number;
  /**
   * How many accounts contributed to this period's totals. Accounts start
   * at different dates, so this rises over the series -- the early part of
   * the line reflects fewer accounts, which is honest, not a bug.
   */
  accountCount: number;
}

interface Accumulator {
  marketValue: number;
  bookCost: number;
  accountCount: number;
}

/**
 * Builds the portfolio-wide value-over-time series from the per-account
 * series in `analytics.json`. There is no portfolio-level series in the
 * data, only a sparse `months[]` per account, so this sums them here.
 *
 * Two rules that are not negotiable:
 *
 * - Only `inTotals: true` accounts contribute (the Cash/Chequing accounts
 *   are excluded from every total, same as `lensTotal`/`rollup`).
 * - A period an account has no statement for contributes nothing to that
 *   period's sum -- it is never zero-filled. Zero-filling a gap would draw
 *   a fake dip where an account simply had not opened yet. `marketValue`
 *   and `bookCost` are also skipped together when either is null (a
 *   CASH-template statement), per `MonthPoint`'s own contract that the two
 *   are null in lockstep.
 */
export function buildPortfolioSeries(series: readonly AccountSeries[]): PortfolioPoint[] {
  const byPeriod = new Map<string, Accumulator>();

  for (const account of series) {
    if (!account.inTotals) continue;
    for (const month of account.months) {
      if (month.marketValue === null || month.bookCost === null) continue;
      const entry = byPeriod.get(month.period) ?? { marketValue: 0, bookCost: 0, accountCount: 0 };
      entry.marketValue += month.marketValue;
      entry.bookCost += month.bookCost;
      entry.accountCount += 1;
      byPeriod.set(month.period, entry);
    }
  }

  return [...byPeriod.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([period, totals]) => ({ period, ...totals }));
}
