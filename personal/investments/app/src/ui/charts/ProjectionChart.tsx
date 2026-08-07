import { Flex, Text } from "@radix-ui/themes";
import { type ScaleLogarithmic, type ScaleTime, scaleLog, scaleTime } from "d3-scale";
import { motion } from "motion/react";
import { useMemo } from "react";
import { formatCurrency, formatRate } from "../format";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle } from "./Tooltip";
import { type PlotPoint, areaPath, formatAxisCurrency, formatPeriodLabel, linePath } from "./plot";
import {
  type ProjectionPoint,
  type ProjectionSeries,
  decadeTicks,
  projectionPoints,
  projectionTooltipLines,
} from "./projectionSeries";
import { useRevealMotion } from "./reveal";
import { monthsBetween, periodToDate } from "./scales";
import { DERIVED_DASH } from "./source";
import { useSvgId } from "./svgId";
import { CursorMarks, type CursorSlot, useChartCursor } from "./useChartCursor";

export interface ProjectionChartProps {
  series: ProjectionSeries;
  /**
   * The logarithmic axis's domain. Supplied by the caller rather than derived
   * from `series`, because it must be built from the largest scenario the
   * controls can produce: an axis rebuilt from the scenario on screen would
   * redraw the stated history every time the rate slider moved.
   */
  domain: readonly [number, number];
  /** The annual rate the projected half assumes, as a fraction. */
  rate: number;
}

const WIDTH = 800;
const HEIGHT = 340;
const MARGIN = { top: 16, right: 16, bottom: 30, left: 108 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
/** Hoisted so the cursor's pointer handler keeps one identity across renders. */
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: MARGIN.left };

const HISTORY_FILL = "var(--jade-a5)";
const HISTORY_STROKE = "var(--jade-a11)";
const PROJECTION_STROKE = "var(--gray-a11)";

interface Axes {
  x: ScaleTime<number, number>;
  y: ScaleLogarithmic<number, number>;
  yTicks: number[];
}

/** Only the points a logarithmic axis can place. A stated zero is reported by the cursor and left undrawn. */
function drawable(points: readonly ProjectionPoint[]): ProjectionPoint[] {
  return points.filter((point) => point.value > 0);
}

function toPlotPoints(points: readonly ProjectionPoint[], axes: Axes): PlotPoint[] {
  return points.map((point) => ({
    x: axes.x(periodToDate(point.period)),
    y: axes.y(point.value),
  }));
}

/**
 * A logarithmic value axis and a time axis over the whole span, history and
 * projection together.
 *
 * Logarithmic, not linear, and that is not a stylistic choice. Thirty years at
 * the default 6% multiplies the opening balance by about forty, so on a linear
 * axis the three years of stated history would occupy the bottom two percent of
 * the plot and read as a flat line at zero. The seam this view exists to show
 * would be invisible. Decade ticks keep every figure readable against a
 * labelled gridline instead.
 */
function buildAxes(
  points: readonly ProjectionPoint[],
  domain: readonly [number, number],
): Axes | null {
  const drawn = drawable(points);
  const first = drawn[0];
  const last = drawn[drawn.length - 1];
  if (first === undefined || last === undefined) return null;
  return {
    x: scaleTime()
      .domain([periodToDate(first.period), periodToDate(last.period)])
      .range([0, INNER_WIDTH]),
    y: scaleLog().domain([domain[0], domain[1]]).range([INNER_HEIGHT, 0]),
    yTicks: decadeTicks(domain),
  };
}

function EmptyState() {
  return (
    <Text size="2" color="gray">
      No stated market value to draw, so there is nothing to project from.
    </Text>
  );
}

/** Decade gridlines, each labelled with the figure it stands for. */
function Gridlines({ axes }: { axes: Axes }) {
  return (
    <>
      {axes.yTicks.map((tick) => (
        <g key={tick} transform={`translate(0,${axes.y(tick)})`}>
          <line x1={0} x2={INNER_WIDTH} stroke="var(--gray-a4)" />
          <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--gray-a11)">
            {formatAxisCurrency(tick)}
          </text>
        </g>
      ))}
    </>
  );
}

/**
 * The scale, named in words, because evenly spaced gridlines are exactly the
 * cue a reader skips.
 *
 * The labels read $1,000 through $1,000,000,000 at even spacing, and a reader
 * who assumes a linear axis reads the plot's midpoint as about half the end
 * figure. On this axis that midpoint is around $31,600. The same reader sees
 * thirty years of compounding rise less than three years of history did and
 * concludes growth flattens off. Both readings are wrong, and nothing else on
 * screen contradicts either.
 *
 * One constant, spoken by the legend and carried in the accessible summary, so
 * a sighted reader and a screen reader cannot be told two different things
 * about the same axis.
 */
const DECADE_NOTE =
  "Each gridline is ten times the one below it, not a fixed step, which is what fits thirty years of compounding beside three years of history.";

