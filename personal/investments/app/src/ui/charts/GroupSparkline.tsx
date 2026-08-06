import { motion } from "motion/react";
import { useId, useMemo } from "react";
import type { AccountSeries } from "../../analytics/types";
import { formatCurrency } from "../format";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle, tooltipLines } from "./Tooltip";
import { type PlotPoint, areaPath, formatPeriodLabel, linePath } from "./plot";
import { type PortfolioPoint, buildPortfolioSeries } from "./portfolioSeries";
import { useRevealMotion } from "./reveal";
import { type ChartPoint, buildScales, periodToDate } from "./scales";
import { CursorMarks, cursorSlots, useChartCursor } from "./useChartCursor";

export interface GroupSparklineProps {
  /** The group's own name, so the accessible summary says which card this chart belongs to. */
  label: string;
  /** The group's accounts, already narrowed by `seriesForAccounts`. */
  series: readonly AccountSeries[];
  /**
   * The whole portfolio's `[first, last]` period, shared by every card so
   * the cards are comparable. Null when the corpus has no points at all,
   * which renders the empty state rather than a chart with no domain.
   */
  xDomain: readonly [string, string] | null;
}

/**
 * The viewBox is wide and short because the chart scales uniformly: the svg
 * is laid out at `width: 100%` with an automatic height, so the rendered
 * height is the card's width divided by this aspect ratio. A squarer box
 * would draw a 100px-tall band inside a 744px card, which is a chart, not
 * the sparkline this is meant to be. Nothing here is a fixed pixel width --
 * a narrower card simply scales the whole thing down.
 */
const WIDTH = 720;
const HEIGHT = 48;
/** Room for the end marker's radius, so a dot on the last point is not half-clipped at the viewBox edge. */
const PAD = 3;
/** The plot box inside the padding. Exported so a test can state a coordinate as a fraction of it rather than as a magic number. */
export const INNER_WIDTH = WIDTH - PAD * 2;
export const INNER_HEIGHT = HEIGHT - PAD * 2;
const DOT_RADIUS = 2.5;
/** Hoisted so the cursor's pointer handler keeps one identity across renders. */
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: PAD };

/**
 * The points `buildScales` sees: the group's own values, plus a zero-valued
 * point at each end of the portfolio's period range.
 *
 * The two extra points pin the x domain to the shared portfolio range
 * without touching the y domain, since a zero can never raise a maximum.
 * That is the whole comparability rule in one place: a group with six
 * months of history draws an area across the last sixth of its card, and a
 * group with thirty-seven draws across all of it. Rescaling each card to
 * its own range would draw both the same width and imply the RESP has three
 * years of history it does not have.
 */
function domainPoints(
  points: readonly PortfolioPoint[],
  xDomain: readonly [string, string],
): ChartPoint[] {
  return [
    { period: xDomain[0], value: 0 },
    { period: xDomain[1], value: 0 },
    ...points.map((p) => ({ period: p.period, value: p.marketValue })),
  ];
}

/**
 * A group with nothing to plot. The three Chequing accounts are
 * `inTotals: false`, so the Cash and Spending groups produce no points at
 * all, and a flat line along the baseline would read as a real balance of
 * nothing. This says there is no history instead, matching the account rows
 * that print "No figure" rather than `$0.00` for an account with no stated
 * value.
 */
function EmptyState({ label }: { label: string }) {
  return (
    <div role="img" aria-label={`${label}: no value history to chart.`}>
      <p style={{ color: "var(--gray-a11)", fontSize: 12, margin: 0 }}>No value history</p>
    </div>
  );
}

/**
 * What a group with exactly one statement has to say for itself.
 *
 * The account lens's Crypto group holds one statement, so its chart is a
 * single dot on an otherwise empty band, which at a glance reads as a chart
 * that failed to draw rather than as a group with one month of history. The
 * dot is honest and stays; this says in words what it means, so the reader
 * is not left to work out whether the emptiness is the data or a bug.
 */
