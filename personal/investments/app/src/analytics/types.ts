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
  /** Populated in task 2 from the delta between consecutive stated year-to-date contribution figures. */
  contributions: number;
  /** Populated in task 2 from `GRANT`/`CLB` activity credits. */
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
}
