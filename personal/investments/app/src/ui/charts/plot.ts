import { periodToDate } from "./scales";

/** One point in pixel space, after the scales have been applied to a period and a value. */
export interface PlotPoint {
  x: number;
  y: number;
}

/** A `YYYY-MM` period as a short month-and-year label, formatted in UTC so it never drifts a month with the viewer's timezone. */
export function formatPeriodLabel(period: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(periodToDate(period));
}

/** An open polyline through `points`, in input order. Empty for no points. */
export function linePath(points: readonly PlotPoint[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

/** `linePath` closed down to `baselineY` and back to the first point, for a filled area. */
export function areaPath(points: readonly PlotPoint[], baselineY: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return "";
  return `${linePath(points)} L${last.x},${baselineY} L${first.x},${baselineY} Z`;
}
