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
  /** The full portfolio total at the last stated period before this one. Null when none precedes it. */
  start: number | null;
  /** The full portfolio total this period, over every account with a statement. */
  end: number;
  /** Summed only over accounts priced in BOTH this period and the one immediately before it. */
  netDeposits: number;
  /** `comparableEnd - comparableStart - netDeposits`, over that same comparable subset. Null with no comparable account. */
  growth: number | null;
  /** inTotals accounts with a statement this period, sorted by `|change|` descending, nulls last. */
  moves: AccountMove[];
  /** Labels of inTotals accounts already open by this period with no statement for it. */
  missing: string[];
  /** Sum of each missing account's own most recent priced market value. */
  missingValue: number;
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

/** The calendar month immediately before `period` ("2026-01" -> "2025-12"). */
function previousPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * `start` is the account's own value at the calendar month immediately
 * before `period` ONLY -- never an older stated value reached by skipping a
 * gap. An account that went quiet for a month and then reported again is
 * "returning", not "grew", and treating its last known value as a baseline
 * would read that return as a gain the market never produced.
 */
function accountMove(account: AccountSeries, period: string): AccountMove | null {
  const priced = pricedMonths(account);
  const current = priced.find((m) => m.period === period);
  if (current === undefined || current.marketValue === null) return null;

  const previous = priced.find((m) => m.period === previousPeriod(period));
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

/** The account's most recent priced value strictly before `period`, or 0 with none. */
function lastPricedValueBefore(account: AccountSeries, period: string): number {
  const before = pricedMonths(account).filter((m) => m.period < period);
  return before[before.length - 1]?.marketValue ?? 0;
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
 * Deposits and growth, summed only over the accounts priced at both `period`
 * and the calendar month immediately before it -- an account priced at only
 * one of the two contributes nothing here, on purpose. A late statement or a
 * gap would otherwise read as a swing in market growth it never caused (see
 * `accountMove`'s own comment).
 */
function comparableFlows(
  accounts: readonly AccountSeries[],
  period: string,
): { netDeposits: number; growth: number | null } {
  const prevPeriod = previousPeriod(period);
  let comparableStart = 0;
  let comparableEnd = 0;
  let netDeposits = 0;
  let any = false;

  for (const account of accounts) {
    const priced = pricedMonths(account);
    const current = priced.find((m) => m.period === period);
    const previous = priced.find((m) => m.period === prevPeriod);
    if (current === undefined || previous === undefined) continue;
    if (current.marketValue === null || previous.marketValue === null) continue;

    any = true;
    comparableStart += previous.marketValue;
    comparableEnd += current.marketValue;
    netDeposits += current.deposits - current.withdrawals;
  }

  return { netDeposits, growth: any ? comparableEnd - comparableStart - netDeposits : null };
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

  const inTotalsAccounts = analytics.series.filter((a) => a.inTotals);
  const { netDeposits, growth } = comparableFlows(inTotalsAccounts, period);

  const moves = inTotalsAccounts
    .map((a) => accountMove(a, period))
    .filter((m): m is AccountMove => m !== null)
    .sort(byAbsoluteChangeDesc);

  const missingAccounts = inTotalsAccounts.filter(
    (a) => isExpected(a, period) && !hasStatement(a, period),
  );
  const missing = missingAccounts.map((a) => a.label);
  const missingValue = missingAccounts.reduce(
    (sum, a) => sum + lastPricedValueBefore(a, period),
    0,
  );
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
    growth,
    moves,
    missing,
    missingValue,
    opened,
    activity,
  };
}
