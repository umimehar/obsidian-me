import { Flex, Heading, Text } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { MonthlyActivity } from "../../analytics/incomeCosts";
import { formatCurrency } from "../format";
import { ChartTooltip, CursorAnnouncement, readoutSuffix, tooltipAnchorStyle } from "./Tooltip";
import { dividendsTooltipLines } from "./dividendsTooltip";
import { formatAxisCurrency, formatPeriodLabel } from "./plot";
import { useRevealMotion } from "./reveal";
import { type ChartScales, buildScales, monthBandWidth, periodToDate } from "./scales";
import { useSvgId } from "./svgId";
import { CursorMarks, cursorSlots, useChartCursor } from "./useChartCursor";

export interface DividendsChartProps {
  year: number;
  months: readonly MonthlyActivity[];
}

const WIDTH = 720;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 68 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
/** Hoisted so the cursor's pointer handler keeps one identity across renders. */
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: MARGIN.left };
/** The share of a month's band a bar itself occupies, the rest being the gap between bars. */
const BAR_WIDTH_FRACTION = 0.6;

const BAR_FILL = "var(--jade-a6)";
const BAR_STROKE = "var(--jade-a11)";

function EmptyState({ year }: { year: number }) {
  return (
    <Flex direction="column" gap="2">
      <Heading size="5" as="h2">
        Monthly dividends, {year}
      </Heading>
      <Text size="2" color="gray">
        No statement covers {year} yet.
      </Text>
    </Flex>
  );
}

/** The chart's own period range: the first and last month with a statement, never the whole corpus. */
function extent(months: readonly MonthlyActivity[]): [string, string] | null {
  const first = months[0];
  const last = months[months.length - 1];
  return first === undefined || last === undefined ? null : [first.period, last.period];
}

function Gridlines({ scales }: { scales: ChartScales }) {
  return (
    <>
      {scales.yTicks.map((tick) => (
        <g key={tick} transform={`translate(0,${scales.y(tick)})`}>
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
 * One bar per stated month. A month with no `MonthlyActivity` at all draws
 * no rect, leaving the axis blank rather than a zero-height bar -- the same
 * absence-versus-zero rule `CashflowChart` and `CostGapChart` hold.
 */
function Bars({
  months,
  scales,
  bandWidth,
}: {
  months: readonly MonthlyActivity[];
  scales: ChartScales;
  bandWidth: number;
}) {
  const zeroY = scales.y(0);
  return (
    <>
      {months.map((month) => {
        const x = scales.x(periodToDate(month.period)) - bandWidth / 2;
        const y = scales.y(month.totals.dividends);
        return (
          <rect
            key={month.period}
            data-dividend-bar=""
            data-period={month.period}
            x={x}
            y={y}
            width={bandWidth}
            height={Math.max(0, zeroY - y)}
            fill={BAR_FILL}
            stroke={BAR_STROKE}
            strokeWidth={1}
          />
        );
      })}
    </>
  );
}

/** What a screen reader gets before the cursor moves: the year and its dividend total. */
function summary(year: number, months: readonly MonthlyActivity[], monthCount: number): string {
  const total = months.reduce((sum, m) => sum + m.totals.dividends, 0);
  const drawn = months.length;
  const verb = drawn === 1 ? "has" : "have";
  const blanks =
    drawn === monthCount
      ? ""
      : " The rest have no statement and are left blank rather than drawn as zero.";
  return (
    `Monthly dividends in ${year}, totalling ${formatCurrency(total)}. ` +
    `${drawn} of ${monthCount} months ${verb} a statement.${blanks}`
  );
}

/**
 * Dividends paid each month of the selected year, one bar per stated month.
 * Built on the same scale and cursor primitives as `CashflowChart` and
 * `CostGapChart`; unsigned, since a dividend is never negative.
 */
export function DividendsChart({ year, months }: DividendsChartProps) {
  const clipId = useSvgId("dividends-clip");
  const reveal = useRevealMotion(INNER_WIDTH);
  const range = useMemo(() => extent(months), [months]);
  const scales = useMemo(
    () =>
      buildScales(
        months.map((m) => ({ period: m.period, value: m.totals.dividends })),
        INNER_WIDTH,
        INNER_HEIGHT,
      ),
    [months],
  );
  const slots = useMemo(() => cursorSlots(range, scales), [range, scales]);
  const cursor = useChartCursor(months, slots, CURSOR_GEOMETRY);
  const bandWidth = useMemo(
    () => monthBandWidth(slots.length, INNER_WIDTH, BAR_WIDTH_FRACTION),
    [slots.length],
  );

  if (scales === null || range === null) {
    return <EmptyState year={year} />;
  }

  const lines = cursor.period === null ? [] : dividendsTooltipLines(cursor.period, cursor.point);
  const readout = readoutSuffix(lines);

  return (
    <Flex direction="column" gap="4">
      <Heading size="5" as="h2">
        Monthly dividends, {year}
      </Heading>
      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${summary(year, months, slots.length)}${readout}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
          tabIndex={0}
          onPointerMove={cursor.onPointerMove}
          onPointerLeave={cursor.onPointerLeave}
          onKeyDown={cursor.onKeyDown}
          onBlur={cursor.onBlur}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <title>{`Monthly dividends, ${year}`}</title>
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
              <Bars months={months} scales={scales} bandWidth={bandWidth} />
            </g>
            <CursorMarks
              x={cursor.x}
              y={cursor.point === null ? null : scales.y(cursor.point.totals.dividends)}
              height={INNER_HEIGHT}
            />
            <text x={0} y={INNER_HEIGHT + 20} fontSize={11} fill="var(--gray-a11)">
              {formatPeriodLabel(range[0])}
            </text>
            <text
              x={INNER_WIDTH}
              y={INNER_HEIGHT + 20}
              textAnchor="end"
              fontSize={11}
              fill="var(--gray-a11)"
            >
              {formatPeriodLabel(range[1])}
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
