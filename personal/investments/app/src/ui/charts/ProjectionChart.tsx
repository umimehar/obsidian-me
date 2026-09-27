import { Flex, Text } from "@radix-ui/themes";
import { type ScaleLinear, type ScaleTime, scaleLinear, scaleTime } from "d3-scale";
import { motion } from "motion/react";
import { useMemo } from "react";
import { formatCurrency, formatRate } from "../format";
import { ChartTooltip, CursorAnnouncement, readoutSuffix, tooltipAnchorStyle } from "./Tooltip";
import { type PlotPoint, formatAxisCurrency, formatPeriodLabel, linePath } from "./plot";
import {
  type DollarsMode,
  type ProjectionPoint,
  type ProjectionSeries,
  projectionDomain,
  projectionPoints,
  projectionTooltipLines,
} from "./projectionSeries";
import { useRevealMotion } from "./reveal";
import { monthsBetween, periodToDate } from "./scales";
import { DERIVED_DASH, swatchRect } from "./source";
import { useSvgId } from "./svgId";
import { CursorMarks, type CursorSlot, useChartCursor } from "./useChartCursor";

export interface ProjectionChartProps {
  series: ProjectionSeries;
  /** The base scenario's annual rate, as a fraction, stated in the tooltip. */
  rate: number;
  low: number;
  high: number;
  /** `YYYY-MM`, the anchor month in the retirement year: where the vertical rule sits. */
  retirementPeriod: string;
  /** The plan's own retirement age, named on the rule's label. */
  retirementAge: number;
  dollars: DollarsMode;
}

const WIDTH = 800;
const HEIGHT = 340;
const MARGIN = { top: 16, right: 16, bottom: 30, left: 88 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: MARGIN.left };

const HISTORY_FILL = "var(--jade-a5)";
const HISTORY_STROKE = "var(--jade-a11)";
const BASE_STROKE = "var(--gray-a11)";
const BAND_FILL = "var(--gray-a4)";

interface Axes {
  x: ScaleTime<number, number>;
  y: ScaleLinear<number, number>;
  yTicks: number[];
}

function toPlotPoints(points: readonly ProjectionPoint[], axes: Axes, at: "value"): PlotPoint[];
function toPlotPoints(
  points: readonly ProjectionPoint[],
  axes: Axes,
  at: "low" | "high",
): PlotPoint[];
function toPlotPoints(
  points: readonly ProjectionPoint[],
  axes: Axes,
  at: "value" | "low" | "high",
): PlotPoint[] {
  return points.map((point) => ({
    x: axes.x(periodToDate(point.period)),
    y: axes.y((at === "value" ? point.value : (point[at] ?? point.value)) as number),
  }));
}

/** A closed path between a low and a high line: forward along the high edge, back along the low one. */
function bandPath(points: readonly PlotPoint[][]): string {
  const [high, low] = points;
  if (high === undefined || low === undefined || high.length === 0) return "";
  const forward = high.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const backward = [...low]
    .reverse()
    .map((p) => `L${p.x},${p.y}`)
    .join(" ");
  return `${forward} ${backward} Z`;
}

/**
 * A linear axis over the whole span, history and projection together, zero
 * to the largest figure either half draws.
 *
 * Linear, not logarithmic: the band this chart now draws is the point, and a
 * band read on a compressed log scale would look narrower than the range it
 * actually states. The seam and the retirement rule are what keeps thirty
 * years of growth legible beside three years of history instead.
 */
function buildAxes(points: readonly ProjectionPoint[], series: ProjectionSeries): Axes | null {
  const first = points[0];
  const last = points[points.length - 1];
  const domain = projectionDomain(series);
  if (first === undefined || last === undefined || domain === null) return null;
  const y = scaleLinear().domain(domain).nice().range([INNER_HEIGHT, 0]);
  return {
    x: scaleTime()
      .domain([periodToDate(first.period), periodToDate(last.period)])
      .range([0, INNER_WIDTH]),
    y,
    yTicks: y.ticks(5),
  };
}

function EmptyState() {
  return (
    <Text size="2" color="gray">
      No stated market value to draw, so there is nothing to project from.
    </Text>
  );
}

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

function Legend({ low, high }: { low: number; high: number }) {
  return (
    <Flex direction="column" gap="1" data-projection-legend="">
      <Flex align="center" gap="2">
        <svg width={28} height={12} aria-hidden="true" style={{ flex: "none" }}>
          <rect
            data-legend-swatch="history"
            {...swatchRect(28, 12)}
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
            data-legend-swatch="base"
            {...swatchRect(28, 12)}
            fill="none"
            stroke={BASE_STROKE}
            strokeDasharray={DERIVED_DASH}
          />
        </svg>
        <Text size="2" color="gray">
          Dashed, right of the seam: the base rate, invented from an assumed return. No statement
          states any of it.
        </Text>
      </Flex>
      <Flex align="center" gap="2">
        <svg width={28} height={12} aria-hidden="true" style={{ flex: "none" }}>
          <rect data-legend-swatch="band" {...swatchRect(28, 12)} fill={BAND_FILL} stroke="none" />
        </svg>
        <Text size="2" color="gray" data-projection-band-note="">
          {`Shaded band: the range between ${formatRate(low * 100)} and ${formatRate(high * 100)} a year.`}
        </Text>
      </Flex>
    </Flex>
  );
}

