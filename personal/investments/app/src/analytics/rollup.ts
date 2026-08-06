import type { AccountKind } from "../store/mask";
import type { Purpose } from "../store/registry";
import type { AccountSeries } from "./types";

/** One account set, three ways to group it -- not three page trees. */
export type Lens = "registration" | "account" | "purpose";

/**
 * One account's line within a rollup group.
 *
 * `marketValue` is the account's most recent stated market value -- null
 * for an account with no BROKERAGE statement (a Chequing account never
 * carries a portfolio) or with no statements at all. Never coerced to
 * zero here, since a coerced zero would misread as a real zero balance
 * rather than "no portfolio figure exists for this account".
 */
export interface RollupAccount {
  maskedId: string;
  shortId: string;
  label: string;
  kind: AccountKind;
  purpose: Purpose;
  inTotals: boolean;
  marketValue: number | null;
}

/**
 * One group within one lens: the accounts that fall into it, and their
 * combined value.
 *
 * `total` sums `marketValue` over accounts with `inTotals: true` only. A
 * Cash (Chequing) account still renders in `accounts` with its own
 * `marketValue` -- it contributes nothing to `total`, but it is present,
 * not hidden, matching the "present but excluded" decision documented in
 * the investments CLAUDE.md ("Some accounts are visible but not
 * selectable"): a hidden account reads as missing data, a greyed one shows
 * the ledger is complete and the omission is a choice.
 */
export interface Rollup {
  key: string;
  label: string;
  lens: Lens;
  accounts: readonly RollupAccount[];
  total: number;
}

function latestMarketValue(account: AccountSeries): number | null {
  const last = account.months[account.months.length - 1];
  return last?.marketValue ?? null;
}

function toRollupAccount(account: AccountSeries): RollupAccount {
  return {
    maskedId: account.maskedId,
    shortId: account.shortId,
    label: account.label,
    kind: account.kind,
    purpose: account.purpose,
    inTotals: account.inTotals,
    marketValue: latestMarketValue(account),
  };
}

/** Sums `marketValue` over `inTotals: true` rows only -- the cash exclusion lives here, in one place. */
function groupTotal(accounts: readonly RollupAccount[]): number {
  let total = 0;
  for (const account of accounts) {
    if (account.inTotals) total += account.marketValue ?? 0;
  }
  return total;
}

function buildGroup(
  lens: Lens,
  key: string,
  label: string,
  accounts: readonly AccountSeries[],
): Rollup {
  const rollupAccounts = accounts.map(toRollupAccount);
  return { key, label, lens, accounts: rollupAccounts, total: groupTotal(rollupAccounts) };
}

/**
 * Which registration group each `AccountKind` rolls into.
 *
 * RRSP and SpousalRRSP share one group: a spousal contribution counts
 * against the contributor's own CRA room, so the two are the same wrapper
 * for grouping purposes (mirrors `REGISTERED_KINDS` in `rooms.ts`).
 *
 * Crypto has no CRA registration wrapper of its own -- a Wealthsimple
 * crypto account is a taxable holding, same as NonRegistered -- so it
 * folds into that group rather than getting a group the spec never named.
 *
 * Chequing is the "Cash" group. It is a real group, not a dumping ground:
 * a Chequing account must still appear somewhere in this lens, and its own
 * `inTotals: false` (see `RollupAccount`) is what keeps it out of every
 * total, not its absence from the grouping.
 */
const REGISTRATION_GROUP_BY_KIND: Record<AccountKind, string> = {
  TFSA: "TFSA",
  RRSP: "RRSP",
  SpousalRRSP: "RRSP",
  FHSA: "FHSA",
  RESP: "RESP",
  NonRegistered: "NonRegistered",
  Crypto: "NonRegistered",
  Chequing: "Cash",
  Corporate: "Corporate",
};

const REGISTRATION_GROUP_ORDER = [
  "TFSA",
  "RRSP",
  "FHSA",
  "RESP",
  "NonRegistered",
  "Corporate",
  "Cash",
] as const;

/** Display casing for each registration group. The acronyms (TFSA, RRSP, FHSA, RESP) stay as-is; only the compound words get spelled out. */
const REGISTRATION_GROUP_LABEL: Record<(typeof REGISTRATION_GROUP_ORDER)[number], string> = {
  TFSA: "TFSA",
  RRSP: "RRSP",
  FHSA: "FHSA",
  RESP: "RESP",
  NonRegistered: "Non-registered",
  Corporate: "Corporate",
  Cash: "Cash",
};

/** One `Rollup` per registration group that has at least one account -- an empty group simply doesn't appear, same as `buildRoomLines`. */
function rollupByRegistration(series: readonly AccountSeries[]): Rollup[] {
  const groups: Rollup[] = [];
  for (const key of REGISTRATION_GROUP_ORDER) {
    const accounts = series.filter((s) => REGISTRATION_GROUP_BY_KIND[s.kind] === key);
    if (accounts.length === 0) continue;
    groups.push(buildGroup("registration", key, REGISTRATION_GROUP_LABEL[key], accounts));
  }
  return groups;
}

/** All 14 accounts, flat -- one group per account, keyed on `maskedId`, labelled with the registry's own owner-reviewed `label`. */
function rollupByAccount(series: readonly AccountSeries[]): Rollup[] {
  return series.map((s) => buildGroup("account", s.maskedId, s.label, [s]));
}

const PURPOSE_ORDER: readonly Purpose[] = [
  "retirement",
  "house",
  "education",
  "business",
  "growth",
  "spending",
  "unassigned",
];

/** Sentence-cases a bare `Purpose` string for display (`"retirement"` -> `"Retirement"`). */
function purposeLabel(purpose: Purpose): string {
  return purpose.charAt(0).toUpperCase() + purpose.slice(1);
}

/**
 * One `Rollup` per `Purpose` that has at least one account, `unassigned`
 * included. All fourteen accounts were tagged in task 3a, so that bucket is
 * empty today and does not render: a dashboard whose whole principle is not
 * to print figures it does not have has no business carrying a standing
 * "Unassigned, 0 accounts, $0.00, 0.0% of total" card.
 *
 * `unassigned` stays last in `PURPOSE_ORDER` rather than being removed from
 * it, so an account added without a purpose brings the bucket back in its
 * usual place on its own. Nothing is silently dropped: an untagged account
 * is visible precisely because the group reappears.
 */
function rollupByPurpose(series: readonly AccountSeries[]): Rollup[] {
  const groups: Rollup[] = [];
  for (const purpose of PURPOSE_ORDER) {
    const accounts = series.filter((s) => s.purpose === purpose);
    if (accounts.length === 0) continue;
    groups.push(buildGroup("purpose", purpose, purposeLabel(purpose), accounts));
  }
  return groups;
}

/**
 * Regroups the same account set three ways. Whichever lens is chosen, the
 * sum of every group's `total` is the same money -- see `rollup.test.ts`'s
 * grand-total invariant test.
 */
export function rollup(series: readonly AccountSeries[], lens: Lens): Rollup[] {
  switch (lens) {
    case "registration":
      return rollupByRegistration(series);
    case "account":
      return rollupByAccount(series);
    case "purpose":
      return rollupByPurpose(series);
  }
}
