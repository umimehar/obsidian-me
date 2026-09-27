import { netFlowsByPeriod } from "../projection/fittedRate";
import type { ActivityTotals } from "./activity";
import { sumActivity } from "./activity";
import type { AnalyticsOutput } from "./build";
import { buildPortfolioSeries } from "./portfolioSeries";
import type { AccountSeries } from "./types";

/** One account's change over one period, or `null` where there is nothing to compare against. */
export interface AccountMove {
  maskedId: string;
  label: string;
  start: number | null;
  end: number | null;
  netDeposits: number;
  /** `end - start - netDeposits`: what the market did to this account. Null without a `start`. */
  growth: number | null;
  /** `end - start`, the raw movement the movers table sorts by. Null without a `start`. */
  change: number | null;
}

export interface MonthReview {
  period: string;
  previous: string | null;
  start: number | null;
  end: number;
  netDeposits: number;
  growth: number | null;
  /** inTotals accounts with a statement this period, sorted by `|change|` descending, nulls last. */
  moves: AccountMove[];
  /** Labels of inTotals accounts already open by this period with no statement for it. */
  missing: string[];
  /** Labels of inTotals accounts whose first-ever statement is this period. */
  opened: string[];
  /** inTotals accounts only. */
  activity: ActivityTotals;
}

/** Every period the portfolio has a stated total for, newest first. */
export function reviewPeriods(analytics: AnalyticsOutput): string[] {
  return buildPortfolioSeries(analytics.series)
    .map((point) => point.period)
    .reverse();
}

/** An account's priced months only (`marketValue` stated), oldest first -- same skip `buildPortfolioSeries` applies. */
function pricedMonths(account: AccountSeries) {
  return account.months.filter((m) => m.marketValue !== null && m.bookCost !== null);
}

function accountMove(account: AccountSeries, period: string): AccountMove | null {
  const priced = pricedMonths(account);
  const current = priced.find((m) => m.period === period);
  if (current === undefined || current.marketValue === null) return null;

  const before = priced.filter((m) => m.period < period);
  const previous = before[before.length - 1];
  const start = previous?.marketValue ?? null;
  const end = current.marketValue;
  const netDeposits = current.deposits - current.withdrawals;

  return {
    maskedId: account.maskedId,
    label: account.label,
    start,
    end,
    netDeposits,
    growth: start === null ? null : end - start - netDeposits,
    change: start === null ? null : end - start,
  };
}

/** An inTotals account already open by `period` (its first statement is on or before it). */
function isExpected(account: AccountSeries, period: string): boolean {
  return account.inTotals && (account.months[0]?.period ?? period) <= period;
}

function hasStatement(account: AccountSeries, period: string): boolean {
  return account.months.some((m) => m.period === period);
}

/** Descending by `|change|`; an account with no `change` (newly opened) sorts last. */
function byAbsoluteChangeDesc(a: AccountMove, b: AccountMove): number {
  if (a.change === null) return b.change === null ? 0 : 1;
  if (b.change === null) return -1;
  return Math.abs(b.change) - Math.abs(a.change);
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`monthReview: no portfolio point for ${what}`);
  return value;
}

/**
 * What changed in the portfolio between the statement month before `period`
 * and `period` itself: deposits versus market growth, the accounts that
 * moved most, coverage (what is missing or newly opened), and the period's
 * income and costs. `period` must be one `reviewPeriods` returned.
 */
export function monthReview(analytics: AnalyticsOutput, period: string): MonthReview {
  const points = buildPortfolioSeries(analytics.series);
  const current = required(
    points.find((p) => p.period === period),
    period,
  );
  const before = points.filter((p) => p.period < period);
  const previous = before[before.length - 1] ?? null;
  const start = previous?.marketValue ?? null;
  const end = current.marketValue;
  const netDeposits = netFlowsByPeriod(analytics.series).get(period) ?? 0;

  const inTotalsAccounts = analytics.series.filter((a) => a.inTotals);
  const moves = inTotalsAccounts
    .map((a) => accountMove(a, period))
    .filter((m): m is AccountMove => m !== null)
    .sort(byAbsoluteChangeDesc);

  const missing = inTotalsAccounts
    .filter((a) => isExpected(a, period) && !hasStatement(a, period))
    .map((a) => a.label);
  const opened = inTotalsAccounts.filter((a) => a.months[0]?.period === period).map((a) => a.label);

  const byAccount = analytics.activity[period] ?? {};
  const activity = sumActivity(
    inTotalsAccounts.map((a) => byAccount[a.maskedId]).filter((t) => t !== undefined),
  );

  return {
    period,
    previous: previous?.period ?? null,
    start,
    end,
    netDeposits,
    growth: start === null ? null : end - start - netDeposits,
    moves,
    missing,
    opened,
    activity,
  };
}
