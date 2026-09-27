import type { AnalyticsOutput } from "../analytics/build";
import {
  buildPortfolioReturns,
  endingCumulative,
  returnsWithin,
} from "../analytics/portfolioReturns";
import { buildPortfolioSeries } from "../analytics/portfolioSeries";
import type { ReturnSeries } from "../analytics/returns";
import type { AccountSeries } from "../analytics/types";
import { netFlowsByPeriod } from "../projection/fittedRate";

/**
 * Which calendar year the dashboard is reporting, or every year at once.
 *
 * `"all"` is the default and the honest one: it is what the corpus actually
 * holds. A year is a lens over the same data, never a different dataset.
 */
export type YearScope = "all" | number;

/** The calendar years the corpus covers, oldest first. Never the calendar's own. */
export function scopeYears(analytics: AnalyticsOutput): number[] {
  const years = new Set<number>();
  for (const account of analytics.series) {
    for (const month of account.months) years.add(Number(month.period.slice(0, 4)));
  }
  return [...years].sort((a, b) => a - b);
}

/** True when a `YYYY-MM` period falls inside the scope. */
export function inScope(period: string, scope: YearScope): boolean {
  return scope === "all" || period.startsWith(`${scope}-`);
}

/**
 * Every account, with its months clipped to the scope.
 *
 * Clipping HERE, at the one shape every chart and rollup already reads, is
 * what makes the year filter a small change rather than a rewrite: the
 * portfolio series, the group gains, the sparklines, the cashflow bars and
 * the cost-gap bars all derive from `months` and need no idea that a filter
 * exists. A per-chart filter would be eight filters that can disagree.
 *
 * An account keeps its entry even when the scope leaves it with no months.
 * Dropping it would make the account vanish from a lens, which reads as "you
 * do not have this account" rather than "this account has no statement in
 * 2023" -- the same absence-versus-zero distinction the rest of this project
 * is built around.
 */
export function clipSeries(series: readonly AccountSeries[], scope: YearScope): AccountSeries[] {
  if (scope === "all") return [...series];
  return series.map((account) => ({
    ...account,
    months: account.months.filter((month) => inScope(month.period, scope)),
  }));
}

/** The per-account return series, clipped the same way. */
export function clipReturns(returns: readonly ReturnSeries[], scope: YearScope): ReturnSeries[] {
  if (scope === "all") return [...returns];
  return returns.map((entry) => ({
    ...entry,
    points: entry.points.filter((point) => inScope(point.period, scope)),
  }));
}

/**
 * What a year did to the portfolio, and how much of it was money arriving.
 *
 * The single most misleading thing a year filter can do is let deposits read
 * as performance: select 2025, watch the line climb $40,000, conclude it was
 * a good year when $30,000 of it was contributions. So `growth` is netted,
 * and `netDeposits` is returned beside it so the caller can state it. Never
 * render one without the other.
 *
 * Measured from the LAST MONTH BEFORE the year, not the year's first month.
 * Starting inside the year silently discards January's growth, which on this
 * corpus is not a rounding matter.
 *
 * `start` is zero for the corpus's first year, which is correct rather than a
 * fallback: before it there was no portfolio.
 */
export interface YearChange {
  year: number;
  /** Portfolio value at the last month before the year; 0 when none precedes it. */
  start: number;
  /** Portfolio value at the year's last stated month. */
  end: number;
  /** Net external money that arrived during the year. */
  netDeposits: number;
  /** `end - start - netDeposits`: what the market did, not what was paid in. */
  growth: number;
  /** The year's first and last stated periods, for a caption. */
  firstPeriod: string;
  lastPeriod: string;
  /**
   * The year's return, chained month by month and net of deposits. Null when
   * no month in the year has a computable return.
   *
   * NOT `growth / start`. That reads the whole year's growth against the
   * balance it opened with, which on this corpus overstates badly: 2026 opened
   * at $85,516 and took in $129,732 during the year, so the money actually at
   * risk was far more than the opening figure. It reported 22.61% where the
   * chained figure is 9.43%, and the chart beside it showed the chained one.
   * Two figures for one year is one too many.
   */
  returnRate: number | null;
}

export function yearChange(series: readonly AccountSeries[], year: number): YearChange | null {
  const points = buildPortfolioSeries(series);
  const inYear = points.filter((point) => inScope(point.period, year));
  const first = inYear[0];
  const last = inYear[inYear.length - 1];
  if (first === undefined || last === undefined) return null;

  const before = points.filter((point) => point.period < first.period);
  const start = before[before.length - 1]?.marketValue ?? 0;

  const flows = netFlowsByPeriod(series);
  let netDeposits = 0;
  for (const point of inYear) netDeposits += flows.get(point.period) ?? 0;

  // The SAME series the return chart draws, so the percentage on this line and
  // the percentage on that chart are one figure rather than two.
  const scoped = returnsWithin(buildPortfolioReturns(series), (period) => inScope(period, year));

  return {
    year,
    start,
    end: last.marketValue,
    netDeposits,
    growth: last.marketValue - start - netDeposits,
    firstPeriod: first.period,
    lastPeriod: last.period,
    returnRate: endingCumulative(scoped),
  };
}