function SingleStatementNote({ period }: { period: string }) {
  return (
    <p style={{ color: "var(--gray-a11)", fontSize: 12, margin: "2px 0 0" }}>
      One statement, {formatPeriodLabel(period)}. Not enough history to draw a line.
    </p>
  );
}

/**
 * One group's market value over time, filled, sized to sit inside a group
 * card in place of a figure that was already in the card's text.
 *
 * The series comes from `buildPortfolioSeries` over the group's accounts,
 * so the `inTotals` exclusion and the no-zero-fill rule are the portfolio
 * chart's, not a second implementation of them.
 *
 * The x domain is shared across every card (see `domainPoints`). The y
 * domain is per card: zero to this group's own maximum. A shared y domain
 * would make the cards comparable in magnitude, but the card already states
 * its magnitude twice, as a dollar total and as a share of the portfolio,
 * and on a domain sized for the $108,953.60 Growth group the $3,943.98
 * Education group would draw as a flat smear along the baseline. The chart
 * is here for the shape over time, which is the one thing the text does not
 * say, so legibility of that shape wins.
 */
export function GroupSparkline({ label, series, xDomain }: GroupSparklineProps) {
  const rawClipId = useId();
  const clipId = `group-sparkline-clip-${rawClipId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const reveal = useRevealMotion(INNER_WIDTH);
  const points = useMemo(() => buildPortfolioSeries(series), [series]);
  const scales = useMemo(
    () =>
      xDomain === null
        ? null
        : buildScales(domainPoints(points, xDomain), INNER_WIDTH, INNER_HEIGHT),
    [points, xDomain],
  );
  const slots = useMemo(() => cursorSlots(xDomain, scales), [xDomain, scales]);
  const cursor = useChartCursor(points, slots, CURSOR_GEOMETRY);
  const countedAccounts = useMemo(
    () => series.filter((account) => account.inTotals).length,
    [series],
  );

  const first = points[0];
  const last = points[points.length - 1];

  if (scales === null || first === undefined || last === undefined) {
    return <EmptyState label={label} />;
  }

  const plotted: PlotPoint[] = points.map((p) => ({
    x: scales.x(periodToDate(p.period)),
    y: scales.y(p.marketValue),
  }));
  const end = plotted[plotted.length - 1];

  const summary =
    `${label} market value from ${formatPeriodLabel(first.period)} to ` +
    `${formatPeriodLabel(last.period)}, ending at ${formatCurrency(last.marketValue)}.`;
  // One call, three consumers: the accessible name, the spoken announcement
  // and the visible tooltip. See the same note in ValueOverTime.
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
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <title>{`${label} value over time`}</title>
        <g transform={`translate(${PAD},${PAD})`}>
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
            <path d={areaPath(plotted, INNER_HEIGHT)} fill="var(--jade-a5)" stroke="none" />
            <path d={linePath(plotted)} fill="none" stroke="var(--jade-a11)" strokeWidth={1.25} />
            {/* The end marker, which is also the whole chart for a group with a
                single statement: one point draws a zero-width area and no line. */}
            {end !== undefined ? (
              <circle cx={end.x} cy={end.y} r={DOT_RADIUS} fill="var(--jade-a11)" />
            ) : null}
          </g>
          <CursorMarks
            x={cursor.x}
            y={cursor.point === null ? null : scales.y(cursor.point.marketValue)}
            height={INNER_HEIGHT}
          />
        </g>
      </svg>
      {points.length === 1 ? <SingleStatementNote period={last.period} /> : null}
      <CursorAnnouncement lines={lines} />
      {lines.length === 0 ? null : (
        <div style={{ ...tooltipAnchorStyle(PAD + (cursor.x ?? 0), WIDTH), top: "100%" }}>
          <ChartTooltip lines={lines} />
        </div>
      )}
    </div>
  );
}
