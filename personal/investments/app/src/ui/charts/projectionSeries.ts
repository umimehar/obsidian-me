import type { PortfolioPoint } from "../../analytics/portfolioSeries";
import type { ScenarioSet } from "../../projection/scenario";
import { formatCurrency, formatRate } from "../format";
import { formatPeriodLabel } from "./plot";

/** Which currency a rendered figure is in: what actually lands, or today's purchasing power. */
export type DollarsMode = "nominal" | "real";

/**
 * One point on the projection chart, either side of the seam.
 *
 * `half` is the whole idea of this view. Everything left of the seam is a
 * market value a statement stated; everything right of it is invented from
 * an assumed rate. `low`/`high` are null on a history point, and hold the
 * band's edges on a projected one -- `value` is always the base scenario's
 * figure, in whichever dollars mode the caller chose.
 */
export interface ProjectionPoint {
  /** `YYYY-MM`. History points are monthly; projected points sit at `YYYY-12`. */
  period: string;
  value: number;
  half: "history" | "projection";
  low: number | null;
  high: number | null;
}

export interface ProjectionSeries {
  history: ProjectionPoint[];
  /** One point per projected year, base scenario plus the low/high band. */
  projection: ProjectionPoint[];
  /** The last stated month: where fact stops and assumption starts. Null when nothing is stated. */
  seam: ProjectionPoint | null;
}

function historyPoint(point: PortfolioPoint): ProjectionPoint {
  return { period: point.period, value: point.marketValue, half: "history", low: null, high: null };
}

/** The scenario point's figure in the chosen dollars: what actually lands, or today's purchasing power. */
function pick(point: { nominal: number; real: number } | undefined, dollars: DollarsMode): number {
  if (point === undefined) return 0;
  return dollars === "real" ? point.real : point.nominal;
}

/**
 * The stated history and the three scenarios' figures, joined at the seam.
 *
 * `points[0]` of every scenario in `scenarios` is the opening snapshot,
 * matching the seam value itself, so it is dropped here rather than drawn a
 * second time: `buildProjectionSeries` starts each scenario from index 1,
 * the engine's own first row.
 *
 * Pure. `history` carries every stated month, including a zero month the
 * chart cannot place on a linear axis but the cursor still has to report.
 */
export function buildProjectionSeries(
  history: readonly PortfolioPoint[],
  scenarios: ScenarioSet,
  dollars: DollarsMode,
): ProjectionSeries {
  const historyPoints = history.map(historyPoint);
  const seam = historyPoints[historyPoints.length - 1] ?? null;
  if (seam === null) return { history: historyPoints, projection: [], seam: null };

  const base = scenarios.base.points.slice(1);
  const low = scenarios.low.points.slice(1);
  const high = scenarios.high.points.slice(1);

  const projection: ProjectionPoint[] = base
    .map((point, index) => ({
      period: `${point.year}-12`,
      value: pick(point, dollars),
      half: "projection" as const,
      low: pick(low[index], dollars),
      high: pick(high[index], dollars),
    }))
    .filter((point) => point.period > seam.period);

  return { history: historyPoints, projection, seam };
}

/** Every point of both halves, oldest first, which is what the cursor walks. */
export function projectionPoints(series: ProjectionSeries): ProjectionPoint[] {
  return [...series.history, ...series.projection];
}

/**
 * The linear y domain: zero to the largest figure either half ever draws,
 * niced outward so the top gridline is a round number.
 *
 * Null when nothing is stated at all, which is the empty state.
 */
export function projectionDomain(series: ProjectionSeries): readonly [number, number] | null {
  if (series.seam === null) return null;
  const values = [
    ...series.history.map((p) => p.value),
    ...series.projection.flatMap((p) => [p.value, p.low ?? p.value, p.high ?? p.value]),
  ];
  const max = Math.max(0, ...values);
  return [0, max];
}

/**
 * What the cursor says about one point, one line at a time. The single
 * source of the visible tooltip, the live announcement and the chart's
 * accessible name alike.
 */
export function projectionTooltipLines(
  period: string,
  point: ProjectionPoint | null,
  rate: number,
  dollars: DollarsMode,
): string[] {
  const label = formatPeriodLabel(period);
  if (point === null) return [label, "No statement for this month"];
  const dollarsWord = dollars === "real" ? "today's dollars" : "future dollars";
  if (point.half === "history") {
    return [label, `Market value ${formatCurrency(point.value)}`, "Stated, history"];
  }
  const band =
    point.low === null || point.high === null
      ? ""
      : `Range ${formatCurrency(point.low)} to ${formatCurrency(point.high)}, in ${dollarsWord}`;
  return [
    label,
    `Projected value ${formatCurrency(point.value)}, in ${dollarsWord}`,
    `A scenario at ${formatRate(rate * 100)} a year, not a stated figure`,
    band,
  ].filter((line) => line.length > 0);
}
