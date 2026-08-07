import { Callout, Flex, Heading, Text } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { AccountSeries } from "../../analytics/types";
import { formatCurrency } from "../format";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle } from "./Tooltip";
import {
  type GapPoint,
  buildGapPoints,
  costGapPeriodExtent,
  costGapTooltipLines,
} from "./costGapSeries";
import { formatAxisCurrency, formatPeriodLabel } from "./plot";
import { buildPortfolioSeries } from "./portfolioSeries";
import { useRevealMotion } from "./reveal";
import {
  type ChartPoint,
  type ChartScales,
  buildSignedScales,
  monthBandWidth,
  periodToDate,
} from "./scales";
import { DERIVED_DASH } from "./source";
import { useSvgId } from "./svgId";
import { CursorMarks, cursorSlots, useChartCursor } from "./useChartCursor";

export interface CostGapChartProps {
  series: readonly AccountSeries[];
}

const WIDTH = 800;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 68 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
/** Hoisted so the cursor's pointer handler keeps one identity across renders. */
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: MARGIN.left };
/** The share of a month's band a bar itself occupies, the rest being the gap between bars. */
const BAR_WIDTH_FRACTION = 0.6;

const ABOVE_FILL = "var(--jade-a6)";
const BELOW_FILL = "var(--amber-a6)";
const DERIVED_STROKE = "var(--gray-a11)";

function EmptyState() {
  return (
    <Flex direction="column" gap="2">
      <Heading size="5" as="h2">
        Value at market against value at cost
      </Heading>
      <Text size="2" color="gray">
        No portfolio value history yet.
      </Text>
    </Flex>
  );
}

/**
 * The caveat, stated once in the open above the chart, because it governs
 * every bar drawn below it: the reconciliation report behind this page found
 * that book cost does not reconcile on 19 statements, by up to $218.92, and
 * every one of those 19 holds a USD security while no CAD-only statement
 * diverges at all. Each statement discloses one month-end conversion rate
 * and its own footnote scopes that rate to market value, not to book cost --
 * book cost is an accumulated basis recorded at each purchase's own
 * historical rate, so no single current rate can reconstruct it. The gap
 * this chart draws is therefore an approximate figure, never a realized gain
 * and never one to file with. Each bar repeats the word "approximate" next
 * to its own number too, in `costGapTooltipLines`, so the caveat is not only
 * here once but adjacent to every figure it qualifies.
 */
function ApproximationNote() {
  return (
    <Callout.Root color="gray" variant="surface" data-cost-gap-provenance="">
      <Callout.Text>
        Book cost does not reconcile on 19 of the underlying statements, by up to $218.92, because
        each one prints a single month-end conversion rate scoped to market value while book cost is
        an accumulated basis recorded at each purchase's own historical rate. The gap drawn here is
        an approximate figure, not a realized gain and not a number to file with.
      </Callout.Text>
    </Callout.Root>
  );
}

/**
 * A bar swatch the same fill the chart draws, so the words below it name
 * something visible. `sign` carries onto the rect as `data-legend-swatch`,
 * so a test can pin a bar's fill to the swatch its own legend row names it
 * with, rather than to a colour token that could drift from the words
 * without either side's own test noticing.
 */
function BarSwatch({ sign, fill }: { sign: "above" | "below"; fill: string }) {
  return (
    <svg width={28} height={12} aria-hidden="true" style={{ flex: "none" }}>
      <rect
        data-legend-swatch={sign}
        x={0}
        y={0}
        width={28}
        height={12}
        fill={fill}
        stroke={DERIVED_STROKE}
        strokeDasharray={DERIVED_DASH}
      />
    </svg>
  );
}

/**
 * The grammar in words.
 *
 * The dashed border is the same `DERIVED_DASH` the returns chart uses for a
 * line no statement prints: nothing on this chart is stated, since no
 * statement prints the gap itself, only the two figures it is computed from.
 * The specific reason the underlying figures are approximate -- the USD
 * conversion gap -- is `ApproximationNote`'s job, not the legend's; a legend
 * names what a mark looks like, not why.
 */
function Legend() {
  return (
    <Flex direction="column" gap="1" data-cost-gap-legend="">
      <Flex align="center" gap="2">
        <BarSwatch sign="above" fill={ABOVE_FILL} />
        <Text size="2" color="gray">
          Bar above the line: market value ahead of book cost, an approximate unrealized gain.
        </Text>
      </Flex>
      <Flex align="center" gap="2">
        <BarSwatch sign="below" fill={BELOW_FILL} />
        <Text size="2" color="gray">
          Bar below the line: book cost ahead of market value, an approximate unrealized loss.
        </Text>
      </Flex>
      <Text size="2" color="gray">
        Dashed border on every bar: derived here, not a figure any statement itself states.
      </Text>
      <Text size="2" color="gray">
        A thin line at zero, no bar: a month whose statements state market value equal to book cost,
        a real zero gap.
      </Text>
      <Text size="2" color="gray">
        Nothing drawn at all: no statement covers this month.
      </Text>
    </Flex>
  );
}

/** The domain point `buildSignedScales` needs: the gap, signed, per period. */
function toDomainPoints(points: readonly GapPoint[]): ChartPoint[] {
  return points.map((p) => ({ period: p.period, value: p.gap }));
}

