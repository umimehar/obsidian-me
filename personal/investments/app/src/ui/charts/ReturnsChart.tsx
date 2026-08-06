import { Badge, Callout, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { ReturnSeries } from "../../analytics/returns";
import type { AccountSeries } from "../../analytics/types";
import { formatRate } from "../format";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle } from "./Tooltip";
import { type PlotPoint, formatAxisRate, formatPeriodLabel, linePath } from "./plot";
import {
  type AccountReturns,
  type PlottedReturnPoint,
  accountRateExtent,
  buildReturnsSeries,
  distinctGaps,
  gapPhrase,
  latestStatedLines,
  plottedCount,
  provenance,
  returnSegments,
  returnsPeriodExtent,
  returnsRateExtent,
  returnsTooltipLines,
} from "./returnsSeries";
import { useRevealMotion } from "./reveal";
import { type ChartScales, buildSignedScales, periodToDate } from "./scales";
import { DERIVED_DASH, SOURCE_BADGE, SOURCE_CLAUSE } from "./source";
import { useSvgId } from "./svgId";
import { CursorMarks, cursorSlots, useChartCursor } from "./useChartCursor";

export interface ReturnsChartProps {
  returns: readonly ReturnSeries[];
  series: readonly AccountSeries[];
}

const WIDTH = 720;
const HEIGHT = 200;
const MARGIN = { top: 12, right: 12, bottom: 24, left: 46 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
/** Hoisted so the cursor's pointer handler keeps one identity across renders. */
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: MARGIN.left };
const DOT_RADIUS = 2;
const SOURCE_STROKE: Readonly<Record<"stated" | "derived", string>> = {
  stated: "var(--jade-a11)",
  derived: "var(--gray-a11)",
};

/**
 * What the reader must know before reading a single line: most of these rates
 * are this project's arithmetic, not Wealthsimple's. Every figure in it is
 * counted from the built series, so it cannot drift from the cards below it.
 */
function ProvenanceNote({ accounts }: { accounts: readonly AccountReturns[] }) {
  const counts = provenance(accounts);
  return (
    <Callout.Root color="gray" variant="surface" data-returns-provenance="">
      <Callout.Text>
        {counts.stated} of {counts.total} accounts have return rates stated on their statements. The
        other {counts.derived} are computed here from market values and cash flows, and are
        approximations, not Wealthsimple's own figures.
      </Callout.Text>
    </Callout.Root>
  );
}

/** A line the same weight and dash the chart draws, so the words below it name something visible. */
function LegendSwatch({ dash }: { dash: string | undefined }) {
  return (
    <svg width={28} height={8} aria-hidden="true" style={{ flex: "none" }}>
      <line
        x1={0}
        x2={28}
        y1={4}
        y2={4}
        stroke="var(--gray-a11)"
        strokeWidth={1.75}
        strokeDasharray={dash}
      />
    </svg>
  );
}

/**
 * The grammar in words.
 *
 * The words are the point. A legend that distinguishes two lines only by
 * colour says nothing to a colour-blind reader or in a high-contrast mode,
 * and the difference here is not decorative: it is whether a figure was
 * printed on a statement or worked out from one.
 */
function Legend() {
  return (
    <Flex direction="column" gap="1" data-returns-legend="">
      <Flex align="center" gap="2">
        <LegendSwatch dash={undefined} />
        <Text size="2" color="gray">
          Solid line: a rate stated on the statement.
        </Text>
      </Flex>
      <Flex align="center" gap="2">
        <LegendSwatch dash={DERIVED_DASH} />
        <Text size="2" color="gray">
          Dashed line: a rate derived here, computed rather than printed.
        </Text>
      </Flex>
      <Text size="2" color="gray">
        A break in a line: no rate for that month. Nothing is drawn at zero and nothing is joined
        across the hole.
      </Text>
    </Flex>
  );
}

/** What one card says about itself, and the only text a screen reader gets for its chart. */
function accountSummary(account: AccountReturns): string {
  const first = account.points[0];
  const last = account.points[account.points.length - 1];
  const plotted = plottedCount(account.points);
  const range =
    first === undefined || last === undefined
      ? ""
      : `, from ${formatPeriodLabel(first.period)} to ${formatPeriodLabel(last.period)}`;
  const blanks =
    plotted === account.points.length ? "" : " The rest are left blank rather than drawn as zero.";
  return (
    `${account.label} monthly return rates, ${SOURCE_CLAUSE[account.source]}${range}. ` +
    `${plotted} of ${account.points.length} months have a figure.${blanks}`
  );
}

