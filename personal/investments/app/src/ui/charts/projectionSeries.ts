import type { PortfolioPoint } from "../../analytics/portfolioSeries";
import type { ProjectionYear } from "../../projection/engine";
import { formatCurrency, formatRate } from "../format";
import { formatPeriodLabel } from "./plot";

/**
 * One point on the projections chart, either side of the seam.
 *
 * `half` is the whole idea of this view. Everything left of the seam is a
 * market value a statement stated; everything right of it is invented by the
 * engine from an assumed rate. The two are never merged into one undifferentiated
 * line, and `half` is what lets the chart draw them differently and the
 * tooltip describe them differently.
 */
export interface ProjectionPoint {
  /** `YYYY-MM`. History points are monthly; projected points sit at `YYYY-12`. */
  period: string;
  value: number;
  half: "history" | "projection";
  /** Contributions accumulated by this projected year. Null on a history point. */
  contributedToDate: number | null;
  /** Government grant accumulated by this projected year. Null on a history point. */
  grantToDate: number | null;
}

export interface ProjectionSeries {
  /** Every stated month, including any at or below zero, which the chart cannot draw but the cursor still reports. */
  history: ProjectionPoint[];
  /** One point per engine row that falls after the seam. */
  projection: ProjectionPoint[];
  /** The last stated month: where fact stops and assumption starts. Null when nothing is stated. */
  seam: ProjectionPoint | null;
}

function historyPoint(point: PortfolioPoint): ProjectionPoint {
  return {
    period: point.period,
    value: point.marketValue,
    half: "history",
    contributedToDate: null,
    grantToDate: null,
  };
}

function projectedPoint(row: ProjectionYear): ProjectionPoint {
  return {
    period: `${row.year}-12`,
    value: row.value,
    half: "projection",
    contributedToDate: row.cumulativeIn,
    grantToDate: row.cumulativeGrant,
  };
}

/**
 * The stated history and the projected years, joined at the seam.
 *
 * A projected row whose December is not strictly after the seam is dropped.
 * The engine's first row is the start year, and when the statements already
 * run to that December the year is over: drawing it would put a projected
 * point on top of a stated one and let the cursor resolve one period to two
 * figures.
 *
 * Pure. `history` carries every stated month, including a zero month the
 * chart's logarithmic axis cannot place -- dropping it here would leave the
 * cursor reporting "no figure" for a month the statements do state.
 */
export function buildProjectionSeries(
  history: readonly PortfolioPoint[],
  rows: readonly ProjectionYear[],
): ProjectionSeries {
  const historyPoints = history.map(historyPoint);
  const seam = historyPoints[historyPoints.length - 1] ?? null;
  // No seam means nothing stated to project from, and a projection with
  // nothing behind it is a figure about nothing rather than a scenario.
  const projection =
    seam === null ? [] : rows.map(projectedPoint).filter((point) => point.period > seam.period);
  return { history: historyPoints, projection, seam };
}

/** Every point of both halves, oldest first, which is what the cursor walks. */
export function projectionPoints(series: ProjectionSeries): ProjectionPoint[] {
  return [...series.history, ...series.projection];
}

/**
 * The decade domain a logarithmic axis spans, widened outward to whole powers
 * of ten so the ticks are round figures.
 *
 * Null when no positive value exists, which is the empty state: a logarithmic
 * axis has no domain to build from zero, and a chart drawn on a degenerate one
 * would place every mark at the same height.
 *
 * The caller passes the values of the LARGEST scenario its controls offer, not
 * of the scenario on screen. That is what keeps the axis, and with it the whole
 * history half, fixed while the rate slider moves: a reader dragging an
 * assumption must not see the past redraw itself.
 */
export function logDecadeDomain(values: readonly number[]): readonly [number, number] | null {
  const positive = values.filter((value) => value > 0);
  if (positive.length === 0) return null;
  const low = 10 ** Math.floor(Math.log10(Math.min(...positive)));
  const high = 10 ** Math.ceil(Math.log10(Math.max(...positive)));
  return [low, high === low ? high * 10 : high];
}

/** The powers of ten inside a domain, inclusive, which are the only ticks a decade axis needs. */
export function decadeTicks(domain: readonly [number, number]): number[] {
  const ticks: number[] = [];
  for (let value = domain[0]; value <= domain[1] * 1.0000001; value *= 10) {
    ticks.push(Math.round(value));
  }
  return ticks;
}

/**
 * What the cursor says about one point, one line at a time.
 *
 * The single source of the visible tooltip, the live announcement and the
 * chart's accessible name alike, so a projected figure cannot be announced at
 * a coarser precision than it is drawn at. `rate` is stated on every projected
 * line rather than only in the controls above, because a figure a reader hears
 * in isolation has to carry the assumption that produced it.
 */
export function projectionTooltipLines(
  period: string,
  point: ProjectionPoint | null,
  rate: number,
): string[] {
  const label = formatPeriodLabel(period);
  if (point === null) return [label, "No statement for this month"];
  if (point.half === "history") {
    const zero =
      point.value > 0
        ? []
        : ["A stated zero, which a logarithmic axis cannot place, so no point is drawn"];
    return [label, `Market value ${formatCurrency(point.value)}`, "Stated, history", ...zero];
  }
  return [
    label,
    `Projected value ${formatCurrency(point.value)}`,
    `A scenario at ${formatRate(rate * 100)} a year, not a stated figure`,
    `Contributions to date ${formatCurrency(point.contributedToDate ?? 0)}, ` +
      `grants ${formatCurrency(point.grantToDate ?? 0)}`,
  ];
}
