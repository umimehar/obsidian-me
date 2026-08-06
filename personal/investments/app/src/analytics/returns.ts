import type { Returns, Statement } from "../types";
import type { AccountSeries, MonthPoint } from "./types";

/**
 * One period's return for one account. Exactly one of `statedMwr` and
 * `periodReturn` is populated -- see `source` -- because the two figures
 * must never be blended: a stated money-weighted rate and a derived
 * approximation answer different questions and mixing them into one number
 * would misrepresent both.
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
   * `(endValue - startValue - netDeposits) / startValue` against the
   * account's monthly series -- an approximation, since it ignores the
   * timing of flows within the month. Null on a `"stated"` point. Also
   * null on a `"derived"` point with no prior period to compare against, or
   * a zero or missing `startValue`, which would otherwise produce
   * `Infinity` or `NaN`.
   */
  periodReturn: number | null;
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
    source: "stated",
  }));
}

/**
 * `(endValue - startValue - netDeposits) / startValue`. Null when either
 * value is unknown (a CASH-template statement has no portfolio) or
 * `startValue` is zero, which would otherwise divide by zero and produce
 * `Infinity` or `NaN`.
 */
function derivedPeriodReturn(
  startValue: number | null,
  endValue: number | null,
  netDeposits: number,
): number | null {
  if (startValue === null || startValue === 0 || endValue === null) return null;
  return (endValue - startValue - netDeposits) / startValue;
}

/**
 * One point per month in the account's series, each compared against the
 * immediately preceding point in the array -- not the preceding calendar
 * month, since a missing statement leaves a gap in `months` rather than a
 * zero-filled entry (see `MonthPoint`). The first point has no predecessor,
 * so its `periodReturn` is null.
 */
function buildDerivedPoints(months: readonly MonthPoint[]): ReturnPoint[] {
  const points: ReturnPoint[] = [];
  let previous: MonthPoint | null = null;

  for (const month of months) {
    const netDeposits = month.deposits - month.withdrawals;
    const periodReturn =
      previous === null
        ? null
        : derivedPeriodReturn(previous.marketValue, month.marketValue, netDeposits);
    points.push({ period: month.period, statedMwr: null, periodReturn, source: "derived" });
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
