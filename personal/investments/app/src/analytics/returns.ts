import type { Returns, Statement } from "../types";
import type { AccountSeries, MonthPoint } from "./types";

/**
 * Why a derived point's `periodReturn` is null. Always null on a `"stated"`
 * point, where the concept does not apply.
 *
 * - `"no-prior-period"`: the first point in the account's series, with
 *   nothing to compare against.
 * - `"insufficient-data"`: a start or end market value is missing (a
 *   CASH-template statement has no portfolio) or the start value is zero,
 *   which would otherwise divide by zero.
 * - `"unreconciled-flow"`: the book-cost change over the period cannot be
 *   reconciled with the cash-based net deposits -- either it disagrees by
 *   more than the account's own statement noise, or book cost is missing
 *   for one end of the period and so cannot be checked at all -- see
 *   `flowIsReconciled`. Money moved in a way the cash block cannot see
 *   (typically a security transferred in-kind rather than bought with
 *   cash), so attributing the whole market-value move to performance would
 *   overstate the return.
 */
export type DerivedReturnReason = "no-prior-period" | "insufficient-data" | "unreconciled-flow";

/**
 * One period's return for one account. Exactly one of `statedMwr` and
 * `periodReturn` is populated -- see `source` -- because the two figures
 * must never be blended: a stated money-weighted rate and a derived
 * approximation answer different questions and mixing them into one number
 * would misrepresent both.
 *
 * Both figures are **percent**, matching what the statement itself prints
 * (`13.41` means 13.41%) -- `periodReturn` is the fraction from the
 * arithmetic below multiplied by 100 at this boundary, precisely so a
 * derived point and a stated point can sit on the same chart axis without
 * one reading a hundred times smaller than the other.
 */
export interface ReturnPoint {
  /** `YYYY-MM`, from `source.period`. */
  period: string;
  /**
   * Wealthsimple's own money-weighted return rates, verbatim from a
   * PERFORMANCE statement's `returns` block. A horizon shorter than the
   * account's life prints `0.00%` for "not applicable", already parsed
   * upstream to a null field on `Returns` rather than a measured zero --
   * passed through here without coercion. Null on a `"derived"` point,
   * which has no PERFORMANCE statement to read a rate from.
   */
  statedMwr: Returns | null;
  /**
   * `(endValue - startValue - netDeposits) / startValue`, times 100 -- an
   * approximation, since it ignores the timing of flows within the month.
   * Null on a `"stated"` point. Also null on a `"derived"` point the
   * arithmetic or the book-cost cross-check cannot support -- see
   * `reason`, which is populated in exactly that case. A derived figure
   * the owner cannot trust is worse than an absent one.
   */
  periodReturn: number | null;
  /** Populated exactly when `periodReturn` is null on a `"derived"` point -- see `DerivedReturnReason`. */
  reason: DerivedReturnReason | null;
  /**
   * `"stated"` when the account has at least one PERFORMANCE statement, in
   * which case every point for that account is stated. `"derived"`
   * otherwise, in which case every point for that account is derived. The
   * UI must show this rather than present a derived figure as if it were
   * Wealthsimple's own.
   */
  source: "stated" | "derived";
}

export interface ReturnSeries {
  maskedId: string;
  /** Oldest period first. */
  points: ReturnPoint[];
}

/** This account's PERFORMANCE statements, oldest period first. */
function performanceStatements(statements: readonly Statement[], maskedId: string): Statement[] {
  return statements
    .filter((s) => s.source.accountNo === maskedId && s.source.template === "PERFORMANCE")
    .sort((a, b) => a.source.period.localeCompare(b.source.period));
}

/** One PERFORMANCE statement per stated point, passed through verbatim -- see `ReturnPoint.statedMwr`. */
function buildStatedPoints(performance: readonly Statement[]): ReturnPoint[] {
  return performance.map((s) => ({
    period: s.source.period,
    statedMwr: s.returns,
    periodReturn: null,
    reason: null,
    source: "stated",
  }));
}

/**
 * `(endValue - startValue - netDeposits) / startValue`, as a fraction --
 * `buildDerivedPoints` converts to percent at the end. Null when either
 * value is unknown (a CASH-template statement has no portfolio) or
 * `startValue` is zero, which would otherwise divide by zero and produce
 * `Infinity` or `NaN`.
 */
function rawDerivedReturn(
  startValue: number | null,
  endValue: number | null,
  netDeposits: number,
): number | null {
  if (startValue === null || startValue === 0 || endValue === null) return null;
  return (endValue - startValue - netDeposits) / startValue;
}

