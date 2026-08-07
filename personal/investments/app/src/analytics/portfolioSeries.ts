import type { AccountSeries } from "./types";

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

/**
 * The subset of `series` belonging to one rollup group, matched on
 * `maskedId`. Exists so a group's value over time is built by handing this
 * subset to `buildPortfolioSeries` -- the group charts sum exactly the way
 * the portfolio chart does, including the `inTotals` exclusion and the
 * no-zero-fill rule, rather than through a second aggregation that could
 * drift from it.
 */
export function seriesForAccounts(
  series: readonly AccountSeries[],
  accountIds: readonly string[],
): AccountSeries[] {
  const wanted = new Set(accountIds);
  return series.filter((account) => wanted.has(account.maskedId));
}

/**
 * A built series' `[first, last]` period, or null when it has no points to
 * take an extent from.
 *
 * Generic over anything shaped like a `{ period }`, so `buildCashflowSeries`
 * shares this rather than carrying its own copy -- both series are sorted
 * period lists built the same way, and a caller only ever needs the two ends.
 */
export function periodExtent(
  points: readonly { period: string }[],
): readonly [string, string] | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return null;
  return [first.period, last.period];
}