/**
 * The audited figures, in the open rather than behind a hover.
 *
 * Only a stated account has any, and there are two of them in fourteen. See
 * `latestStatedLines` for why these two horizons and not the other four.
 */
function StatedHeadline({ account }: { account: AccountReturns }) {
  const lines = latestStatedLines(account);
  if (lines.length === 0) return null;
  return (
    <Text size="2" color="gray" as="p" mb="2" data-stated-headline="">
      {`${lines[0]}: ${lines.slice(1).join(", ")}.`}
    </Text>
  );
}

/**
 * How small a share of the shared axis a card's own rates may span before its
 * line reads as a rendering failure rather than as a quiet account.
 *
 * Two percent of a 68 point axis is about 3px of the 164px plot box. The
 * managed RRSP spans 0.24 points across its six months, which is well inside
 * that, and it is one of the two accounts whose rates a statement actually
 * printed. The shared axis stays: rescaling that card to its own range would
 * blow a 0.17% month up to full height, which says something far worse.
 */
const FLAT_SPAN_FRACTION = 0.02;

/** Says in words what a near-flat line cannot show, so the flatness reads as a fact about the account. */
function FlatRangeNote({
  account,
  domain,
}: {
  account: AccountReturns;
  domain: readonly [number, number];
}) {
  const extent = accountRateExtent(account.points);
  if (extent === null) return null;
  const domainSpan = domain[1] - domain[0];
  if (domainSpan <= 0 || extent[1] - extent[0] > domainSpan * FLAT_SPAN_FRACTION) return null;
  const range =
    extent[0] === extent[1]
      ? `is ${formatRate(extent[0])}`
      : `falls between ${formatRate(extent[0])} and ${formatRate(extent[1])}`;
  return (
    <Text size="2" color="gray" as="p" mt="2" data-flat-range="">
      {`Every month with a figure ${range}, so the line is flat on the shared axis.`}
    </Text>
  );
}

/** An account no month can be computed for. It states the reasons rather than drawing an empty band. */
function NoFigureNote({ account }: { account: AccountReturns }) {
  const reasons = distinctGaps(account.points).map(gapPhrase);
  return (
    <Text size="2" color="gray" as="p">
      No month has a return figure.
      {reasons.length === 0 ? "" : ` Reason: ${reasons.join("; ")}.`}
    </Text>
  );
}

/** `PlottedReturnPoint` carries a non-null `rate` in the type, so there is no null here to coerce. */
function toPlotPoints(segment: readonly PlottedReturnPoint[], scales: ChartScales): PlotPoint[] {
  return segment.map((point) => ({
    x: scales.x(periodToDate(point.period)),
    y: scales.y(point.rate),
  }));
}

/** The y ticks, with the zero line drawn heavier because it is the one that carries the sign. */
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
            {formatAxisRate(tick)}
          </text>
        </g>
      ))}
    </>
  );
}

/** Every run of consecutive months with a figure, plus a dot on each month that has one. */
function ReturnLines({
  account,
  scales,
}: {
  account: AccountReturns;
  scales: ChartScales;
}) {
  const stroke = SOURCE_STROKE[account.source];
  const dash = account.source === "derived" ? DERIVED_DASH : undefined;
  return (
    <>
      {returnSegments(account.points).map((segment) => {
        const plotted = toPlotPoints(segment, scales);
        return (
          <g key={segment[0]?.period ?? ""}>
            {plotted.length > 1 ? (
              <path
                data-returns-line=""
                data-source={account.source}
                d={linePath(plotted)}
                fill="none"
                stroke={stroke}
                strokeWidth={1.75}
                strokeDasharray={dash}
              />
            ) : null}
            {plotted.map((point) => (
              <circle
                key={point.x}
                data-returns-dot=""
                cx={point.x}
                cy={point.y}
                r={DOT_RADIUS}
                fill={stroke}
              />
            ))}
          </g>
        );
      })}
    </>
  );
}

/**
 * One account's monthly return rates.
 *
 * The scales are handed in rather than built here, so every card shares one
 * pair: the same months across the page, and the same rate axis. A per card y
 * domain would draw a 0.37% month and a 47.31% month at the same height, and
 * these cards exist to be compared.
 */
