import { buildCashflowSeries } from "../analytics/cashflowSeries";
import { buildPortfolioSeries } from "../analytics/portfolioSeries";
import type { AccountSeries } from "../analytics/types";

/**
 * A return rate fitted from the portfolio's own market-value history, with
 * enough provenance to say on screen where it came from.
 *
 * `source` is `"derived"` and only ever `"derived"`. It is not decoration:
 * this figure appears on no statement. Wealthsimple does print a
 * money-weighted return per account, but task 6b proved one account's stated
 * series is arithmetically impossible (2026-03 holds $12,531.01 and states
 * -0.52%, 2026-04 holds $12,370.86 and states +10.31%, with no flows
 * between), which left a single account of fourteen with a usable stated
 * rate. Fitting a portfolio rate from one account's printed number would
 * have been worse than fitting it from every account's balance, so the
 * owner chose the balances (decision 2026-08-06).
 */
export interface FittedReturnRate {
  /** Annualized, as a fraction (0.25 is 25%/yr). */
  rate: number;
  /** Periods in the underlying portfolio series. 37 in the real corpus. */
  months: number;
  /** Counted accounts that contributed at least one market value. 11 in the real corpus. */
  accounts: number;
  /**
   * Month-to-month links that actually fed the fit. Lower than
   * `months - 1` whenever a link was skipped for a non-positive opening
   * balance -- reported rather than silently absorbed, so a caller can see
   * the fit rests on fewer steps than the series length suggests. 35 in the
   * real corpus, from 36 links: the corpus opens at a genuine $0 across two
   * accounts in 2023-06.
   */
  monthsFitted: number;
  source: "derived";
}

/**
 * Counted accounts with at least one stated market value. Not
 * `PortfolioPoint.accountCount`, which is per period and rises over the
 * series as accounts open -- the provenance line wants how many accounts the
 * fit saw in total, not how many happened to report in the last month.
 */
function countedAccounts(series: readonly AccountSeries[]): number {
  return series.filter(
    (a) => a.inTotals && a.months.some((m) => m.marketValue !== null && m.bookCost !== null),
  ).length;
}

/** Net external money per period: deposits less withdrawals, over the counted accounts. */
function netFlowsByPeriod(series: readonly AccountSeries[]): Map<string, number> {
  return new Map(buildCashflowSeries(series).map((p) => [p.period, p.deposits - p.withdrawals]));
}

interface Aggregate {
  growth: number;
  capital: number;
  monthsFitted: number;
}

/**
 * Growth and opening capital summed across every usable month-to-month link.
 *
 * Growth is netted: a month's rise is only a return to the extent it is not
 * explained by money arriving. The corpus makes that distinction enormous --
 * it ends at $241,739.67 having taken in about $214,000 of net deposits, so
 * the un-netted reading is 486.9%/yr against the netted 24.8%.
 *
 * A link whose opening balance is not positive is skipped and counted out of
 * `monthsFitted`. `buildPortfolioSeries`'s first point, 2023-06, is a real
 * $0 across two accounts, not a gap: a percentage change from it is
 * undefined, so dividing would hand back an Infinity that then compounds
 * through thirty projection years.
 */
function aggregate(series: readonly AccountSeries[]): Aggregate & { months: number } {
  const points = buildPortfolioSeries(series);
  const flows = netFlowsByPeriod(series);
  const totals: Aggregate = { growth: 0, capital: 0, monthsFitted: 0 };

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    if (previous === undefined || current === undefined) continue;
    if (previous.marketValue <= 0) continue;
    const flow = flows.get(current.period) ?? 0;
    totals.growth += current.marketValue - flow - previous.marketValue;
    totals.capital += previous.marketValue;
    totals.monthsFitted += 1;
  }

  return { ...totals, months: points.length };
}

/**
 * The annual return rate implied by the portfolio's balances, net of the
 * money put in.
 *
 * Capital-weighted, not an equal-weighted geometric mean of the monthly
 * factors: each month contributes its growth and its opening balance to one
 * ratio, so a month is weighted by the money actually at risk in it. On this
 * corpus that matters a great deal. 2023-08 opens at $1,948 across two
 * accounts and closes at $3,335 against $97.50 of recorded deposits -- a
 * 66% month, almost certainly an in-kind securities transfer that arrives in
 * no cash `paidIn` block and so cannot be netted out. Equal-weighted, that
 * one $1,948 month drags the whole fit from 24.8%/yr to 37.9%/yr. Weighted
 * by capital it sits alongside a $238,000 month and barely moves it.
 *
 * The rate is still high, and honestly so: 37 months ending mid-2026 is a
 * short window over a strong equity run. That is exactly what the provenance
 * is for -- 37 months, 11 accounts, derived -- rather than a rate presented
 * as though it were a long-run expectation.
 */
export function fittedReturnRate(series: readonly AccountSeries[]): FittedReturnRate {
  const { growth, capital, monthsFitted, months } = aggregate(series);
  // A zero capital base means no usable link at all (an empty or
  // single-point series), which is a flat 0%, never a division by zero.
  // The lower clamp keeps a wipeout at -100%/yr instead of letting an even
  // more negative monthly figure come back POSITIVE through an even power.
  const monthly = capital > 0 ? Math.max(-1, growth / capital) : 0;

  return {
    rate: (1 + monthly) ** 12 - 1,
    months,
    accounts: countedAccounts(series),
    monthsFitted,
    source: "derived",
  };
}
