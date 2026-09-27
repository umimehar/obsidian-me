import { netFlowsByPeriod } from "../projection/fittedRate";
import { buildPortfolioSeries } from "./portfolioSeries";
import type { AccountSeries } from "./types";

/** One month of the comparison: what the portfolio actually held against what the same deposits would hold in the benchmark. */
export interface BenchmarkPoint {
  period: string;
  portfolio: number;
  benchmark: number;
}

/**
 * The portfolio's own deposit-netted return, replayed as a single fund
 * purchase: the opening month buys the benchmark at its own close, and every
 * later month's net deposit (the same basis `netFlowsByPeriod` feeds the
 * fitted rate and the return chart with) buys more units at that month's
 * close. The benchmark's value is simply units held times that month's
 * close -- there is no separate "return" to fit, since the units already
 * carry the whole history.
 *
 * A month with no close at all -- the benchmark's own history starts later,
 * or a request failed to cover it -- is left out of the result entirely
 * rather than guessed at. Its deposit is not carried forward into a later
 * month either: the comparison is honestly silent for that month, and the
 * chart states which months were skipped rather than smoothing over them.
 */
export function simulateBenchmark(
  series: readonly AccountSeries[],
  closes: Readonly<Record<string, number>>,
): BenchmarkPoint[] {
  const points = buildPortfolioSeries(series);
  const flows = netFlowsByPeriod(series);
  const result: BenchmarkPoint[] = [];
  let units = 0;
  let opened = false;

  for (const point of points) {
    const close = closes[point.period];
    if (close === undefined || close <= 0) continue;
    if (!opened) {
      units = point.marketValue / close;
      opened = true;
    } else {
      units += (flows.get(point.period) ?? 0) / close;
    }
    result.push({ period: point.period, portfolio: point.marketValue, benchmark: units * close });
  }
  return result;
}

/** The portfolio periods `simulateBenchmark` had no close to price, oldest first -- what the chart's note names. */
export function skippedPeriods(
  series: readonly AccountSeries[],
  closes: Readonly<Record<string, number>>,
): string[] {
  const priced = new Set(simulateBenchmark(series, closes).map((p) => p.period));
  return buildPortfolioSeries(series)
    .map((p) => p.period)
    .filter((period) => !priced.has(period));
}
