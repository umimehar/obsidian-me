import { motion } from "motion/react";
import { useMemo } from "react";
import {
  type PortfolioReturnPoint,
  buildPortfolioReturns,
  endingCumulative,
  returnsWithin,
} from "../../analytics/portfolioReturns";
import type { AccountSeries } from "../../analytics/types";
import { formatCurrency, formatRate } from "../format";
import { type YearScope, inScope } from "../scope";
import {
  ChartTooltip,
  CursorAnnouncement,
  type TooltipContent,
  tooltipAnchorStyle,
  tooltipAnnouncement,
} from "./Tooltip";
import { type PlotPoint, formatPeriodLabel, linePath } from "./plot";
import { useRevealMotion } from "./reveal";
import { type ChartPoint, type ChartScales, buildSignedScales, periodToDate } from "./scales";
import { useSvgId } from "./svgId";
import { CursorMarks, cursorSlots, useChartCursor } from "./useChartCursor";

export interface ReturnOverTimeProps {
  /**
   * The UNCLIPPED series. The scope is applied after the returns are
   * computed, never before: a clipped January has no December to measure
   * against, so clipping first silently drops the year's opening month.
   */
  series: readonly AccountSeries[];
  scope: YearScope;
  /** What the chart is of: "Portfolio", or one account's label. */
  subject?: string;
}

const WIDTH = 800;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 68 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: MARGIN.left };

/** A percentage axis tick. Whole percent on the gridlines; the readouts keep two decimals. */
function formatAxisPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Only the months that HAVE a cumulative figure reach the domain. A month
 * before the first computable one has none, and plotting it at zero would
 * draw a flat line across a period the return is simply unknown for.
 */
function toDomainPoints(points: readonly PortfolioReturnPoint[]): ChartPoint[] {
  const plotted: ChartPoint[] = [];
  for (const point of points) {
    if (point.cumulative !== null) {
      plotted.push({ period: point.period, value: point.cumulative * 100 });
    }
  }
  // Zero is always in the domain: a return chart whose axis starts at +8%
  // hides whether the line is above or below break-even, which is the first
  // thing a reader looks for.
  if (plotted[0] !== undefined) plotted.push({ period: plotted[0].period, value: 0 });
  return plotted;
}

function toPlotPoints(points: readonly PortfolioReturnPoint[], scales: ChartScales): PlotPoint[] {
  const out: PlotPoint[] = [];
  for (const point of points) {
    if (point.cumulative === null) continue;
    out.push({ x: scales.x(periodToDate(point.period)), y: scales.y(point.cumulative * 100) });
  }
  return out;
}

function EmptyState() {
  return (
    <div role="img" aria-label="No return history yet.">
      <p style={{ color: "var(--gray-a11)" }}>No return history yet.</p>
    </div>
  );
}

/**
 * What the cursor says about one month's return. Structured rather than flat,
 * so the figure carries a tone and the market value it was measured against
 * sits beside it.
 */
function returnTooltip(
  point: PortfolioReturnPoint | null,
  period: string,
  rebased: boolean,
): TooltipContent {
  const header = formatPeriodLabel(period);
  if (point === null || point.cumulative === null) {
    return {
      header,
      rows: [],
      footnotes: ["No return for this month: nothing earlier to measure against"],
    };
  }
  const since = rebased ? "this year" : "inception";
  return {
    header,
    rows: [
      {
        label: `Return since ${since}`,
        value: formatRate(point.cumulative * 100),
        tone: point.cumulative >= 0 ? "gain" : "loss",
      },
      ...(point.rate === null
        ? []
        : [
            {
              label: "This month",
              value: formatRate(point.rate * 100),
              tone: point.rate >= 0 ? ("gain" as const) : ("loss" as const),
            },
          ]),
      { label: "Market value", value: formatCurrency(point.marketValue) },
    ],
    footnotes: [
      point.netFlow === 0
        ? "No money moved in or out this month"
        : `Net of ${formatCurrency(point.netFlow)} moved in or out this month`,
      "Return is net of deposits, so money paid in is not counted as growth",
    ],
  };
}