/**
 * How far apart the book-cost change and the cash-based `netDeposits` are,
 * as a fraction of `startValue`. Book cost moves only on a purchase, sale,
 * or in-kind transfer -- performance never touches it -- so it is a second,
 * independent read on how much money moved during the period, and one that
 * a security transferred in without cash changing hands still shows up in.
 * Null when book cost is unavailable for either end (mirrors the
 * `startValue` guard above), which the caller treats as unreconciled rather
 * than assuming agreement.
 */
function flowDiscrepancy(
  startValue: number,
  previousBookCost: number | null,
  bookCost: number | null,
  netDeposits: number,
): number | null {
  if (previousBookCost === null || bookCost === null) return null;
  const impliedFlow = bookCost - previousBookCost;
  return (impliedFlow - netDeposits) / startValue;
}

/**
 * How much a period's book-cost change and cash-based net deposits may
 * disagree, as a fraction of the start value, before the gap counts as an
 * unexplained flow rather than statement rounding. $1,651 of book-cost
 * movement against $1,250 of cash deposits on a $25,641 start value (1.6%)
 * is real noise; $1,268 of book-cost movement against $98 of cash deposits
 * on a $695 start value (168%) is a transfer the cash block never saw.
 */
const FLOW_MATERIALITY_THRESHOLD = 0.1;

/**
 * `true` when the book-cost change over the period is close enough to the
 * cash-based `netDeposits` that the market-value move can be trusted as
 * performance -- see `flowDiscrepancy`. `false` when book cost is
 * unavailable to check at all, treated the same as a real disagreement:
 * the point cannot be verified, so it is not published as a confident
 * return.
 */
function flowIsReconciled(
  startValue: number,
  previousBookCost: number | null,
  bookCost: number | null,
  netDeposits: number,
): boolean {
  const discrepancy = flowDiscrepancy(startValue, previousBookCost, bookCost, netDeposits);
  return discrepancy !== null && Math.abs(discrepancy) <= FLOW_MATERIALITY_THRESHOLD;
}

interface DerivedResult {
  periodReturn: number | null;
  reason: DerivedReturnReason | null;
}

/**
 * One month's derived result against its predecessor: the raw arithmetic
 * (`rawDerivedReturn`), then a book-cost cross-check (`flowIsReconciled`)
 * before it is trusted -- a market-value move driven by an in-kind
 * transfer the cash block cannot see must not be published as performance.
 */
function derivedResult(
  previous: MonthPoint,
  month: MonthPoint,
  netDeposits: number,
): DerivedResult {
  const raw = rawDerivedReturn(previous.marketValue, month.marketValue, netDeposits);
  if (raw === null) return { periodReturn: null, reason: "insufficient-data" };

  // previous.marketValue is non-null here -- rawDerivedReturn already
  // guarded it above -- so it is safe to use as the reconciliation base.
  const startValue = previous.marketValue as number;
  if (!flowIsReconciled(startValue, previous.bookCost, month.bookCost, netDeposits)) {
    return { periodReturn: null, reason: "unreconciled-flow" };
  }
  return { periodReturn: raw * 100, reason: null };
}

/**
 * One point per month in the account's series, each compared against the
 * immediately preceding point in the array -- not the preceding calendar
 * month, since a missing statement leaves a gap in `months` rather than a
 * zero-filled entry (see `MonthPoint`). The first point has no predecessor,
 * so its `periodReturn` is null with reason `"no-prior-period"`.
 */
function buildDerivedPoints(months: readonly MonthPoint[]): ReturnPoint[] {
  const points: ReturnPoint[] = [];
  let previous: MonthPoint | null = null;

  for (const month of months) {
    const netDeposits = month.deposits - month.withdrawals;
    const { periodReturn, reason } =
      previous === null
        ? { periodReturn: null, reason: "no-prior-period" as const }
        : derivedResult(previous, month, netDeposits);
    points.push({ period: month.period, statedMwr: null, periodReturn, reason, source: "derived" });
    previous = month;
  }

  return points;
}

/**
 * One `ReturnSeries` per account in `series`. An account with any
 * PERFORMANCE statement reads its stated rates off them (`buildStatedPoints`);
 * every other account gets a derived period return per month instead
 * (`buildDerivedPoints`). The two sources are never mixed within one
 * account's points -- see `ReturnPoint`.
 */
export function buildReturns(
  series: readonly AccountSeries[],
  statements: readonly Statement[],
): ReturnSeries[] {
  return series.map((account) => {
    const performance = performanceStatements(statements, account.maskedId);
    const points =
      performance.length > 0 ? buildStatedPoints(performance) : buildDerivedPoints(account.months);
    return { maskedId: account.maskedId, points };
  });
}