/**
 * The grammar in words, so the difference between the two halves is not left
 * to colour or to the reader's guess. Both swatches are drawn with the same
 * fills the chart itself uses, so a legend cannot drift from the marks it
 * names.
 */
function Legend({ hatchId }: { hatchId: string }) {
  return (
    <Flex direction="column" gap="1" data-projection-legend="">
      <Flex align="center" gap="2">
        <svg width={28} height={12} aria-hidden="true" style={{ flex: "none" }}>
          <rect
            data-legend-swatch="history"
            width={28}
            height={12}
            fill={HISTORY_FILL}
            stroke={HISTORY_STROKE}
          />
        </svg>
        <Text size="2" color="gray">
          Solid, left of the seam: market value your statements state.
        </Text>
      </Flex>
      <Flex align="center" gap="2">
        <svg width={28} height={12} aria-hidden="true" style={{ flex: "none" }}>
          <rect
            data-legend-swatch="projection"
            width={28}
            height={12}
            fill={`url(#${hatchId})`}
            stroke={PROJECTION_STROKE}
            strokeDasharray={DERIVED_DASH}
          />
        </svg>
        <Text size="2" color="gray">
          Hatched and dashed, right of the seam: a projection, invented from an assumed rate. No
          statement states any of it.
        </Text>
      </Flex>
      <Text size="2" color="gray" data-projection-scale-note="">
        {DECADE_NOTE}
      </Text>
    </Flex>
  );
}

/** The diagonal hatch that marks every projected mark as an assumption rather than a figure. */
function HatchPattern({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      data-projection-hatch=""
      width={7}
      height={7}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width={7} height={7} fill="var(--gray-a2)" />
      <line x1={0} y1={0} x2={0} y2={7} stroke="var(--gray-a8)" strokeWidth={1.5} />
    </pattern>
  );
}

/**
 * The two halves, joined at the seam.
 *
 * The projected path starts at the seam point itself rather than at the first
 * projected year, so the assumption visibly grows out of the last stated
 * figure instead of floating beside it. The seam point is drawn by the history
 * half, so it is stated once and only once.
 */
function Halves({
  series,
  axes,
  clipId,
  hatchId,
}: {
  series: ProjectionSeries;
  axes: Axes;
  clipId: string;
  hatchId: string;
}) {
  const historyPlot = toPlotPoints(drawable(series.history), axes);
  const seam = series.seam !== null && series.seam.value > 0 ? [series.seam] : [];
  const projectionPlot = toPlotPoints([...seam, ...drawable(series.projection)], axes);

  return (
    <g clipPath={`url(#${clipId})`}>
      <path
        data-projection-area=""
        d={areaPath(projectionPlot, INNER_HEIGHT)}
        fill={`url(#${hatchId})`}
        stroke="none"
      />
      <path data-history-area="" d={areaPath(historyPlot, INNER_HEIGHT)} fill={HISTORY_FILL} />
      <path
        data-history-line=""
        d={linePath(historyPlot)}
        fill="none"
        stroke={HISTORY_STROKE}
        strokeWidth={2}
      />
      <path
        data-projection-line=""
        d={linePath(projectionPlot)}
        fill="none"
        stroke={PROJECTION_STROKE}
        strokeWidth={2}
        strokeDasharray={DERIVED_DASH}
      />
    </g>
  );
}

/** The vertical rule at the last stated month: exactly where fact stops. */
function Seam({ seam, axes }: { seam: ProjectionPoint; axes: Axes }) {
  const x = axes.x(periodToDate(seam.period));
  return (
    <g data-seam="" data-seam-period={seam.period}>
      <line x1={x} x2={x} y1={0} y2={INNER_HEIGHT} stroke="var(--gray-a9)" strokeWidth={1} />
      <text x={x} y={-4} textAnchor="middle" fontSize={11} fill="var(--gray-a11)">
        {`${formatPeriodLabel(seam.period)}, last statement`}
      </text>
    </g>
  );
}

/**
 * The axis a cursor walks: every calendar month of the stated half, so a month
 * no statement covers stays a gap the cursor reports as one, then one slot per
 * projected year, because the months between two projected Decembers are not
 * missing data. There is nothing annual about them to miss.
 *
 * This deliberately starts at `history[0]`, while `buildAxes` starts the x
 * domain at the first DRAWABLE point. The two disagree by exactly the leading
 * run of months at or below zero, which the axis cannot place but the cursor
 * still has to report -- in this corpus one month, putting that slot at
 * x = -1.66, inside the left margin and effectively unreachable. The readout
 * is right either way. The offset grows with the length of that leading run,
 * so a corpus opening with a long unfunded stretch would push several slots
 * off the plot: reconcile the two here if that ever happens, rather than
 * moving the axis, which would leave a mark drawn against a domain no
 * gridline covers.
 */
