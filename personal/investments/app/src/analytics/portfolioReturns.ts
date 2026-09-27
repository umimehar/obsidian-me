import { netFlowsByPeriod } from "../projection/fittedRate";
import { buildPortfolioSeries } from "./portfolioSeries";
import type { AccountSeries } from "./types";

/**
 * One month of the portfolio's own return, and the cumulative return through
 * it.
 *
 * `rate` and `cumulative` are FRACTIONS, not percentages: 0.0123 is 1.23%.
 * Both are null for a month whose return cannot be computed, which is not the
 * same as a return of zero -- see `buildPortfolioReturns`.
 */
export interface PortfolioReturnPoint {
  period: string;
  /** This month's return, net of money in and out. Null when it cannot be computed. */
  rate: number | null;
  /** Compounded from the first computable month through this one. Null until one exists. */
  cumulative: number | null;
  /** The market value this month's return was measured against, for a readout. */
  marketValue: number;
  /** Net external money that arrived this month, which is what makes the return netted. */
  netFlow: number;
}

/**
 * The portfolio's monthly return, netted, and compounded into a cumulative
 * line.
 *
 * A market-value chart cannot answer the one question a reader most wants
 * answered: am I actually up, or did I just deposit? This corpus makes that
 * gap enormous -- it reaches about $234,000 having taken in roughly $214,000
 * of net deposits, so the un-netted reading of its growth is 486.9%/yr
 * against a netted 20.8%. A return line that did not subtract flows would be
 * a deposit chart wearing a percentage sign.
 *
 * The netting comes from `netFlowsByPeriod`, the SAME function
 * `fittedReturnRate` fits from, so the line on screen and the rate printed
 * beside it in the projections can never be built from two different ideas of
 * what a deposit is.
 *
 * Where this differs from the fitted rate, deliberately: the fit is
 * capital-weighted across all months at once, because it is answering "one
 * rate for thirty years of projection" and a $1,948 month must not weigh the
 * same as a $238,000 one. A cumulative line is a different question -- what
 * actually happened, in order -- so it chains each month's own factor. The
 * two therefore do not have to agree, and the early months are exactly where
 * they will not: the same 66% month of 2023-08 that the fit deliberately
 * damps is a real 66% in the chain.
 *
 * A month whose opening balance is not positive yields a null rate rather
 * than a zero or an Infinity. `buildPortfolioSeries`'s first point is a real
 * $0 across two open, unfunded accounts, and a percentage change from zero is
 * undefined, not flat.
 */
export function buildPortfolioReturns(series: readonly AccountSeries[]): PortfolioReturnPoint[] {
  const points = buildPortfolioSeries(series);
  const flows = netFlowsByPeriod(series);

  const out: PortfolioReturnPoint[] = [];
  let factor = 1;
  let started = false;

  for (const [index, point] of points.entries()) {
    const previous = points[index - 1];
    const netFlow = flows.get(point.period) ?? 0;
    const canCompute = previous !== undefined && previous.marketValue > 0;
    const rate = canCompute
      ? (point.marketValue - netFlow - previous.marketValue) / previous.marketValue
      : null;

    if (rate !== null) {
      factor *= 1 + rate;
      started = true;
    }
    out.push({
      period: point.period,
      rate,
      // Null until the first computable month: a cumulative return of 0%
      // before anything is measurable is a claim that nothing happened.
      cumulative: started ? factor - 1 : null,
      marketValue: point.marketValue,
      netFlow,
    });
  }
  return out;
}

/**
 * The months inside `keep`, with their cumulative return re-based to the
 * portfolio's position just BEFORE the first of them.
 *
 * Computed over the whole series and clipped afterwards, never the reverse.
 * Clipping first would leave a year's opening month with no predecessor to
 * measure against, so January would have no return at all and "2026's return"
 * would silently mean February through July. Its dollar figure, measured from
 * December's close, would then cover a different window than its percentage.
 *
 * The base is the cumulative return at the last month before the window, so
 * dividing the factors yields the return DURING the window. Subtracting the
 * percentages is the intuitive move and it is wrong: a run from +100% to
 * +150% is a 25% window, not a 50% one.
 */
export function returnsWithin(
  points: readonly PortfolioReturnPoint[],
  keep: (period: string) => boolean,
): PortfolioReturnPoint[] {
  const firstIndex = points.findIndex((point) => keep(point.period));
  if (firstIndex === -1) return [];

  let base = 0;
  for (let i = firstIndex - 1; i >= 0; i -= 1) {
    const prior = points[i]?.cumulative;
    if (prior !== null && prior !== undefined) {
      base = prior;
      break;
    }
  }
  const baseFactor = 1 + base;
  if (baseFactor === 0) return points.filter((point) => keep(point.period));

  return points
    .filter((point) => keep(point.period))
    .map((point) => ({
      ...point,
      cumulative: point.cumulative === null ? null : (1 + point.cumulative) / baseFactor - 1,
    }));
}

/** The last computable cumulative return in a series, or null when none is. */
export function endingCumulative(points: readonly PortfolioReturnPoint[]): number | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const value = points[i]?.cumulative;
    if (value !== null && value !== undefined) return value;
  }
  return null;
}