/** The y ticks, with the zero line drawn heavier because it is the baseline every bar grows from. */
function Gridlines({ scales }: { scales: ChartScales }) {
  return (
    <>
      {scales.yTicks.map((tick) => (
        <g key={tick} transform={`translate(0,${scales.y(tick)})`}>
          <line
            x1={0}
            x2={INNER_WIDTH}
            stroke={tick === 0 ? "var(--gray-a8)" : "var(--gray-a4)"}
            {...(tick === 0 ? { "data-zero-line": "" } : {})}
          />
          <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--gray-a11)">
            {formatAxisCurrency(tick)}
          </text>
        </g>
      ))}
    </>
  );
}

/**
 * One bar per stated month: growing up from zero when market value leads,
 * down when book cost leads. A month with no `GapPoint` at all -- one
 * `points` never contains, because `buildPortfolioSeries` skips a period
 * neither figure is stated for -- draws no rect, leaving the axis blank
 * rather than a zero-height bar. A month whose point states an equal market
 * value and book cost still draws its rect, at zero height; the stroke on a
 * zero-height rect is a thin line at the baseline, which is what makes a
 * real stated zero gap visibly different from the plain gap next to it.
 */
function Bars({
  points,
  scales,
  bandWidth,
}: {
  points: readonly GapPoint[];
  scales: ChartScales;
  bandWidth: number;
}) {
  const zeroY = scales.y(0);
  return (
    <>
      {points.map((point) => {
        const x = scales.x(periodToDate(point.period)) - bandWidth / 2;
        const gapY = scales.y(point.gap);
        const above = point.gap >= 0;
        return (
          <rect
            key={point.period}
            data-cost-gap-bar={above ? "above" : "below"}
            data-period={point.period}
            x={x}
            y={above ? gapY : zeroY}
            width={bandWidth}
            height={Math.max(0, above ? zeroY - gapY : gapY - zeroY)}
            fill={above ? ABOVE_FILL : BELOW_FILL}
            stroke={DERIVED_STROKE}
            strokeWidth={1}
            strokeDasharray={DERIVED_DASH}
          />
        );
      })}
    </>
  );
}

/** What a screen reader gets before the cursor moves. */
function summary(points: readonly GapPoint[], monthCount: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return "No portfolio value history yet.";
  const drawn = points.length;
  const verb = drawn === 1 ? "has" : "have";
  const blanks =
    drawn === monthCount
      ? ""
      : " The rest have no statement and are left blank rather than drawn as zero.";
  return (
    "The approximate gap between market value and book cost, from " +
    `${formatPeriodLabel(first.period)} to ${formatPeriodLabel(last.period)}, ending at ` +
    `${formatCurrency(last.gap)}. ${drawn} of ${monthCount} months ${verb} a statement.${blanks} ` +
    "Not a realized gain and not a filing figure."
  );
}

/**
 * The gap between market value and book cost, one bar per month.
 *
 * Both figures already exist per period in `buildPortfolioSeries`'s output,
 * so this draws their difference rather than re-summing the underlying
 * series. The rule this view exists to hold: the gap is never presented as a
 * realized figure. Every reader-facing rendering of it -- the tooltip, the
 * live announcement and the chart's accessible name -- carries the word
 * "approximate" next to the number, from the one `costGapTooltipLines` call,
 * because a caveat printed once elsewhere on the page is not adjacent to the
 * figure it qualifies.
 */
export function CostGapChart({ series }: CostGapChartProps) {
  const clipId = useSvgId("cost-gap-clip");
  const reveal = useRevealMotion(INNER_WIDTH);
  const points = useMemo(() => buildGapPoints(buildPortfolioSeries(series)), [series]);
  const extent = useMemo(() => costGapPeriodExtent(points), [points]);
  const scales = useMemo(
    () => buildSignedScales(toDomainPoints(points), INNER_WIDTH, INNER_HEIGHT),
    [points],
  );
  const slots = useMemo(() => cursorSlots(extent, scales), [extent, scales]);
  const cursor = useChartCursor(points, slots, CURSOR_GEOMETRY);
  const bandWidth = useMemo(
    () => monthBandWidth(slots.length, INNER_WIDTH, BAR_WIDTH_FRACTION),
    [slots.length],
  );

  if (scales === null || extent === null) {
    return <EmptyState />;
  }

  const lines = cursor.period === null ? [] : costGapTooltipLines(cursor.period, cursor.point);
  const readout = lines.length === 0 ? "" : ` ${lines.join(". ")}.`;

  return (
    <Flex direction="column" gap="4">
      <Heading size="5" as="h2">
        Value at market against value at cost
      </Heading>
      <ApproximationNote />
      <Legend />
      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${summary(points, slots.length)}${readout}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
          tabIndex={0}
          onPointerMove={cursor.onPointerMove}
          onPointerLeave={cursor.onPointerLeave}
          onKeyDown={cursor.onKeyDown}
          onBlur={cursor.onBlur}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <title>Value at market against value at cost, an approximate gap</title>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            <Gridlines scales={scales} />
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
              <Bars points={points} scales={scales} bandWidth={bandWidth} />
            </g>
            <CursorMarks
              x={cursor.x}
              y={cursor.point === null ? null : scales.y(cursor.point.gap)}
              height={INNER_HEIGHT}
            />
            <text x={0} y={INNER_HEIGHT + 20} fontSize={11} fill="var(--gray-a11)">
              {formatPeriodLabel(extent[0])}
            </text>
            <text
              x={INNER_WIDTH}
              y={INNER_HEIGHT + 20}
              textAnchor="end"
              fontSize={11}
              fill="var(--gray-a11)"
            >
              {formatPeriodLabel(extent[1])}
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
