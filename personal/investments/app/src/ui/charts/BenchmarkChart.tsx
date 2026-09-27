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
import { CursorMarks, cursorSlots, useChartCursor } from "./useChartCursor";

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

/** The caveats that apply to every figure this chart draws, stated once above it. */
function Provenance({ symbol, skipped }: { symbol: string; skipped: readonly string[] }) {
  return (
    <Callout.Root color="gray" variant="surface" data-benchmark-provenance="">
      <Callout.Text>
        Each month's net deposits buy {symbol} at that month's own close, using adjusted closes so
        {symbol}'s own distributions are treated as reinvested. This corpus starts in 2023-06, after{" "}
        {symbol} began trading, so every month is comparable.
        {skipped.length === 0
          ? ""
          : ` ${skipped.length === 1 ? "One month" : `${skipped.length} months`} had no ${symbol} close to price and ${skipped.length === 1 ? "is" : "are"} left out: ${skipped.join(", ")}.`}
      </Callout.Text>
    </Callout.Root>
  );
}

function summary(points: readonly BenchmarkPoint[], symbol: string): string {
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

  const portfolioPoints = toPlotPoints(points, scales, (p) => p.portfolio);
  const benchmarkPoints = toPlotPoints(points, scales, (p) => p.benchmark);
  const content =
    cursor.period === null ? null : benchmarkTooltipContent(cursor.period, cursor.point, symbol);
  const readout = content === null ? "" : ` ${tooltipAnnouncement(content)}`;

  return (
    <Card className="ivt-chart-card">
      <Flex direction="column" gap="4">
        <Heading size="5" as="h2">
          Against a single fund benchmark
        </Heading>
        <Provenance symbol={symbol} skipped={skipped} />
        <div style={{ position: "relative" }}>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`${summary(points, symbol)}${readout}`}
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
                <path
                  d={areaPath(portfolioPoints, INNER_HEIGHT)}
                  fill="var(--jade-a5)"
                  stroke="none"
                />
                <path
                  d={linePath(benchmarkPoints)}
                  fill="none"
                  stroke="var(--gray-a11)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
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
      </Flex>
    </Card>
  );
}
