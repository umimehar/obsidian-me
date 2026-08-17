import { latestMarketValue } from "../analytics/rollup";
import type { AccountSeries } from "../analytics/types";
import {
  type AccountAllocation,
  type AccountValueSeries,
  type ProjectionYear,
  allocateByAccount,
} from "../projection/engine";
import { type ProjectionGroup, groupOf, projectedAccounts } from "../projection/inputs";

/** An account's total `contributionsByYear` from 2025 onward, the owner's recent funding pattern. */
function recentContribution(account: AccountSeries): number {
  let total = 0;
  for (const [year, amount] of Object.entries(account.contributionsByYear)) {
    if (Number(year) >= 2025) total += amount;
  }
  return total;
}

/**
 * Splits each projected group's money across its accounts.
 *
 * `allocateByAccount` in `engine.ts` needs a share and an opening balance per
 * account; the engine itself only knows groups, because CRA room is assessed
 * per group, not per account. `share` is each account's fraction of its
 * group's `contributionsByYear` from 2025 onward -- the owner's actual
 * funding pattern, not an invented split. A group whose accounts contributed
 * nothing in that window splits evenly, so a share is never `NaN` from a
 * zero denominator. `opening` is `latestMarketValue`, the same "latest
 * stated market value" the registration rollup and `openingByGroup` in
 * `inputs.ts` both read, skipping a null month rather than walking back
 * past it.
 */
export function buildAllocations(series: readonly AccountSeries[]): AccountAllocation[] {
  const accounts = projectedAccounts(series);
  const byGroup = new Map<ProjectionGroup, AccountSeries[]>();
  for (const account of accounts) {
    const group = groupOf(account.kind);
    if (group === null) continue;
    const members = byGroup.get(group);
    if (members === undefined) byGroup.set(group, [account]);
    else members.push(account);
  }

  const allocations: AccountAllocation[] = [];
  for (const [group, members] of byGroup) {
    const contributions = members.map(recentContribution);
    const groupTotal = contributions.reduce((sum, c) => sum + c, 0);
    members.forEach((account, i) => {
      const contribution = contributions[i] ?? 0;
      const share = groupTotal > 0 ? contribution / groupTotal : 1 / members.length;
      allocations.push({
        accountId: account.shortId,
        group,
        share,
        opening: latestMarketValue(account) ?? 0,
      });
    });
  }
  return allocations;
}

/** `allocateByAccount` fed from the real corpus, so a caller never has to build `AccountAllocation[]` by hand. */
export function accountValues(
  rows: readonly ProjectionYear[],
  series: readonly AccountSeries[],
  returnRate: number,
  fhsaCloseYear: string,
): AccountValueSeries[] {
  return allocateByAccount(rows.slice(), buildAllocations(series), returnRate, fhsaCloseYear);
}
