import type { AnalyticsOutput } from "../analytics/build";
import { latestMarketValue } from "../analytics/rollup";
import { accountValues } from "../goals/allocation";
import { projectYears } from "./engine";
import { latestCountedPeriod, projectedAccounts, projectionInputs } from "./inputs";

/** One point of a scenario, in both the currency it actually lands in and today's dollars. */
export interface ScenarioPoint {
  /** `YYYY-MM`: the real month this point falls at, the anchor month plus some whole years. */
  period: string;
  /** `period`'s calendar year, for the year-keyed lookups (milestones, retirement). */
  year: string;
  nominal: number;
  real: number;
}

export interface Scenario {
  rate: number;
  points: ScenarioPoint[];
}

export interface ScenarioSet {
  low: Scenario;
  base: Scenario;
  high: Scenario;
  /** `YYYY-MM`, the anchor every point is measured from: the latest counted statement. */
  startPeriod: string;
  /** Labels of selected accounts the engine has no contribution rule for. */
  uncompounded: string[];
}

/** `value` deflated by `inflation` compounded over `years`, into today's dollars. */
export function deflate(value: number, years: number, inflation: number): number {
  return value / (1 + inflation) ** years;
}

/**
 * `period` moved forward by whole calendar years, same month. The engine
 * advances one row per year regardless of which month the corpus starts in,
 * so a row's real date is the anchor month in a later year, never the
 * anchor year's December -- an owner whose latest statement is August reaches
 * retirement in August of the target year, not four months into the next one.
 */
function addYears(period: string, years: number): string {
  const [year = "0", month = "01"] = period.split("-");
  return `${Number(year) + years}-${month}`;
}

/** An opening balance grown at a flat rate with no new money, one point per row. */
function compoundNoContributions(opening: number, rate: number, rowCount: number): number[] {
  const values: number[] = [];
  let value = opening;
  for (let i = 0; i < rowCount; i++) {
    value *= 1 + rate;
    values.push(value);
  }
  return values;
}

/**
 * One rate's scenario: the selected accounts the engine covers, split by
 * `accountValues`, plus the selected accounts it does not, compounded on
 * their own opening balance with no contributions.
 *
 * `points[0]` is the opening snapshot itself, at the anchor month, before any
 * growth or contributions land -- the same figure the chart's history half
 * already ends on. Point `k` (`k >= 1`) is the engine's row `k - 1`, dated
 * `k` whole years after the anchor: the engine applies exactly one annual
 * step per row regardless of the anchor's month, so the row's real date is
 * years-from-anchor, never the row's own `year` field relabelled as
 * December of a matching calendar year.
 */
function buildScenario(
  analytics: AnalyticsOutput,
  selected: ReadonlySet<string>,
  rate: number,
  inflation: number,
  years: number,
  anchor: string,
): { scenario: Scenario; uncompounded: string[] } {
  const series = analytics.series;
  const inputs = projectionInputs(analytics, { returnRate: rate, years });
  const rows = projectYears(inputs);
  const covered = projectedAccounts(series);
  const coveredIds = new Set(covered.map((a) => a.maskedId));

  const selectedCoveredShortIds = new Set(
    covered.filter((a) => selected.has(a.maskedId)).map((a) => a.shortId),
  );
  const values = accountValues(rows, series, rate, inputs.fhsaCloseYear);

  const uncoveredSelected = series.filter(
    (a) => selected.has(a.maskedId) && !coveredIds.has(a.maskedId),
  );
  const uncoveredSeries = uncoveredSelected.map((a) =>
    compoundNoContributions(latestMarketValue(a) ?? 0, rate, rows.length),
  );

  const opening =
    covered
      .filter((a) => selectedCoveredShortIds.has(a.shortId))
      .reduce((sum, a) => sum + (latestMarketValue(a) ?? 0), 0) +
    uncoveredSelected.reduce((sum, a) => sum + (latestMarketValue(a) ?? 0), 0);

  const points: ScenarioPoint[] = [
    { period: anchor, year: anchor.slice(0, 4), nominal: opening, real: opening },
  ];
  rows.forEach((row, index) => {
    let nominal = 0;
    for (const v of values) {
      if (selectedCoveredShortIds.has(v.accountId)) nominal += v.values[index] ?? 0;
    }
    for (const account of uncoveredSeries) nominal += account[index] ?? 0;
    const yearsFromAnchor = index + 1;
    const period = addYears(anchor, yearsFromAnchor);
    points.push({
      period,
      year: period.slice(0, 4),
      nominal,
      real: deflate(nominal, yearsFromAnchor, inflation),
    });
  });

  return { scenario: { rate, points }, uncompounded: uncoveredSelected.map((a) => a.label) };
}

/**
 * Three rate scenarios for a selection of accounts: low and high a fixed
 * spread either side of the chosen rate, base at the rate itself. Low is
 * clamped at zero, never negative -- there is no rate this projection models
 * below flat.
 */
export function runScenarios(
  analytics: AnalyticsOutput,
  selected: ReadonlySet<string>,
  opts: { rate: number; spread: number; inflation: number; years: number },
): ScenarioSet {
  const anchor = latestCountedPeriod(analytics.series) ?? "1970-01";
  const lowRate = Math.max(0, opts.rate - opts.spread);
  const highRate = opts.rate + opts.spread;
  const base = buildScenario(analytics, selected, opts.rate, opts.inflation, opts.years, anchor);
  const low = buildScenario(analytics, selected, lowRate, opts.inflation, opts.years, anchor);
  const high = buildScenario(analytics, selected, highRate, opts.inflation, opts.years, anchor);
  return {
    low: low.scenario,
    base: base.scenario,
    high: high.scenario,
    startPeriod: anchor,
    uncompounded: base.uncompounded,
  };
}

/** The first year a scenario's real value reaches `threshold`, or null when it never does within the horizon. */
export function milestoneYear(points: readonly ScenarioPoint[], threshold: number): string | null {
  for (const point of points) {
    if (point.real >= threshold) return point.year;
  }
  return null;
}

/** The scenario's real balance at `year` and the monthly income it funds at `withdrawalRate` a year. */
export function retirementIncome(
  points: readonly ScenarioPoint[],
  year: number,
  withdrawalRate: number,
): { balance: number; monthly: number } | null {
  const point = points.find((p) => Number(p.year) === year);
  if (point === undefined) return null;
  return { balance: point.real, monthly: (point.real * withdrawalRate) / 12 };
}
