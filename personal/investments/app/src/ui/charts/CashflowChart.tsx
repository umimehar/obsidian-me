import { Flex, Heading, Text } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { AccountSeries } from "../../analytics/types";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle } from "./Tooltip";
import {
  type CashflowPoint,
  buildCashflowSeries,
  cashflowPeriodExtent,
  cashflowTooltipLines,
} from "./cashflowSeries";
import { formatAxisCurrency, formatPeriodLabel } from "./plot";
import { useRevealMotion } from "./reveal";
import { type ChartPoint, type ChartScales, buildSignedScales, periodToDate } from "./scales";
import { useSvgId } from "./svgId";
import { CursorMarks, cursorSlots, useChartCursor } from "./useChartCursor";

export interface CashflowChartProps {
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

const DEPOSIT_FILL = "var(--jade-a6)";
const DEPOSIT_STROKE = "var(--jade-a11)";
const WITHDRAWAL_FILL = "var(--gray-a6)";
const WITHDRAWAL_STROKE = "var(--gray-a11)";

function EmptyState() {
  return (
    <Flex direction="column" gap="2">
      <Heading size="5" as="h2">
        Monthly cashflow
      </Heading>
      <Text size="2" color="gray">
        No cashflow history yet.
      </Text>
    </Flex>
  );
}

/**
 * The grammar in words.
 *
 * A bar's height alone cannot tell a reader whether a quiet month is a real
 * stated zero or a month no statement covers -- both draw the same amount of
 * fill. The legend states the difference the same way the returns and
 * contributions charts do: in text, not only in a mark a colour-blind or
 * high-contrast reader might not see the same way.
 */
function Legend() {
  return (
    <Flex direction="column" gap="1" data-cashflow-legend="">
      <Text size="2" color="gray">
        Bar above the line: deposits that month, summed across investing accounts.
      </Text>
      <Text size="2" color="gray">
        Bar below the line: withdrawals that month, summed the same way.
      </Text>
      <Text size="2" color="gray">
        A thin line at zero, no bar: a month with a statement that states no deposits and no
        withdrawals, a real zero.
      </Text>
      <Text size="2" color="gray">
        Nothing drawn at all: no statement covers this month.
      </Text>
    </Flex>
  );
}

/** The domain points `buildSignedScales` needs: every deposit and every withdrawal, signed. */
function toDomainPoints(points: readonly CashflowPoint[]): ChartPoint[] {
  return [
    ...points.map((p) => ({ period: p.period, value: p.deposits })),
    ...points.map((p) => ({ period: p.period, value: -p.withdrawals })),
  ];
}

/** How wide one month's band is, so bars stay legible whether the range is six months or six years. */
function monthBandWidth(monthCount: number): number {
  if (monthCount <= 0) return 0;
  return (INNER_WIDTH / monthCount) * BAR_WIDTH_FRACTION;
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
 * One pair of bars per stated month: deposits growing up from zero,
 * withdrawals growing down. A month with no `CashflowPoint` at all -- one
 * `points` never contains -- draws neither rect, leaving the axis blank
 * rather than a zero-height bar. A month whose point states zero for both
 * still draws its two rects, at zero height; the stroke on a zero-height
 * rect is a thin line at the baseline, which is what makes a real stated
 * zero visibly different from the plain gap next to it.
 */
function Bars({
  points,
  scales,
  bandWidth,
}: {
  points: readonly CashflowPoint[];
  scales: ChartScales;
  bandWidth: number;
}) {
  const zeroY = scales.y(0);
  return (
    <>
      {points.map((point) => {
        const x = scales.x(periodToDate(point.period)) - bandWidth / 2;
        const depositY = scales.y(point.deposits);
        const withdrawalY = scales.y(-point.withdrawals);
        return (
          <g key={point.period}>
            <rect
              data-cashflow-bar="deposit"
              data-period={point.period}
              x={x}
              y={depositY}
              width={bandWidth}
              height={Math.max(0, zeroY - depositY)}
              fill={DEPOSIT_FILL}
              stroke={DEPOSIT_STROKE}
              strokeWidth={1}
            />
            <rect
              data-cashflow-bar="withdrawal"
              data-period={point.period}
              x={x}
              y={zeroY}
              width={bandWidth}
              height={Math.max(0, withdrawalY - zeroY)}
              fill={WITHDRAWAL_FILL}
              stroke={WITHDRAWAL_STROKE}
              strokeWidth={1}
            />
          </g>
        );
      })}
    </>
  );
}

/** What a screen reader gets before the cursor moves. */
function summary(points: readonly CashflowPoint[], monthCount: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return "No cashflow history yet.";
  const drawn = points.length;
  const verb = drawn === 1 ? "has" : "have";
  const blanks =
    drawn === monthCount
      ? ""
      : " The rest have no statement and are left blank rather than drawn as zero.";
  return (
    "Monthly deposits and withdrawals across investing accounts, from " +
    `${formatPeriodLabel(first.period)} to ${formatPeriodLabel(last.period)}. ` +
    `${drawn} of ${monthCount} months ${verb} a statement.${blanks}`
  );
}

/**
 * Monthly deposits and withdrawals, one bar chart across every `inTotals`
 * account.
 *
 * Deposits draw up from zero, withdrawals down, so a reader sees money in
 * and money out as opposite directions on one axis rather than as two
 * figures that have to be mentally subtracted. The rule this view exists to
 * hold: a month a statement states as zero and a month no statement covers
 * at all are never drawn the same way, even though both amount to "nothing
 * to see" on the bars alone -- see `buildCashflowSeries` and the legend.
 */
export function CashflowChart({ series }: CashflowChartProps) {
  const clipId = useSvgId("cashflow-clip");
  const reveal = useRevealMotion(INNER_WIDTH);
  const points = useMemo(() => buildCashflowSeries(series), [series]);
  const extent = useMemo(() => cashflowPeriodExtent(points), [points]);
  const scales = useMemo(
    () => buildSignedScales(toDomainPoints(points), INNER_WIDTH, INNER_HEIGHT),
    [points],
  );
  const slots = useMemo(() => cursorSlots(extent, scales), [extent, scales]);
  const cursor = useChartCursor(points, slots, CURSOR_GEOMETRY);
  const bandWidth = useMemo(() => monthBandWidth(slots.length), [slots.length]);

  if (scales === null || extent === null) {
    return <EmptyState />;
  }

  const lines = cursor.period === null ? [] : cashflowTooltipLines(cursor.period, cursor.point);
  const readout = lines.length === 0 ? "" : ` ${lines.join(". ")}.`;

  return (
    <Flex direction="column" gap="4">
      <Heading size="5" as="h2">
        Monthly cashflow
      </Heading>
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
          <title>Monthly deposits and withdrawals</title>
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
            {/* No dot on the crosshair: a month states two figures, deposits
                and withdrawals, and neither is the one value a single marker
                could sit at. The crosshair and the readout carry the month. */}
            <CursorMarks x={cursor.x} y={null} height={INNER_HEIGHT} />
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
