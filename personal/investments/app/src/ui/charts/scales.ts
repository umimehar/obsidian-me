import { type ScaleLinear, type ScaleTime, scaleLinear, scaleTime } from "d3-scale";

/** The minimal shape `buildScales` needs from a chart point -- one value per period. */
export interface ChartPoint {
  /** `YYYY-MM`. */
  period: string;
  value: number;
}

export interface ChartScales {
  x: ScaleTime<number, number>;
  y: ScaleLinear<number, number>;
  /** `y.ticks(tickCount)`, precomputed so callers never re-derive them. */
  yTicks: number[];
}

/** Parses a `YYYY-MM` period into the first of that month, UTC, so a chart never drifts a day with the viewer's local timezone. */
export function periodToDate(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1));
}

/**
 * Every `YYYY-MM` from `first` to `last` inclusive, oldest first. Empty when
 * `last` precedes `first`.
 *
 * This is the chart's x axis as months, which is not the same list as the
 * series' points: a series omits a month it has no statement for, and this
 * does not. A cursor has to walk the axis rather than the points, or a
 * position over an unstated month would silently resolve to a neighbour's
 * figure. Keeping the two lists distinct is what lets a gap stay a gap.
 */
export function monthsBetween(first: string, last: string): string[] {
  const start = periodToDate(first);
  const end = periodToDate(last);
  const months: string[] = [];
  for (
    let cursor = start;
    cursor <= end;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** A y axis on its own, for a chart whose x is not time -- the years of the contributions chart. */
export interface ValueAxis {
  y: ScaleLinear<number, number>;
  /** `y.ticks(tickCount)`, precomputed so callers never re-derive them. */
  yTicks: number[];
}

/**
 * The linear y axis every value chart shares: zero at the bottom, `max` at
 * the top, niced, inverted so a larger value draws higher on the page.
 *
 * The zero floor is the point. A dollar figure read against a min-value floor
 * exaggerates small swings, and on a bar chart it would draw a bar whose
 * height is not proportional to the figure it states.
 */
export function buildValueAxis(max: number, height: number, tickCount = 5): ValueAxis {
  const y = scaleLinear().domain([0, max]).nice().range([height, 0]);
  return { y, yTicks: y.ticks(tickCount) };
}

/**
 * Builds the x (time) and y (linear, niced) scales for a set of points,
 * mapped onto `[0, width]` and `[height, 0]` pixel ranges (y inverted, so a
 * larger value draws higher on the page). `points` need not be sorted.
 *
 * Returns `null` when `points` is empty: there is no domain to build from
 * zero data points, and the caller must render an empty state rather than
 * a scale with a degenerate domain or draw axes into nothing.
 *
 * The y domain always starts at zero -- an area/line chart of a value over
 * time should read its height honestly against a true zero, not a
 * min-value floor that would exaggerate the shape of small swings.
 */
export function buildScales(
  points: readonly ChartPoint[],
  width: number,
  height: number,
  tickCount = 5,
): ChartScales | null {
  if (points.length === 0) return null;

  const dates = points.map((p) => periodToDate(p.period));
  const values = points.map((p) => p.value);
  const minDate = dates.reduce((a, b) => (b < a ? b : a));
  const maxDate = dates.reduce((a, b) => (b > a ? b : a));
  const maxValue = values.reduce((a, b) => (b > a ? b : a));

  const x = scaleTime().domain([minDate, maxDate]).range([0, width]);

  return { x, ...buildValueAxis(maxValue, height, tickCount) };
}

/**
 * `buildScales` for a quantity that goes negative.
 *
 * The y domain runs from the minimum to the maximum, widened to include zero
 * at whichever end it is missing. `buildScales`' zero floor is right for a
 * dollar value, which cannot be negative and should read its height against a
 * true zero; it is wrong for a return rate, where -20.83% is a real month and
 * a floored domain would draw it below the plot box or clamp it onto the
 * baseline as if the account had broken even.
 *
 * Zero stays in the domain even when the whole series is on one side of it,
 * because the zero line is what tells a reader which side a point is on.
 */
export function buildSignedScales(
  points: readonly ChartPoint[],
  width: number,
  height: number,
  tickCount = 5,
): ChartScales | null {
  if (points.length === 0) return null;

  const dates = points.map((p) => periodToDate(p.period));
  const values = points.map((p) => p.value);
  const minDate = dates.reduce((a, b) => (b < a ? b : a));
  const maxDate = dates.reduce((a, b) => (b > a ? b : a));

  const x = scaleTime().domain([minDate, maxDate]).range([0, width]);
  const y = scaleLinear()
    .domain([Math.min(0, ...values), Math.max(0, ...values)])
    .nice()
    .range([height, 0]);

  return { x, y, yTicks: y.ticks(tickCount) };
}
