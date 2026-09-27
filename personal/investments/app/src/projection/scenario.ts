import type { AnalyticsOutput } from "../analytics/build";
import { latestMarketValue } from "../analytics/rollup";
import { accountValues } from "../goals/allocation";
import { projectYears } from "./engine";
import { projectedAccounts, projectionInputs } from "./inputs";

/** One year of a scenario, in both the currency it actually lands in and today's dollars. */
export interface ScenarioPoint {
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
  startYear: string;
  /** Labels of selected accounts the engine has no contribution rule for. */
  uncompounded: string[];
}

/** `value` deflated by `inflation` compounded over `years`, into today's dollars. */
export function deflate(value: number, years: number, inflation: number): number {
  return value / (1 + inflation) ** years;
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
 * `points[0]` is the opening snapshot itself, at `inputs.startYear`, before
 * any of this year's growth or contributions land -- the same figure the
 * chart's history half already ends on. Every point after it is one of the
 * engine's own rows, so the array is `rows.length + 1` long.
 */
function buildScenario(
  analytics: AnalyticsOutput,
  selected: ReadonlySet<string>,
  rate: number,
  inflation: number,
  years: number,
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

  const startYear = Number(inputs.startYear);
  const opening =
    covered
      .filter((a) => selectedCoveredShortIds.has(a.shortId))
      .reduce((sum, a) => sum + (latestMarketValue(a) ?? 0), 0) +
    uncoveredSelected.reduce((sum, a) => sum + (latestMarketValue(a) ?? 0), 0);

  const points: ScenarioPoint[] = [{ year: inputs.startYear, nominal: opening, real: opening }];
  rows.forEach((row, index) => {
    let nominal = 0;
    for (const v of values) {
      if (selectedCoveredShortIds.has(v.accountId)) nominal += v.values[index] ?? 0;
    }
    for (const account of uncoveredSeries) nominal += account[index] ?? 0;
    const elapsed = Number(row.year) - startYear + 1;
    points.push({ year: row.year, nominal, real: deflate(nominal, elapsed, inflation) });
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
  const lowRate = Math.max(0, opts.rate - opts.spread);
  const highRate = opts.rate + opts.spread;
  const base = buildScenario(analytics, selected, opts.rate, opts.inflation, opts.years);
  const low = buildScenario(analytics, selected, lowRate, opts.inflation, opts.years);
  const high = buildScenario(analytics, selected, highRate, opts.inflation, opts.years);
  const startYear = base.scenario.points[0]?.year ?? "";
  return {
    low: low.scenario,
    base: base.scenario,
    high: high.scenario,
    startYear,
    uncompounded: base.uncompounded,
  };
}

/** The first year a scenario's real value reaches `threshold`, or null when it never does within the horizon. */
export function milestoneYear(points: readonly ScenarioPoint[], threshold: number): string | null {
  return points.find((p) => p.real >= threshold)?.year ?? null;
}

/** The scenario's real balance at `year` and the monthly income it funds at `withdrawalRate` a year. */
export function retirementIncome(
  points: readonly ScenarioPoint[],
  year: number,
  withdrawalRate: number,
): { balance: number; monthly: number } | null {
  const row = points.find((p) => Number(p.year) === year);
  if (row === undefined) return null;
  return { balance: row.real, monthly: (row.real * withdrawalRate) / 12 };
}
