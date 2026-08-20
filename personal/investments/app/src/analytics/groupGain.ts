import { buildPortfolioSeries } from "./portfolioSeries";
import type { AccountSeries } from "./types";

/**
 * A group's most recent market value, book cost and the gain between them,
 * all read from one `PortfolioPoint` -- never `marketValue` from one source
 * and `bookCost` from another. That single-source rule is the point of this
 * function existing at all: a rollup's `total` sums each account's own
 * latest stated market value, while a built series' last point sums only
 * the accounts that happen to report in that specific period. The two are
 * the same number today, because every counted account's latest statement
 * is 2026-06, but they are different bases and will diverge the day one
 * account's statement lags another's. Subtracting `group.total` (one basis)
 * from a series' `bookCost` (a different basis) would be a mixed-basis
 * subtraction that happens to look right until that day. Taking both figures
 * from the same `PortfolioPoint` is not exposed to that failure mode.
 *
 * Null when the group has no period with both figures stated at all --
 * a group of only `inTotals: false` accounts (Cash in the registration
 * lens, Spending in the purpose lens), which never gets a `PortfolioPoint`
 * from `buildPortfolioSeries` in the first place.
 */
export interface GroupGain {
  marketValue: number;
  bookCost: number;
  gain: number;
}

export function latestGroupGain(groupSeries: readonly AccountSeries[]): GroupGain | null {
  const points = buildPortfolioSeries(groupSeries);
  const last = points[points.length - 1];
  if (last === undefined) return null;
  return {
    marketValue: last.marketValue,
    bookCost: last.bookCost,
    gain: last.marketValue - last.bookCost,
  };
}