function AccountReturnsCard({
  account,
  scales,
  xDomain,
  rateDomain,
}: {
  account: AccountReturns;
  scales: ChartScales | null;
  xDomain: readonly [string, string] | null;
  /** The shared rate axis, so a card can tell whether its own line is flat against it. */
  rateDomain: readonly [number, number] | null;
}) {
  const clipId = useSvgId("returns-clip");
  const reveal = useRevealMotion(INNER_WIDTH);
  const slots = useMemo(() => cursorSlots(xDomain, scales), [xDomain, scales]);
  const cursor = useChartCursor(account.points, slots, CURSOR_GEOMETRY);

  const drawable = scales !== null && plottedCount(account.points) > 0;
  const lines =
    cursor.period === null ? [] : returnsTooltipLines(cursor.period, cursor.point, account.source);
  const readout = lines.length === 0 ? "" : ` ${lines.join(". ")}.`;
  const cursorRate = cursor.point?.rate ?? null;

  return (
    <div data-returns-card={account.shortId}>
      <Card>
        <Flex justify="between" align="center" gap="2" mb="2" wrap="wrap">
          <Heading size="3" as="h3">
            {account.label}
          </Heading>
          <Flex align="center" gap="2">
            {account.inTotals ? null : (
              <Badge color="gray" variant="soft">
                Excluded from totals
              </Badge>
            )}
            <Badge
              color={account.source === "stated" ? "jade" : "gray"}
              variant="soft"
              data-returns-source=""
            >
              {SOURCE_BADGE[account.source]}
            </Badge>
          </Flex>
        </Flex>
        <StatedHeadline account={account} />
        {!drawable || scales === null ? (
          <NoFigureNote account={account} />
        ) : (
          <div style={{ position: "relative" }}>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="img"
              aria-label={`${accountSummary(account)}${readout}`}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
              tabIndex={0}
              onPointerMove={cursor.onPointerMove}
              onPointerLeave={cursor.onPointerLeave}
              onKeyDown={cursor.onKeyDown}
              onBlur={cursor.onBlur}
              style={{ width: "100%", height: "auto", display: "block" }}
            >
              <title>{`${account.label} monthly return rates`}</title>
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
                  <ReturnLines account={account} scales={scales} />
                </g>
                {/* No marker on a month with no rate: the crosshair alone, and
                    the readout saying in words that there is nothing here. */}
                <CursorMarks
                  x={cursor.x}
                  y={cursorRate === null ? null : scales.y(cursorRate)}
                  height={INNER_HEIGHT}
                />
              </g>
            </svg>
            <CursorAnnouncement lines={lines} />
            {lines.length === 0 ? null : (
              <div style={{ ...tooltipAnchorStyle(MARGIN.left + (cursor.x ?? 0), WIDTH), top: 0 }}>
                <ChartTooltip lines={lines} />
              </div>
            )}
          </div>
        )}
        {rateDomain === null ? null : <FlatRangeNote account={account} domain={rateDomain} />}
      </Card>
    </div>
  );
}

/**
 * Monthly return rates, one card per account, stated accounts first.
 *
 * The rule this view exists to hold: a rate that was printed on a statement
 * and a rate this project worked out are never drawn the same way, and a
 * month with no rate is drawn as nothing at all. An earlier version of the
 * pipeline published a 186% month, produced by subtracting only the flows the
 * cash block could see; the book-cost cross-check that caught it returns null
 * with a reason instead of a number, and rendering those nulls as zero here
 * would put the artifact straight back on the page.
 */
export function ReturnsChart({ returns, series }: ReturnsChartProps) {
  const accounts = useMemo(() => buildReturnsSeries(returns, series), [returns, series]);
  const xDomain = useMemo(() => returnsPeriodExtent(accounts), [accounts]);
  const rateExtent = useMemo(() => returnsRateExtent(accounts), [accounts]);
  const scales = useMemo(
    () =>
      xDomain === null || rateExtent === null
        ? null
        : buildSignedScales(
            [
              { period: xDomain[0], value: rateExtent[0] },
              { period: xDomain[1], value: rateExtent[1] },
            ],
            INNER_WIDTH,
            INNER_HEIGHT,
          ),
    [xDomain, rateExtent],
  );

  if (accounts.length === 0) {
    return (
      <Flex direction="column" gap="2">
        <Heading size="5" as="h2">
          Returns over time
        </Heading>
        <Text size="2" color="gray">
          No return history yet.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <Heading size="5" as="h2">
        Returns over time
      </Heading>
      <ProvenanceNote accounts={accounts} />
      <Legend />
      {accounts.map((account) => (
        <AccountReturnsCard
          key={account.maskedId}
          account={account}
          scales={scales}
          xDomain={xDomain}
          rateDomain={rateExtent}
        />
      ))}
    </Flex>
  );
}