function Halves({ series, axes }: { series: ProjectionSeries; axes: Axes }) {
  const historyPlot = toPlotPoints(series.history, axes, "value");
  const seam = series.seam !== null ? [series.seam] : [];
  const projected = [...seam, ...series.projection];
  const basePlot = toPlotPoints(projected, axes, "value");
  const highPlot = toPlotPoints(projected, axes, "high");
  const lowPlot = toPlotPoints(projected, axes, "low");

  return (
    <g>
      <path data-band-area="" d={bandPath([highPlot, lowPlot])} fill={BAND_FILL} stroke="none" />
      <path
        data-history-line=""
        d={linePath(historyPlot)}
        fill="none"
        stroke={HISTORY_STROKE}
        strokeWidth={2}
      />
      <path
        data-projection-line=""
        d={linePath(basePlot)}
        fill="none"
        stroke={BASE_STROKE}
        strokeWidth={2}
        strokeDasharray={DERIVED_DASH}
      />
    </g>
  );
}

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
 * The vertical rule at retirement, labelled "Age {age}" from the plan.
 *
 * Positioned from the scenario's own retirement `period` -- the anchor month
 * in the retirement year, per `scenario.ts` -- never a synthesized December
 * of that year, which would misplace the rule by up to eleven months for a
 * corpus whose latest statement is not from December.
 *
 * The label right-anchors once it sits close enough to the plot's right edge
 * that a middle anchor would overhang the margin, matching the same rule the
 * chart's own month labels at the axis ends already follow.
 */
function RetirementRule({ period, age, axes }: { period: string; age: number; axes: Axes }) {
  const x = axes.x(periodToDate(period));
  if (!Number.isFinite(x) || x < 0 || x > INNER_WIDTH) return null;
  const nearRightEdge = x > INNER_WIDTH - 40;
  return (
    <g data-retirement-rule="">
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={INNER_HEIGHT}
        stroke="var(--amber-a9)"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      <text
        x={x}
        y={-4}
        textAnchor={nearRightEdge ? "end" : "middle"}
        fontSize={11}
        fill="var(--amber-a11)"
      >
        {`Age ${age}`}
      </text>
    </g>
  );
}

function buildSlots(series: ProjectionSeries, axes: Axes): CursorSlot[] {
  const first = series.history[0];
  const months =
    first === undefined || series.seam === null
      ? []
      : monthsBetween(first.period, series.seam.period);
  const periods = [...months, ...series.projection.map((point) => point.period)];
  return periods.map((period) => ({ period, x: axes.x(periodToDate(period)) }));
}

function summary(series: ProjectionSeries, rate: number, dollars: DollarsMode): string {
  const first = series.history[0];
  const seam = series.seam;
  const end = series.projection[series.projection.length - 1];
  if (first === undefined || seam === null || end === undefined) {
    return "No stated market value to draw, so there is nothing to project from.";
  }
  const dollarsWord = dollars === "real" ? "today's dollars" : "future dollars";
  return (
    "Market value across the accounts selected, drawn solid from " +
    `${formatPeriodLabel(first.period)} to ${formatPeriodLabel(seam.period)}, ending at ` +
    `${formatCurrency(seam.value)}. To the right of ${formatPeriodLabel(seam.period)} a dashed ` +
    `base scenario at ${formatRate(rate * 100)} a year reaches ${formatCurrency(end.value)} by ` +
    `${formatPeriodLabel(end.period)}, in ${dollarsWord}, with a shaded low to high band either ` +
    "side. The projected half is a scenario, not a figure any statement states."
  );
}

/**
 * Stated history and a low/base/high scenario band on one linear axis, with
 * the seam between fact and assumption drawn, and a rule at the retirement
 * year.
 */
export function ProjectionChart({
  series,
  rate,
  low,
  high,
  retirementPeriod,
  retirementAge,
  dollars,
}: ProjectionChartProps) {
  const reveal = useRevealMotion(INNER_WIDTH);
  const clipId = useSvgId("projection-clip");
  const points = useMemo(() => projectionPoints(series), [series]);
  const axes = useMemo(() => buildAxes(points, series), [points, series]);
  const slots = useMemo(() => (axes === null ? [] : buildSlots(series, axes)), [series, axes]);
  const cursor = useChartCursor(points, slots, CURSOR_GEOMETRY);

  if (axes === null || series.seam === null) return <EmptyState />;

  const lines =
    cursor.period === null
      ? []
      : projectionTooltipLines(cursor.period, cursor.point, rate, dollars);
  const readout = readoutSuffix(lines);
  const first = series.history[0];
  const last = series.projection[series.projection.length - 1] ?? series.seam;

  return (
    <Flex direction="column" gap="3" data-projection-chart="">
      <Legend low={low} high={high} />
      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${summary(series, rate, dollars)}${readout}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
          tabIndex={0}
          onPointerMove={cursor.onPointerMove}
          onPointerLeave={cursor.onPointerLeave}
          onKeyDown={cursor.onKeyDown}
          onBlur={cursor.onBlur}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <title>Stated value and a range of scenarios, on one axis</title>
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
            <g clipPath={`url(#${clipId})`}>
              <Halves series={series} axes={axes} />
            </g>
            <Seam seam={series.seam} axes={axes} />
            <RetirementRule period={retirementPeriod} age={retirementAge} axes={axes} />
            <CursorMarks
              x={cursor.x}
              y={cursor.point === null ? null : axes.y(cursor.point.value)}
              height={INNER_HEIGHT}
            />
            {first === undefined ? null : (
              <text x={0} y={INNER_HEIGHT + 20} fontSize={11} fill="var(--gray-a11)">
                {formatPeriodLabel(first.period)}
              </text>
            )}
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
    </Flex>
  );
}
