import { Callout, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { BenchmarkPoint } from "../../analytics/benchmark";
import { periodExtent } from "../../analytics/portfolioSeries";
import { formatCurrency, formatSignedCurrency } from "../format";
import {
  ChartTooltip,
  CursorAnnouncement,
  type TooltipContent,
  tooltipAnchorStyle,
  tooltipAnnouncement,
} from "./Tooltip";
import { type PlotPoint, areaPath, formatAxisCurrency, formatPeriodLabel, linePath } from "./plot";
import { useRevealMotion } from "./reveal";
import { type ChartPoint, type ChartScales, buildScales, periodToDate } from "./scales";
import { useSvgId } from "./svgId";
import { type ChartCursor, CursorMarks, cursorSlots, useChartCursor } from "./useChartCursor";

export interface BenchmarkChartProps {
  points: readonly BenchmarkPoint[];
  /** Periods the corpus has a statement for but the benchmark had no close to price -- stated, never silently dropped. */
  skipped: readonly string[];
  symbol: string;
}

const WIDTH = 800;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 68 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: MARGIN.left };
const PORTFOLIO_FILL = "var(--jade-a5)";
const BENCHMARK_STROKE = "var(--gray-a11)";
const BENCHMARK_DASH = "5 4";

function EmptyState() {
  return (
    <Flex direction="column" gap="2">
      <Heading size="5" as="h2">
        Against a single fund benchmark
      </Heading>
      <Text size="2" color="gray">
        No comparable history yet.
      </Text>
    </Flex>
  );
}

function toDomainPoints(points: readonly BenchmarkPoint[]): ChartPoint[] {
  return [
    ...points.map((p) => ({ period: p.period, value: p.portfolio })),
    ...points.map((p) => ({ period: p.period, value: p.benchmark })),
  ];
}

function toPlotPoints(
  points: readonly BenchmarkPoint[],
  scales: ChartScales,
  pick: (p: BenchmarkPoint) => number,
): PlotPoint[] {
  return points.map((p) => ({ x: scales.x(periodToDate(p.period)), y: scales.y(pick(p)) }));
}

/** Both values and their difference, for the tooltip and the accessible readout alike -- one call, both consumers. */
function benchmarkTooltipContent(
  period: string,
  point: BenchmarkPoint | null,
  symbol: string,
): TooltipContent {
  const header = formatPeriodLabel(period);
  if (point === null) {
    return { header, rows: [], footnotes: ["No comparable figure for this month"] };
  }
  const difference = point.portfolio - point.benchmark;
  return {
    header,
    rows: [
      { label: "Portfolio", value: formatCurrency(point.portfolio) },
      { label: `Same deposits in ${symbol}`, value: formatCurrency(point.benchmark) },
      {
        label: "Difference",
        value: formatSignedCurrency(difference),
        tone: difference >= 0 ? "gain" : "loss",
      },
    ],
    footnotes: [],
  };
}

/**
 * The visible headline, not only the aria-label: a reader scanning the page
 * sees the same two values and their difference that a screen reader hears.
 */
function BenchmarkSummary({
  points,
  symbol,
}: { points: readonly BenchmarkPoint[]; symbol: string }) {
  const last = points[points.length - 1];
  if (last === undefined) return null;
  const difference = last.portfolio - last.benchmark;
  return (
    <Text size="3" data-benchmark-summary="">
      Your portfolio: {formatCurrency(last.portfolio)}. The same deposits in {symbol}:{" "}
      {formatCurrency(last.benchmark)}. Difference:{" "}
      <Text color={difference >= 0 ? "jade" : "red"} data-benchmark-difference="">
        {formatSignedCurrency(difference)}
      </Text>
      .
    </Text>
  );
}

/** Names the two marks the chart draws, so a reader is not left to guess which line is which. */
function Legend() {
  return (
    <Flex gap="4" wrap="wrap" data-benchmark-legend="">
      <Flex align="center" gap="2">
        <svg width={20} height={12} aria-hidden="true">
          <rect width={20} height={12} fill={PORTFOLIO_FILL} />
        </svg>
        <Text size="2" color="gray">
          Portfolio value
        </Text>
      </Flex>
      <Flex align="center" gap="2">
        <svg width={20} height={12} aria-hidden="true">
          <line
            x1={0}
            y1={6}
            x2={20}
            y2={6}
            stroke={BENCHMARK_STROKE}
            strokeWidth={1.5}
            strokeDasharray={BENCHMARK_DASH}
          />
        </svg>
        <Text size="2" color="gray">
          Same deposits, invested in the benchmark instead
        </Text>
      </Flex>
    </Flex>
  );
}

/**
 * The caveats that apply to every figure this chart draws, stated once
 * above it. Buying at each month's own CLOSING price, rather than an
 * average price through the month, favours the portfolio somewhat in a
 * rising market, since a deposit lands at the best price already reached
 * that month rather than one paid partway through a climb. Deposits made in
 * USD cash are not yet counted as deposits here at all, a known limitation
 * of the underlying deposit series being tracked separately, not fixed by
 * this chart.
 */
