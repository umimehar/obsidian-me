import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";

/**
 * One account's state at the end of one statement period. Absent from
 * `AccountSeries.months` entirely when no statement covers that period --
 * never zero-filled, since a zero-filled gap is indistinguishable from a
 * real zero balance.
 */
export interface MonthPoint {
  /** `YYYY-MM`, from `source.period`. */
  period: string;
  /** From `portfolio.totalMarketValue`. Null on a CASH-template statement, which has no portfolio. */
  marketValue: number | null;
  /** From `portfolio.totalBookCost`. Null on a CASH-template statement, which has no portfolio. */
  bookCost: number | null;
  /** The CAD cash block's `closing`. Null when the statement carries no CAD cash block. */
  cashBalance: number | null;
  /** The CAD cash block's `paidIn.deposits`. Zero when unstated (a CASH-template statement has no `paidIn`). */
  deposits: number;
  /** The CAD cash block's `paidOut.withdrawals`. Zero when unstated (a CASH-template statement has no `paidOut`). */
  withdrawals: number;
  /**
   * The delta between this statement's stated year-to-date contribution
   * figure and the previous stated one, or the year-to-date figure itself
   * when this is the first stated figure of its calendar year (January in
   * the normal case, a later month when earlier statements are missing or
   * state no contributions).
   *
   * For a first-60-days/rest-of-year split account (RRSP family only) this
   * is computed against `first60Days + restOfYear` as the combined
   * year-to-date figure -- both halves are themselves cumulative within the
   * year, so the same telescoping delta applies.
   *
   * Null when this statement states no contributions figure at all -- never
   * coerced to zero, since an unstated month is not a known zero.
   */
  contributions: number | null;
  /**
   * How many calendar months this delta spans. 1 in the normal case.
   * Greater than 1 when one or more preceding months carried no stated
   * contributions figure, so this delta silently covers the gap -- present
   * so the UI can flag a multi-month lump rather than attribute it to this
   * one month. Meaningless (left at 1) when `contributions` is null.
   */
  contributionMonthsSpanned: number;
  /** Verbatim from the statement's `contributions.first60Days`, never derived from a delta. Null when unstated. */
  contributionFirst60Days: number | null;
  /** Verbatim from the statement's `contributions.restOfYear`, never derived from a delta. Null when unstated. */
  contributionRestOfYear: number | null;
  /** Populated in task 3 from `GRANT`/`CLB` activity credits. */
  grants: number;
}

export interface AccountSeries {
  maskedId: string;
  shortId: string;
  kind: AccountKind;
  style: ManagementStyle;
  purpose: Purpose;
  inTotals: boolean;
  /** Oldest period first. */
  months: MonthPoint[];
  /**
   * Total contributions per calendar year, keyed on `YYYY`. Equal to the
   * last stated (or combined split) year-to-date figure observed in that
   * year -- since the monthly deltas telescope back to it, summing them
   * would give the same number by construction.
   */
  contributionsByYear: Record<string, number>;
}
