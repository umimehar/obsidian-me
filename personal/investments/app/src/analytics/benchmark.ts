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
 * Replays the portfolio's own net deposits (the same basis `netFlowsByPeriod`
 * feeds the fitted rate and the return chart with) as unit purchases of one
 * fund: the opening month buys at its own close, every later month's net
 * deposit buys more units at that month's close, and the benchmark value is
 * simply units times close. A month with no close is left out entirely,
 * with no deposit carried forward, rather than guessed at.
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
