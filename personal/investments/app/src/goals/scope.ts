import { latestMarketValue } from "../analytics/rollup";
import type { AccountSeries } from "../analytics/types";
import { type ProjectionGroup, groupOf, projectedAccounts } from "../projection/inputs";
import type { Purpose } from "../store/registry";

export type GoalScope =
  | { kind: "portfolio" }
  | { kind: "groups"; groups: readonly ProjectionGroup[] }
  | { kind: "purpose"; purpose: Purpose };

export interface ScopeCoverage {
  /** Counted accounts matching the scope that the projection covers. */
  covered: readonly AccountSeries[];
  /** Counted accounts matching the scope that it does not. */
  uncovered: readonly AccountSeries[];
  /** Latest stated market value across `covered`. */
  coveredValue: number;
  /** Latest stated market value across `covered` plus `uncovered`. */
  scopeValue: number;
}

function matchesScope(account: AccountSeries, scope: GoalScope): boolean {
  switch (scope.kind) {
    case "portfolio":
      return true;
    case "groups": {
      const group = groupOf(account.kind);
      return group !== null && scope.groups.includes(group);
    }
    case "purpose":
      return account.purpose === scope.purpose;
  }
}

/**
 * Sums each account's latest stated market value (`latestMarketValue` from
 * `analytics/rollup.ts`, coerced null to 0 here the same way `groupTotal`
 * does for a rollup group). Reusing that one function -- rather than
 * re-deriving "latest stated market value" a second time -- is what keeps
 * this figure from ever disagreeing with `analytics.rollups.registration`,
 * which the rest of the dashboard reads for the same fact (`inputs.ts`'s
 * `openingByGroup` reads that rollup rather than re-summing for the same
 * reason). `scope.test.ts` pins that a `portfolio` scope's `scopeValue`
 * equals the sum of the registration rollup's totals.
 */
function sumLatestMarketValue(accounts: readonly AccountSeries[]): number {
  let total = 0;
  for (const account of accounts) total += latestMarketValue(account) ?? 0;
  return total;
}

/**
 * Resolves one goal's scope against the corpus: filters `inTotals` accounts
 * to those matching the scope, then splits that set on whether the
 * projection actually covers them (`projectedAccounts`). All three scope
 * kinds route through this one filter-then-split, so a `portfolio` goal and
 * a `groups` goal naming every projected group cannot disagree about which
 * accounts are covered.
 */
export function resolveScope(series: readonly AccountSeries[], scope: GoalScope): ScopeCoverage {
  const inScope = series.filter((account) => account.inTotals && matchesScope(account, scope));
  const projectedIds = new Set(projectedAccounts(series).map((account) => account.shortId));
  const covered = inScope.filter((account) => projectedIds.has(account.shortId));
  const uncovered = inScope.filter((account) => !projectedIds.has(account.shortId));
  const coveredValue = sumLatestMarketValue(covered);
  const scopeValue = coveredValue + sumLatestMarketValue(uncovered);
  return { covered, uncovered, coveredValue, scopeValue };
}