/**
 * The portfolio's cumulative return, net of deposits.
 *
 * This is the question the market-value chart cannot answer. That chart
 * climbs when money arrives, so a reader cannot tell a good year from a
 * well-funded one: 2026 took the portfolio from $85,516 to $234,580, of which
 * $129,732 was deposits and $19,331 was growth. A line that did not subtract
 * flows would be a deposit chart wearing a percentage sign.
 *
 * The netting comes from the same `netFlowsByPeriod` the projection's fitted
 * rate is fitted from, so this line and that rate can never be built from two
 * different ideas of what a deposit is. They still will not read as equal,
 * and should not: the fitted rate is capital-weighted for a thirty-year
 * projection, while this chains each month's own factor because it is
 * reporting what happened rather than what to assume.
 *
 * Under a year scope the line is re-based to 0% at the year's first month, so
 * it answers "what did this year return" rather than "where does this year
 * sit on a line that started in 2023".
 */
export function ReturnOverTime({ series, scope, subject = "Portfolio" }: ReturnOverTimeProps) {
  const clipId = useSvgId("return-over-time-clip");
  const reveal = useRevealMotion(INNER_WIDTH);
  const rebased = scope !== "all";
  const points = useMemo(
    () => returnsWithin(buildPortfolioReturns(series), (period) => inScope(period, scope)),
    [series, scope],
  );
  const scales = useMemo(
    // SIGNED, not `buildScales`: that one anchors its axis at zero and reads
    // only the maximum, which is right for a currency chart whose values
    // cannot go below zero and wrong here. A return chart clipped at zero
    // hides every month the portfolio was down -- 2025 dipped to -3.68% in
    // April and the line simply vanished under the axis floor, which is the
    // opposite of what this chart exists to show.
    () => buildSignedScales(toDomainPoints(points), INNER_WIDTH, INNER_HEIGHT),
    [points],
  );
  const slots = useMemo(() => {
    const plotted = points.filter((p: PortfolioReturnPoint) => p.cumulative !== null);
    const first = plotted[0]?.period;
    const last = plotted[plotted.length - 1]?.period;
    return cursorSlots(first === undefined || last === undefined ? null : [first, last], scales);
  }, [points, scales]);
  // The cursor is generic over its point type; naming it keeps the readout
  // reading `cumulative` off a real return point rather than a widened one.
  const cursor = useChartCursor<PortfolioReturnPoint>(points, slots, CURSOR_GEOMETRY);

  const plotted = points.filter((p: PortfolioReturnPoint) => p.cumulative !== null);
  const first = plotted[0];
  const last = plotted[plotted.length - 1];
  const ending = endingCumulative(points);

  if (scales === null || first === undefined || last === undefined || ending === null) {
    return <EmptyState />;
  }

  const line = toPlotPoints(points, scales);
  const summary =
    `${subject} return from ${formatPeriodLabel(first.period)} to ` +
    `${formatPeriodLabel(last.period)}, ending at ${formatRate(ending * 100)}. ` +
    "Net of deposits, so money paid in is not counted as growth.";
  const content =
    cursor.period === null ? null : returnTooltip(cursor.point, cursor.period, rebased);
  const readout = content === null ? "" : ` ${tooltipAnnouncement(content)}`;

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
        data-return-chart=""
      >
        <title>{`${subject} return over time, net of deposits`}</title>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {scales.yTicks.map((tick) => (
            <g key={tick} transform={`translate(0,${scales.y(tick)})`}>
              {/* The zero line is drawn darker than the rest: on a return
                  chart it is break-even, not just another gridline. */}
              <line
                x1={0}
                x2={INNER_WIDTH}
                stroke={tick === 0 ? "var(--gray-a8)" : "var(--gray-a4)"}
                {...(tick === 0 ? { "data-zero-line": "" } : {})}
              />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--gray-a11)">
                {formatAxisPercent(tick)}
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
            <path
              d={linePath(line)}
              fill="none"
              stroke={ending >= 0 ? "var(--jade-a11)" : "var(--red-a11)"}
              strokeWidth={1.75}
            />
          </g>
          <CursorMarks
            x={cursor.x}
            y={
              cursor.point === null || cursor.point.cumulative === null
                ? null
                : scales.y(cursor.point.cumulative * 100)
            }
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
      <CursorAnnouncement content={content} />
      {content === null ? null : (
        <div style={{ ...tooltipAnchorStyle(MARGIN.left + (cursor.x ?? 0), WIDTH), top: 0 }}>
          <ChartTooltip content={content} />
        </div>
      )}
    </div>
  );
}