function buildSlots(series: ProjectionSeries, axes: Axes): CursorSlot[] {
  const first = series.history[0];
  const months =
    first === undefined || series.seam === null
      ? []
      : monthsBetween(first.period, series.seam.period);
  const periods = [...months, ...series.projection.map((point) => point.period)];
  return periods.map((period) => ({ period, x: axes.x(periodToDate(period)) }));
}

/** What a screen reader gets before the cursor moves anywhere. */
function summary(series: ProjectionSeries, rate: number): string {
  const first = drawable(series.history)[0];
  const seam = series.seam;
  const end = series.projection[series.projection.length - 1];
  if (first === undefined || seam === null || end === undefined) {
    return "No stated market value to draw, so there is nothing to project from.";
  }
  const undrawn = series.history.length - drawable(series.history).length;
  const zeros =
    undrawn === 0
      ? ""
      : ` ${undrawn} stated month at or below zero is not drawn, because a logarithmic axis cannot place it.`;
  return (
    "Market value across the accounts this projection covers, drawn solid from " +
    `${formatPeriodLabel(first.period)} to ${formatPeriodLabel(seam.period)}, ending at ` +
    `${formatCurrency(seam.value)}. To the right of ${formatPeriodLabel(seam.period)} a hatched ` +
    `projection at ${formatRate(rate * 100)} a year reaches ${formatCurrency(end.value)} by ` +
    `${formatPeriodLabel(end.period)}. The projected half is a scenario, not a figure any ` +
    `statement states. ${DECADE_NOTE}${zeros}`
  );
}

/**
 * Stated history and projected years on one axis, with the seam between them
 * drawn rather than described.
 *
 * The two halves are distinguished three ways at once and never by colour
 * alone: the stated half is a solid fill under a solid line, the projected half
 * a diagonal hatch under a dashed line, and a labelled rule stands at the last
 * stated month. A reader has to be able to see where fact stops, because
 * everything to the right of that rule is the only thing on this page that
 * nobody transcribed from a statement.
 */
export function ProjectionChart({ series, domain, rate }: ProjectionChartProps) {
  const clipId = useSvgId("projection-clip");
  const hatchId = useSvgId("projection-hatch");
  const reveal = useRevealMotion(INNER_WIDTH);
  const points = useMemo(() => projectionPoints(series), [series]);
  const axes = useMemo(() => buildAxes(points, domain), [points, domain]);
  const slots = useMemo(() => (axes === null ? [] : buildSlots(series, axes)), [series, axes]);
  const cursor = useChartCursor(points, slots, CURSOR_GEOMETRY);

  if (axes === null || series.seam === null) return <EmptyState />;

  const lines =
    cursor.period === null ? [] : projectionTooltipLines(cursor.period, cursor.point, rate);
  const readout = lines.length === 0 ? "" : ` ${lines.join(". ")}.`;
  const cursorValue = cursor.point === null || cursor.point.value <= 0 ? null : cursor.point.value;
  const drawn = drawable(points);
  const firstDrawn = drawn[0];
  const lastDrawn = drawn[drawn.length - 1];

  return (
    <Flex direction="column" gap="3" data-projection-chart="">
      <Legend hatchId={hatchId} />
      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${summary(series, rate)}${readout}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
          tabIndex={0}
          onPointerMove={cursor.onPointerMove}
          onPointerLeave={cursor.onPointerLeave}
          onKeyDown={cursor.onKeyDown}
          onBlur={cursor.onBlur}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <title>Stated value and a thirty year projection, on one axis</title>
          <defs>
            <HatchPattern id={hatchId} />
          </defs>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            <Gridlines axes={axes} />
            <clipPath id={clipId}>
              <motion.rect
                y={0}
                height={INNER_HEIGHT}
                initial={{ width: reveal.initialWidth }}
                animate={{ width: INNER_WIDTH }}
                transition={{ duration: reveal.duration, ease: "easeOut" }}
              />
            </clipPath>
            <Halves series={series} axes={axes} clipId={clipId} hatchId={hatchId} />
            <Seam seam={series.seam} axes={axes} />
            <CursorMarks
              x={cursor.x}
              y={cursorValue === null ? null : axes.y(cursorValue)}
              height={INNER_HEIGHT}
            />
            {firstDrawn === undefined ? null : (
              <text x={0} y={INNER_HEIGHT + 20} fontSize={11} fill="var(--gray-a11)">
                {formatPeriodLabel(firstDrawn.period)}
              </text>
            )}
            {lastDrawn === undefined ? null : (
              <text
                x={INNER_WIDTH}
                y={INNER_HEIGHT + 20}
                textAnchor="end"
                fontSize={11}
                fill="var(--gray-a11)"
              >
                {formatPeriodLabel(lastDrawn.period)}
              </text>
            )}
          </g>
        </svg>
        <CursorAnnouncement lines={lines} />
        {lines.length === 0 ? null : (
          <div style={{ ...tooltipAnchorStyle(MARGIN.left + (cursor.x ?? 0), WIDTH), top: 0 }}>
            <ChartTooltip lines={lines} />
          </div>
        )}
      </div>
    </Flex>
  );
}
