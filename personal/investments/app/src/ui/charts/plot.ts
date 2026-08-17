import { formatWholeDollars } from "../format";
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

/**
 * An amount for an axis tick only, whole dollars.
 *
 * Cents are noise on a $250,000 scale, and the ticks are round numbers
 * anyway. This is the one place a money figure is allowed to lose precision,
 * and it is confined to the ticks: every figure a reader can actually read
 * off a point -- the bar label, the tooltip, the announcement, the accessible
 * name -- goes through the shared `formatCurrency`. Rounding one of those the
 * way the axis does is how this project shipped an announced $241,740 beside
 * a rendered $241,739.67.
 *
 * Delegates to `format.ts`'s `formatWholeDollars` rather than keeping its own
 * `Intl.NumberFormat`, so the axis concern (this file) and the formatting
 * rule (`format.ts`, beside `formatCurrency`) share one implementation.
 */
export function formatAxisCurrency(amount: number): string {
  return formatWholeDollars(amount);
}

/**
 * A rate for an axis tick only, whole percent.
 *
 * The ticks on a -25% to 50% axis are round numbers, and `-20.00%` beside
 * `0.00%` is noise. This is the rate equivalent of `formatAxisCurrency`
 * above, and confined the same way: every figure a reader can actually read
 * off a point -- the tooltip, the announcement, the accessible name -- goes
 * through `formatRate` at two decimals, which is the precision the statements
 * themselves print.
 */
export function formatAxisRate(rate: number): string {
  const digits = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 }).format(rate);
  return `${digits}%`;
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