function Provenance({ symbol, skipped }: { symbol: string; skipped: readonly string[] }) {
  return (
    <Callout.Root color="gray" variant="surface" data-benchmark-provenance="">
      <Callout.Text>
        Each month's net deposits buy {symbol} at that month's own closing price, using adjusted
        closes so {symbol}'s own distributions are treated as reinvested. Buying at the closing
        price rather than an average through the month favours the portfolio somewhat in a rising
        market. Deposits made in USD cash are not yet counted here, which also favours the
        portfolio, since that money never buys {symbol}; a known limitation, tracked separately.
        {skipped.length === 0
          ? ""
          : ` ${skipped.length === 1 ? "One month" : `${skipped.length} months`} had no ${symbol} close to price and ${skipped.length === 1 ? "is" : "are"} left out: ${skipped.join(", ")}.`}
      </Callout.Text>
    </Callout.Root>
  );
}

function accessibleSummary(points: readonly BenchmarkPoint[], symbol: string): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return "No comparable history yet.";
  const difference = last.portfolio - last.benchmark;
  return (
    `Portfolio value against the same deposits invested in ${symbol}, from ` +
    `${formatPeriodLabel(first.period)} to ${formatPeriodLabel(last.period)}. Portfolio ends at ` +
    `${formatCurrency(last.portfolio)}, ${symbol} equivalent ${formatCurrency(last.benchmark)}, a ` +
    `difference of ${formatSignedCurrency(difference)}.`
  );
}

interface BenchmarkSvgProps {
  points: readonly BenchmarkPoint[];
  scales: ChartScales;
  extent: readonly [string, string];
  cursor: ChartCursor<BenchmarkPoint>;
  content: TooltipContent | null;
  clipId: string;
  reveal: { initialWidth: number; duration: number };
  symbol: string;
}

/** The chart itself: axis, both lines, the cursor and its tooltip -- split out so the exported component stays short. */
function BenchmarkSvg({
  points,
  scales,
  extent,
  cursor,
  content,
  clipId,
  reveal,
  symbol,
}: BenchmarkSvgProps) {
  const portfolioPoints = toPlotPoints(points, scales, (p) => p.portfolio);
  const benchmarkPoints = toPlotPoints(points, scales, (p) => p.benchmark);
  const readout = content === null ? "" : ` ${tooltipAnnouncement(content)}`;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${accessibleSummary(points, symbol)}${readout}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
        tabIndex={0}
        onPointerMove={cursor.onPointerMove}
        onPointerLeave={cursor.onPointerLeave}
        onKeyDown={cursor.onKeyDown}
        onBlur={cursor.onBlur}
        style={{ width: "100%", height: "auto" }}
      >
        <title>{`Portfolio against ${symbol}`}</title>
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
            <path d={areaPath(portfolioPoints, INNER_HEIGHT)} fill={PORTFOLIO_FILL} stroke="none" />
            <path
              d={linePath(benchmarkPoints)}
              fill="none"
              stroke={BENCHMARK_STROKE}
              strokeWidth={1.5}
              strokeDasharray={BENCHMARK_DASH}
            />
          </g>
          <CursorMarks
            x={cursor.x}
            y={cursor.point === null ? null : scales.y(cursor.point.portfolio)}
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
      <CursorAnnouncement content={content} />
      {content === null ? null : (
        <div style={{ ...tooltipAnchorStyle(MARGIN.left + (cursor.x ?? 0), WIDTH), top: 0 }}>
          <ChartTooltip content={content} />
        </div>
      )}
    </div>
  );
}

/**
 * The portfolio's own chained, deposit-netted history against the same
 * deposits invested in one fund, `symbol`. Both lines are market value over
 * time -- the portfolio's stated series, and `simulateBenchmark`'s replay of
 * the identical deposit stream buying the benchmark at its own monthly
 * close -- so the gap between them is a single fund's worth of the same
 * money, not a different quantity dressed up to look comparable.
 */
export function BenchmarkChart({ points, skipped, symbol }: BenchmarkChartProps) {
  const clipId = useSvgId("benchmark-clip");
  const reveal = useRevealMotion(INNER_WIDTH);
  const scales = useMemo(
    () => buildScales(toDomainPoints(points), INNER_WIDTH, INNER_HEIGHT),
    [points],
  );
  const extent = useMemo(() => periodExtent(points), [points]);
  const slots = useMemo(() => cursorSlots(extent, scales), [extent, scales]);
  const cursor = useChartCursor(points, slots, CURSOR_GEOMETRY);

  if (scales === null || extent === null) {
    return <EmptyState />;
  }

  const content =
    cursor.period === null ? null : benchmarkTooltipContent(cursor.period, cursor.point, symbol);

  return (
    <Card className="ivt-chart-card">
      <Flex direction="column" gap="4">
        <Heading size="5" as="h2">
          Against a single fund benchmark
        </Heading>
        <BenchmarkSummary points={points} symbol={symbol} />
        <Legend />
        <Provenance symbol={symbol} skipped={skipped} />
        <BenchmarkSvg
          points={points}
          scales={scales}
          extent={extent}
          cursor={cursor}
          content={content}
          clipId={clipId}
          reveal={reveal}
          symbol={symbol}
        />
      </Flex>
    </Card>
  );
}
