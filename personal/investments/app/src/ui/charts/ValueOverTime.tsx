import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo } from "react";
import type { AccountSeries } from "../../analytics/types";
import { type PortfolioPoint, buildPortfolioSeries } from "./portfolioSeries";
import { type ChartPoint, type ChartScales, buildScales, periodToDate } from "./scales";

export interface ValueOverTimeProps {
  series: readonly AccountSeries[];
}

const WIDTH = 800;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 68 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

interface PlotPoint {
  x: number;
  y: number;
}

function formatPeriodLabel(period: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(periodToDate(period));
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Same as `formatCurrency` but keeps cents, for the accessible summary only.
 * The chart itself rounds to whole dollars on the axis and in visible text,
 * which is fine for a glanceable scale -- but the summary is the only thing
 * a screen reader announces for this chart, and rounding there would state
 * an ending value up to a dollar off from what the corpus actually says.
 */
function formatCurrencyPrecise(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** The combined domain of both the market value and the book cost series, so one pair of scales fits both lines. */
function toDomainPoints(points: readonly PortfolioPoint[]): ChartPoint[] {
  return [
    ...points.map((p) => ({ period: p.period, value: p.marketValue })),
    ...points.map((p) => ({ period: p.period, value: p.bookCost })),
  ];
}

function toPlotPoints(
  points: readonly PortfolioPoint[],
  scales: ChartScales,
  pick: (p: PortfolioPoint) => number,
): PlotPoint[] {
  return points.map((p) => ({ x: scales.x(periodToDate(p.period)), y: scales.y(pick(p)) }));
}

function linePath(points: readonly PlotPoint[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

/** `linePath` closed down to `baselineY` and back to the first point, for a filled area. */
function areaPath(points: readonly PlotPoint[], baselineY: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return "";
  return `${linePath(points)} L${last.x},${baselineY} L${first.x},${baselineY} Z`;
}

export interface Reveal {
  /** The clip rect's starting width. Equal to the full width when there is to be no reveal at all. */
  initialWidth: number;
  /** Seconds. Zero, never a smaller non-zero: a fast wipe is still a wipe. */
  duration: number;
}

/**
 * The reveal's timing, as a value rather than as two ternaries inline in the
 * JSX. Reduced motion *skips* the animation: the clip starts at full width
 * and takes no time, so the chart is simply drawn. Shortening the duration
 * instead would still move, which is the thing the preference asks not to
 * happen. Kept exported and pure because motion applies its final value
 * immediately under happy-dom, so this rule is not observable from the
 * rendered DOM and would otherwise be untestable.
 */
export function revealMotion(prefersReducedMotion: boolean, innerWidth: number): Reveal {
  if (prefersReducedMotion) return { initialWidth: innerWidth, duration: 0 };
  return { initialWidth: 0, duration: 1.1 };
}

function EmptyState() {
  return (
    <div role="img" aria-label="No portfolio value history yet.">
      <p style={{ color: "var(--gray-a11)" }}>No value history yet.</p>
    </div>
  );
}

/**
 * One area for market value, one line for book cost, so the gap between
 * them reads as gain or loss. Both are drawn from `buildPortfolioSeries`,
 * which only sums `inTotals: true` accounts and only where they actually
 * have a stated figure for that period -- a period with fewer statements
 * is drawn with fewer accounts summed in, never zero-filled.
 *
 * Book cost for USD holdings is a converted approximation (see the
 * investments CLAUDE.md and `MonthPoint.bookCost`), so the accessible
 * summary below calls out the book-cost line as approximate rather than
 * implying the market-value/book-cost gap is an exact gain figure.
 */
export function ValueOverTime({ series }: ValueOverTimeProps) {
  const rawClipId = useId();
  const clipId = `value-over-time-clip-${rawClipId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const prefersReducedMotion = useReducedMotion();
  const reveal = revealMotion(prefersReducedMotion === true, INNER_WIDTH);
  const points = useMemo(() => buildPortfolioSeries(series), [series]);
  const scales = useMemo(
    () => buildScales(toDomainPoints(points), INNER_WIDTH, INNER_HEIGHT),
    [points],
  );

  const first = points[0];
  const last = points[points.length - 1];

  if (scales === null || first === undefined || last === undefined) {
    return <EmptyState />;
  }

  const marketPoints = toPlotPoints(points, scales, (p) => p.marketValue);
  const bookPoints = toPlotPoints(points, scales, (p) => p.bookCost);

  const summary =
    `Portfolio market value from ${formatPeriodLabel(first.period)} to ` +
    `${formatPeriodLabel(last.period)}, ending at ${formatCurrencyPrecise(last.marketValue)}. ` +
    "The book cost line is an approximate figure for USD holdings, not a filing figure.";

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={summary}
      style={{ width: "100%", height: "auto" }}
    >
      <title>Portfolio value over time</title>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {scales.yTicks.map((tick) => (
          <g key={tick} transform={`translate(0,${scales.y(tick)})`}>
            <line x1={0} x2={INNER_WIDTH} stroke="var(--gray-a4)" />
            <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--gray-a11)">
              {formatCurrency(tick)}
            </text>
          </g>
        ))}
        <clipPath id={clipId}>
          <motion.rect
            y={0}
            height={INNER_HEIGHT}
            initial={{ width: reveal.initialWidth }}
            animate={{ width: INNER_WIDTH }}
            transition={{ duration: reveal.duration, ease: "easeOut" }}
          />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          <path d={areaPath(marketPoints, INNER_HEIGHT)} fill="var(--jade-a5)" stroke="none" />
          <path
            d={linePath(bookPoints)}
            fill="none"
            stroke="var(--gray-a11)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </g>
        <text x={0} y={INNER_HEIGHT + 20} fontSize={11} fill="var(--gray-a11)">
          {formatPeriodLabel(first.period)}
        </text>
        <text
          x={INNER_WIDTH}
          y={INNER_HEIGHT + 20}
          textAnchor="end"
          fontSize={11}
          fill="var(--gray-a11)"
        >
          {formatPeriodLabel(last.period)}
        </text>
      </g>
    </svg>
  );
}
