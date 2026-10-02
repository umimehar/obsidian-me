import type { AccountKind } from "../store/mask";
import type { AccountSeries } from "./types";

/**
 * The personal non-registered kinds: Non-registered brokerage accounts and
 * Crypto, both owned personally. Shared by `income.ts` (where it has always
 * lived as `TAXABLE_KINDS`), the Non-registered tab's holdings split and the
 * superficial-loss watch, so "what counts as personal non-registered" is
 * decided once rather than once per module.
 */
export const PERSONAL_NONREG_KINDS: ReadonlySet<AccountKind> = new Set(["NonRegistered", "Crypto"]);

/**
 * The corporate kind. A set, not a single value, so every caller that
 * filters by a `ReadonlySet<AccountKind>` (see `taxableAccountIds` in
 * `income.ts`) can use either scope through the same parameter.
 */
export const CORPORATE_KINDS: ReadonlySet<AccountKind> = new Set(["Corporate"]);

/** Every account in `series` whose kind is one of `kinds`, by masked id. */
export function accountIdsOfKind(
  series: readonly AccountSeries[],
  kinds: ReadonlySet<AccountKind>,
): Set<string> {
  const ids = new Set<string>();
  for (const account of series) {
    if (kinds.has(account.kind)) ids.add(account.maskedId);
  }
  return ids;
}
