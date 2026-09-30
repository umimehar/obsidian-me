import { Flex, Heading, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import type { DestinationBucket } from "../../analytics/flows/graph";
import { formatCurrency } from "../format";
import { ChartTooltip, CursorAnnouncement, readoutSuffix, tooltipAnchorStyle } from "./Tooltip";
import { formatAxisCurrency, formatPeriodLabel } from "./plot";
import { buildValueAxis } from "./scales";
import { CursorMarks, type CursorSlot, useChartCursor } from "./useChartCursor";
import { useMeasuredWidth } from "./useMeasuredWidth";

export interface DestinationChartProps {
  buckets: readonly DestinationBucket[];
}

/** The width used before the container has been measured, and the floor a measurement never falls below. */
const FALLBACK_WIDTH = 400;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 68 };
const BAND_FRACTION = 0.7;

/**
 * Radix step 9, cycling if a group by ever draws more than eight series.
 * Jade and red are kept out: jade already means a flow on this tab's own
 * Sankey, and red means a loss everywhere else in the app. The gray scales
 * (gray, mauve, slate, sage, olive, sand) are kept out too: this tab's own
 * Sankey draws recycled money -- sale proceeds and portfolio income, fed
 * back in rather than paid in from outside -- in gray, so a gray series
 * here would read as the same thing.
 *
 * Chosen by exhaustively searching every 8-colour subset of the Radix step 9
 * scales that clears 3:1 contrast against both this project's light
 * (`#ffffff`) and dark (`--slate-1`, `#111113`) chart backgrounds, for the
 * one with the largest worst-case (smallest pairwise) CIEDE2000 distance --
 * `paletteDistance.test.ts` pins both the distance and the contrast
 * computed from the same hex values `hex` names here, not from these CSS
 * custom properties, since happy-dom resolves no stylesheet. Radix's step 9
 * hex is identical in light and dark for every scale below, so one set of
 * figures covers both themes.
 *
 * 16.8 is the best any 8-colour subset of the light/dark-feasible 17
 * scales can reach under that contrast floor -- proven by the same
 * exhaustive search, not assumed -- short of the 20 a first pass asked for.
 * Loosening either constraint was the alternative: a ninth colour, a looser
 * contrast floor, or a lower distance floor. All three were rejected: eight
 * series is what `groupBy` can draw, 3:1 is the WCAG floor this chart's own
 * fills already have to clear, and a distance floor lower than what the
 * palette can equal is not a floor.
 */
export const PALETTE_HEX = [
  { token: "var(--blue-9)", hex: "#0090ff" },
  { token: "var(--crimson-9)", hex: "#e93d82" },
  { token: "var(--grass-9)", hex: "#46a758" },
  { token: "var(--indigo-9)", hex: "#3e63dd" },
  { token: "var(--teal-9)", hex: "#12a594" },
  { token: "var(--brown-9)", hex: "#ad7f58" },
  { token: "var(--plum-9)", hex: "#ab4aba" },
  { token: "var(--tomato-9)", hex: "#e54d2e" },
] as const;

/** `PALETTE_HEX`'s CSS custom properties alone, what the chart actually paints. */
const PALETTE = PALETTE_HEX.map((c) => c.token);

interface Band {
  bucket: string;
  x: number;
  width: number;
  center: number;
}

function placeBuckets(buckets: readonly DestinationBucket[], innerWidth: number): Band[] {
  const width = buckets.length === 0 ? 0 : innerWidth / buckets.length;
  return buckets.map((b, index) => ({
    bucket: b.bucket,
    x: index * width + (width * (1 - BAND_FRACTION)) / 2,
    width: width * BAND_FRACTION,
    center: index * width + width / 2,
  }));
}

