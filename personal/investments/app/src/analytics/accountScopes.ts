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

/**
 * Every registered wrapper: income earned inside one is not taxable as
 * earned, a replacement buy inside one permanently denies a superficial
 * loss (there is no cost base left to add it to), and a fee paid inside one
 * is never deductible. Shared by `claimable.ts`, `foreignProperty.ts` and
 * the tax tabs' "Needs attention" summaries, so this one list decides
 * "registered" everywhere rather than three copies that can drift apart.
 */
export const REGISTERED_KINDS: ReadonlySet<AccountKind> = new Set([
  "TFSA",
  "RRSP",
  "SpousalRRSP",
  "FHSA",
  "RESP",
]);

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
