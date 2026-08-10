import { REGISTERED_KINDS } from "../analytics/rooms";
import type { AccountSeries } from "../analytics/types";
import { type ProjectionGroup, projectedAccounts } from "../projection/inputs";
import type { AccountKind } from "../store/mask";
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

/**
 * Corporate carries no CRA room, so `REGISTERED_KINDS` has no entry for it --
 * the same gap `PROJECTION_KINDS` in `inputs.ts` fills the same way.
 */
const CORPORATE_KINDS: readonly AccountKind[] = ["Corporate"];

function kindsForGroup(group: ProjectionGroup): readonly AccountKind[] {
  return group === "Corporate" ? CORPORATE_KINDS : REGISTERED_KINDS[group];
}

function matchesScope(account: AccountSeries, scope: GoalScope): boolean {
  switch (scope.kind) {
    case "portfolio":
      return true;
    case "groups": {
      const kinds = new Set(scope.groups.flatMap(kindsForGroup));
      return kinds.has(account.kind);
    }
    case "purpose":
      return account.purpose === scope.purpose;
  }
}

/**
 * The account's latest stated market value, walking `months` backwards to
 * the last entry that actually states one. A month with no statement is
 * absent from `months` entirely rather than zero-filled, and a statement
 * that states one but leaves `marketValue` null (a CASH-template statement)
 * is skipped the same way -- this mirrors how `inputs.ts` derives opening
 * balances. An account with no non-null `marketValue` anywhere contributes 0.
 */
function latestMarketValue(account: AccountSeries): number {
  for (let i = account.months.length - 1; i >= 0; i--) {
    const month = account.months[i];
    if (month !== undefined && month.marketValue !== null) return month.marketValue;
  }
  return 0;
}

function sumLatestMarketValue(accounts: readonly AccountSeries[]): number {
  let total = 0;
  for (const account of accounts) total += latestMarketValue(account);
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
