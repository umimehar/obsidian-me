import { motion } from "motion/react";
import { useMemo } from "react";
import type { AccountSeries } from "../../analytics/types";
import { formatCurrency } from "../format";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle, tooltipLines } from "./Tooltip";
import { type PlotPoint, areaPath, formatAxisCurrency, formatPeriodLabel, linePath } from "./plot";
import { type PortfolioPoint, buildPortfolioSeries, periodExtent } from "./portfolioSeries";
import { useRevealMotion } from "./reveal";
import { type ChartPoint, type ChartScales, buildScales, periodToDate } from "./scales";
import { useSvgId } from "./svgId";
import { CursorMarks, cursorSlots, useChartCursor } from "./useChartCursor";

export interface ValueOverTimeProps {
  series: readonly AccountSeries[];
}

const WIDTH = 800;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 68 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
/** Hoisted so the cursor's pointer handler keeps one identity across renders. */
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: MARGIN.left };

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
  const clipId = useSvgId("value-over-time-clip");
  const reveal = useRevealMotion(INNER_WIDTH);
  const points = useMemo(() => buildPortfolioSeries(series), [series]);
  const scales = useMemo(
    () => buildScales(toDomainPoints(points), INNER_WIDTH, INNER_HEIGHT),
    [points],
  );
  const slots = useMemo(() => cursorSlots(periodExtent(points), scales), [points, scales]);
  const cursor = useChartCursor(points, slots, CURSOR_GEOMETRY);
  const countedAccounts = useMemo(
    () => series.filter((account) => account.inTotals).length,
    [series],
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
  // One call, three consumers: the accessible name, the spoken announcement
  // and the visible tooltip. Formatting the figures a second time anywhere
  // is how an announced figure drifts from a printed one.
  const lines =
    cursor.period === null ? [] : tooltipLines(cursor.period, cursor.point, countedAccounts);
  const readout = lines.length === 0 ? "" : ` ${lines.join(". ")}.`;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${summary}${readout}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
        tabIndex={0}
        onPointerMove={cursor.onPointerMove}
        onPointerLeave={cursor.onPointerLeave}
        onKeyDown={cursor.onKeyDown}
        onBlur={cursor.onBlur}
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
          <CursorMarks
            x={cursor.x}
            y={cursor.point === null ? null : scales.y(cursor.point.marketValue)}
            height={INNER_HEIGHT}
          />
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
      <CursorAnnouncement lines={lines} />
      {lines.length === 0 ? null : (
        <div style={{ ...tooltipAnchorStyle(MARGIN.left + (cursor.x ?? 0), WIDTH), top: 0 }}>
          <ChartTooltip lines={lines} />
        </div>
      )}
    </div>
  );
}