/** Every label across every bucket, ordered by its total across the whole period, largest first. */
function labelOrder(buckets: readonly DestinationBucket[]): string[] {
  const totals = new Map<string, number>();
  for (const b of buckets) {
    for (const [label, value] of Object.entries(b.values)) {
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
}

function bucketMax(buckets: readonly DestinationBucket[]): number {
  let max = 0;
  for (const b of buckets) {
    const total = Object.values(b.values).reduce((s, v) => s + v, 0);
    if (total > max) max = total;
  }
  return max;
}

/** Whether a bucket is a month (`YYYY-MM`) or a bare year, for the header and axis labels. */
function bucketLabel(bucket: string): string {
  return /^\d{4}-\d{2}$/.test(bucket) ? formatPeriodLabel(bucket) : bucket;
}

function Gridlines({
  yTicks,
  y,
  innerWidth,
}: { yTicks: number[]; y: (v: number) => number; innerWidth: number }) {
  return (
    <>
      {yTicks.map((tick) => (
        <g key={tick} transform={`translate(0,${y(tick)})`}>
          <line x1={0} x2={innerWidth} stroke="var(--gray-a4)" />
          <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--gray-a11)">
            {formatAxisCurrency(tick)}
          </text>
        </g>
      ))}
    </>
  );
}

interface StackedBarsProps {
  buckets: readonly DestinationBucket[];
  bands: readonly Band[];
  labels: readonly string[];
  y: (v: number) => number;
}

/** One stacked bar per bucket, one rect per label present in it, in the shared label order. */
function StackedBars({ buckets, bands, labels, y }: StackedBarsProps) {
  return (
    <>
      {buckets.map((bucket, index) => {
        const band = bands[index];
        if (band === undefined) return null;
        let cumulative = 0;
        return (
          <g key={bucket.bucket}>
            {labels.map((label, colorIndex) => {
              const value = bucket.values[label];
              if (value === undefined || value === 0) return null;
              const bottom = y(cumulative);
              cumulative += value;
              const top = y(cumulative);
              return (
                <rect
                  key={label}
                  data-destination-bar={bucket.bucket}
                  data-destination-series={label}
                  x={band.x}
                  y={top}
                  width={band.width}
                  height={Math.max(0, bottom - top)}
                  fill={PALETTE[colorIndex % PALETTE.length]}
                />
              );
            })}
          </g>
        );
      })}
    </>
  );
}

/**
 * An estimate of the axis font's average character width at 11px, calibrated
 * the same way `sankeyLayout.ts`'s `CHAR_WIDTH_FACTOR` was: a small margin
 * above the system sans-serif's real rendered width, never a guess.
 */
const AXIS_CHAR_WIDTH = 6.3;
const AXIS_LABEL_PADDING = 8;

/**
 * Skips bucket labels evenly rather than crowding one under every bar. A
 * year of monthly buckets in the tab's own narrow width ran twelve
 * three-character-plus-year labels edge to edge with no gap, and adjoining
 * ones merged into unreadable text.
 */
function labelStride(bands: readonly Band[]): number {
  if (bands.length < 2) return 1;
  const spacing = (bands[1]?.center ?? 0) - (bands[0]?.center ?? 0);
  if (spacing <= 0) return 1;
  const widest = Math.max(...bands.map((b) => bucketLabel(b.bucket).length)) * AXIS_CHAR_WIDTH;
  return Math.max(1, Math.ceil((widest + AXIS_LABEL_PADDING) / spacing));
}

/**
 * Which band indices get an axis label: every `stride`-th one, always
 * keeping the first and last bucket -- the two a reader most needs to
 * orient the chart by. The last stride pick is DROPPED rather than kept
 * alongside a forced-in final label when the two would sit closer than a
 * full stride apart: always unioning the final index in, on top of
 * whatever the stride already lands on, could place its own label right
 * next to the one before it -- the same crowding this whole function
 * exists to prevent, just moved to the last pair instead of every pair.
 */
function shownLabelIndices(bandCount: number, stride: number): ReadonlySet<number> {
  const shown = new Set<number>();
  for (let index = 0; index < bandCount; index += stride) shown.add(index);
  const lastIndex = bandCount - 1;
  if (lastIndex < 0) return shown;
  const previous = [...shown].filter((index) => index !== lastIndex).at(-1);
  if (previous !== undefined && lastIndex - previous < stride) shown.delete(previous);
  shown.add(lastIndex);
  return shown;
}

function XAxis({ bands, innerHeight }: { bands: readonly Band[]; innerHeight: number }) {
  const stride = labelStride(bands);
  const shown = shownLabelIndices(bands.length, stride);
  return (
    <>
      {bands.map((band, index) => {
        if (!shown.has(index)) return null;
        return (
          <text
            key={band.bucket}
            x={band.center}
            y={innerHeight + 20}
            textAnchor="middle"
            fontSize={11}
            fill="var(--gray-a11)"
          >
            {bucketLabel(band.bucket)}
          </text>
        );
      })}
    </>
  );
}

/**
 * One swatch and its name per series, in the same order and colour the bars
 * use -- text, not colour alone, so the chart still says which series is
 * which for a colour-blind reader or in forced-colours mode.
 */
function Legend({ labels }: { labels: readonly string[] }) {
  return (
    <Flex gap="3" wrap="wrap" data-destination-legend="">
      {labels.map((label, index) => (
        <Flex key={label} align="center" gap="1">
          <svg width={10} height={10} aria-hidden="true" style={{ flex: "none" }}>
            <rect width={10} height={10} fill={PALETTE[index % PALETTE.length]} rx={2} />
          </svg>
          <Text size="1" color="gray">
            {label}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}

function tooltipLines(bucket: DestinationBucket | null, labels: readonly string[]): string[] {
  if (bucket === null) return [];
  const rows = labels
    .filter((label) => bucket.values[label] !== undefined)
    .map((label) => `${label} ${formatCurrency(bucket.values[label] ?? 0)}`);
  return [bucketLabel(bucket.bucket), ...rows];
}

function chartSummary(buckets: readonly DestinationBucket[]): string {
  if (buckets.length === 0) return "No money arrived in any account this period.";
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  if (first === undefined || last === undefined) return "";
  return (
    `Money arriving in accounts by group, ${buckets.length} periods from ` +
    `${bucketLabel(first.bucket)} to ${bucketLabel(last.bucket)}.`
  );
}

/**
 * Stacked bars of money arriving in accounts (the Sankey's column 1-to-2
 * links), one bucket per month or, past two years, per year, stacked by the
 * current group by. Built the same way `CashflowChart` is: `useChartCursor`
 * for hover and keyboard, `ChartTooltip`/`CursorAnnouncement` for the
 * readout, so `bun run contrast` hovers it exactly like every other chart.
 * Laid out at the container's own measured width, the same fix the Sankey
 * needed: a viewBox wider than the rendered box scales every font down with
 * it, and a fixed 800 painted this chart's 11px axis labels well under 11px
 * on a 390px phone.
 */
export function DestinationChart({ buckets }: DestinationChartProps) {
  const { ref: containerRef, width } = useMeasuredWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const cursorGeometry = useMemo(() => ({ viewBoxWidth: width, marginLeft: MARGIN.left }), [width]);
  const bands = useMemo(() => placeBuckets(buckets, innerWidth), [buckets, innerWidth]);
  const labels = useMemo(() => labelOrder(buckets), [buckets]);
  const max = useMemo(() => bucketMax(buckets), [buckets]);
  const axis = useMemo(() => buildValueAxis(Math.max(max, 1), innerHeight), [max, innerHeight]);
  const points = useMemo(() => buckets.map((b) => ({ period: b.bucket })), [buckets]);
  const slots = useMemo<CursorSlot[]>(
    () => bands.map((b) => ({ period: b.bucket, x: b.center })),
    [bands],
  );
  const cursor = useChartCursor(points, slots, cursorGeometry);

  if (buckets.length === 0) {
    return (
      <Flex direction="column" gap="2">
        <Heading size="5" as="h2">
          Money arriving by destination
        </Heading>
        <Text size="2" color="gray">
          No money arrived in any account this period.
        </Text>
      </Flex>
    );
  }

  const activeBucket = buckets.find((b) => b.bucket === cursor.period) ?? null;
  const lines = tooltipLines(activeBucket, labels);
  const readout = readoutSuffix(lines);

  return (
    <Flex direction="column" gap="4">
      <Heading size="5" as="h2">
        Money arriving by destination
      </Heading>
      <Legend labels={labels} />
      <div ref={containerRef} style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={`${chartSummary(buckets)}${readout}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
          tabIndex={0}
          onPointerMove={cursor.onPointerMove}
          onPointerLeave={cursor.onPointerLeave}
          onKeyDown={cursor.onKeyDown}
          onBlur={cursor.onBlur}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <title>Money arriving in accounts, by destination</title>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            <Gridlines yTicks={axis.yTicks} y={axis.y} innerWidth={innerWidth} />
            <StackedBars buckets={buckets} bands={bands} labels={labels} y={axis.y} />
            <XAxis bands={bands} innerHeight={innerHeight} />
            <CursorMarks x={cursor.x} y={null} height={innerHeight} />
          </g>
        </svg>
        <CursorAnnouncement lines={lines} />
        {lines.length === 0 ? null : (
          <div style={{ ...tooltipAnchorStyle(MARGIN.left + (cursor.x ?? 0), width), top: 0 }}>
            <ChartTooltip lines={lines} />
          </div>
        )}
      </div>
    </Flex>
  );
}
