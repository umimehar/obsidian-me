import { motion } from "motion/react";
import { useId, useMemo } from "react";
import type { AccountSeries } from "../../analytics/types";
import { formatCurrency } from "../format";
import { type PlotPoint, areaPath, formatPeriodLabel, linePath } from "./plot";
import { type PortfolioPoint, buildPortfolioSeries } from "./portfolioSeries";
import { useRevealMotion } from "./reveal";
import { type ChartPoint, type ChartScales, buildScales, periodToDate } from "./scales";

export interface ValueOverTimeProps {
  series: readonly AccountSeries[];
}

const WIDTH = 800;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 68 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

/**
 * The axis ticks only, where cents are noise on a $250,000 scale. Every
 * other figure this file prints, including the accessible summary, goes
 * through the shared `formatCurrency` -- the summary is the only thing a
 * screen reader announces for this chart, and rounding it the way the axis
 * does would state an ending value up to a dollar off from the corpus.
 */
function formatAxisCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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
  const reveal = useRevealMotion(INNER_WIDTH);
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
    `${formatPeriodLabel(last.period)}, ending at ${formatCurrency(last.marketValue)}. ` +
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
              {formatAxisCurrency(tick)}
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
