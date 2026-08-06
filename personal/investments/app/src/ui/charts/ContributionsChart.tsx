import { Badge, Callout, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { motion } from "motion/react";
import { type ReactNode, useMemo } from "react";
import type { AnalyticsOutput } from "../../analytics/build";
import { formatCurrency } from "../format";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle } from "./Tooltip";
import {
  type ContributionYear,
  type PlacedYear,
  type WrapperContributions,
  buildContributionsSeries,
  contributionsMax,
  contributionsTooltipLines,
  drawnYearCount,
  placeYears,
  yearCursorPoints,
} from "./contributionsSeries";
import { formatAxisCurrency } from "./plot";
import { useRevealMotion } from "./reveal";
import { type ValueAxis, buildValueAxis } from "./scales";
import { SOURCE_BADGE } from "./source";
import { useSvgId } from "./svgId";
import { CursorMarks, type CursorSlot, useChartCursor } from "./useChartCursor";

export interface ContributionsChartProps {
  analytics: AnalyticsOutput;
}

const WIDTH = 720;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 16, bottom: 48, left: 64 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
/** Hoisted so the cursor's pointer handler keeps one identity across renders. */
const CURSOR_GEOMETRY = { viewBoxWidth: WIDTH, marginLeft: MARGIN.left };

/**
 * The dash a generic annual maximum carries, distinct from the solid stroke
 * of an assessed limit. Deliberately not the `DERIVED_DASH` of the returns
 * chart: there, a dash means a figure was derived; here it means a ceiling
 * is generic. Two meanings on one dash across two charts would be worse than
 * two dashes, and the derived/stated distinction on this chart is carried by
 * the bar's fill instead.
 */
export const GENERIC_LIMIT_DASH = "2 3";

const STATED_FILL = "var(--jade-a6)";
const STATED_STROKE = "var(--jade-a11)";
const DERIVED_STROKE = "var(--gray-a11)";

/** The hatch a derived bar is filled with. Diagonal, coarse enough to read at a bar's width. */
function HatchPattern({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={7}
      height={7}
      patternTransform="rotate(45)"
    >
      <rect width={7} height={7} fill="var(--gray-a3)" />
      <line x1={0} y1={0} x2={0} y2={7} stroke={DERIVED_STROKE} strokeWidth={2.5} />
    </pattern>
  );
}

/** A bar swatch the same fill the chart draws, so the words below it name something visible. */
function BarSwatch({ hatched }: { hatched: boolean }) {
  const hatchId = useSvgId("contributions-legend-hatch");
  return (
    <svg width={28} height={12} aria-hidden="true" style={{ flex: "none" }}>
      <title>{hatched ? "A hatched bar" : "A solid bar"}</title>
      {hatched ? <HatchPattern id={hatchId} /> : null}
      <rect
        x={0}
        y={0}
        width={28}
        height={12}
        fill={hatched ? `url(#${hatchId})` : STATED_FILL}
        stroke={hatched ? DERIVED_STROKE : STATED_STROKE}
      />
    </svg>
  );
}

function LineSwatch({ kind, dash }: { kind: "generic" | "assessed"; dash: string | undefined }) {
  return (
    <svg width={28} height={8} aria-hidden="true" style={{ flex: "none" }}>
      <title>A limit line</title>
      <line
        data-legend-swatch={kind}
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

function LegendRow({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <Flex align="center" gap="2">
      {swatch}
      <Text size="2" color="gray">
        {children}
      </Text>
    </Flex>
  );
}

/**
 * The grammar in words.
 *
 * The words are the point. A legend that separates two marks only by colour
 * says nothing to a colour-blind reader or in a high-contrast mode, and the
 * differences here are not decorative: whether a figure was printed on a
 * statement or reconstructed from activity rows, and whether a ceiling is
 * this person's real room or a generic published number that ignores
 * carry-forward.
 */
function Legend() {
  return (
    <Flex direction="column" gap="1" data-contributions-legend="">
      <LegendRow swatch={<BarSwatch hatched={false} />}>
        Solid bar: contributed as stated on the statements.
      </LegendRow>
      <LegendRow swatch={<BarSwatch hatched={true} />}>
        Hatched bar: contributed derived here, reconstructed from activity rows rather than printed.
      </LegendRow>
      <LegendRow swatch={<LineSwatch kind="generic" dash={GENERIC_LIMIT_DASH} />}>
        Dashed line: the generic CRA annual maximum. Carry-forward is not visible in statement data,
        so a bar reaching or passing this line is not an over-contribution.
      </LegendRow>
      <LegendRow swatch={<LineSwatch kind="assessed" dash={undefined} />}>
        Solid line: a limit from your notice of assessment, which already includes carry-forward, so
        the gap to it is a real figure.
      </LegendRow>
      <Text size="2" color="gray">
        No bar at all: no statement for that year. Nothing is drawn at zero.
      </Text>
    </Flex>
  );
}

/**
 * Which wrappers print their contributions and which have them reconstructed.
 * Counted from the built series, so it cannot drift from the cards below it.
 *
 * Counted over the wrappers that draw something, not over every wrapper on
 * the page. A wrapper the corpus has no statement for states nothing, and
 * folding it into the stated count would have this note claim it prints
 * figures it does not have.
 */
function ProvenanceNote({ wrappers }: { wrappers: readonly WrapperContributions[] }) {
  const drawable = wrappers.filter((wrapper) => drawnYearCount(wrapper) > 0);
  const derived = drawable.filter((wrapper) => isDerived(wrapper));
  const stated = drawable.length - derived.length;

  return (
    <Callout.Root color="gray" variant="surface" data-contributions-provenance="">
      <Callout.Text>
        {stated} of {drawable.length} wrappers state their contribution figures on the statements,
        as a year-to-date total this reads month over month as a delta.
        {derived.length === 0
          ? ""
          : ` ${derived.map((wrapper) => wrapper.group).join(", ")}: no statement states a contributions figure at all, so the figure is reconstructed here from contribution and deposit activity rows, and excludes government grants.`}
      </Callout.Text>
    </Callout.Root>
  );
}

function Gridlines({ axis }: { axis: ValueAxis }) {
  return (
    <>
      {axis.yTicks.map((tick) => (
        <g key={tick} transform={`translate(0,${axis.y(tick)})`}>
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
 * One bar per year that has a figure. A year with none draws nothing at all:
 * no rect, no baseline stub, nothing that could be read as a contributed zero.
 */
function Bars({
  placed,
  axis,
  hatchId,
}: {
  placed: readonly PlacedYear[];
  axis: ValueAxis;
  hatchId: string;
}) {
  return (
    <>
      {placed.map(({ band, entry }) => {
        if (entry.contributed === null) return null;
        const top = axis.y(entry.contributed);
        const derived = entry.source === "derived";
        return (
          <rect
            key={band.year}
            data-contribution-bar=""
            data-year={band.year}
            data-source={entry.source ?? "none"}
            x={band.x}
            y={top}
            width={band.width}
            height={Math.max(0, INNER_HEIGHT - top)}
            fill={derived ? `url(#${hatchId})` : STATED_FILL}
            stroke={derived ? DERIVED_STROKE : STATED_STROKE}
            strokeWidth={1}
          />
        );
      })}
    </>
  );
}

/**
 * The ceiling over each bar, where there is one.
 *
 * `entry.limit` is null for the RESP in every year, which has no annual
 * contribution limit at all, and null for a year with no statement. Both
 * draw nothing: a zero line or a stand-in from another wrapper would invent
 * a ceiling that does not exist.
 */
function LimitLines({ placed, axis }: { placed: readonly PlacedYear[]; axis: ValueAxis }) {
  return (
    <>
      {placed.map(({ band, entry }) => {
        if (entry.limit === null) return null;
        const y = axis.y(entry.limit);
        return (
          <line
            key={band.year}
            data-limit-line=""
            data-year={band.year}
            data-assessed={String(entry.assessed)}
            x1={band.x - 6}
            x2={band.x + band.width + 6}
            y1={y}
            y2={y}
            stroke={entry.assessed ? STATED_STROKE : "var(--gray-a11)"}
            strokeWidth={1.75}
            strokeDasharray={entry.assessed ? undefined : GENERIC_LIMIT_DASH}
          />
        );
      })}
    </>
  );
}

/**
 * The year and its figure, below the axis rather than above the bar.
 *
 * Below, because a label above a bar that reaches the top of its own axis
 * has nowhere to sit, and clipping the figure to fit is not an option on a
 * chart whose whole point is stating figures. The figure formats through the
 * shared `formatCurrency`, at the same precision as the tooltip, so the two
 * cannot disagree.
 */
function YearAxis({ placed }: { placed: readonly PlacedYear[] }) {
  return (
    <>
      {placed.map(({ band, entry }) => (
        <g key={band.year} transform={`translate(${band.center},${INNER_HEIGHT})`}>
          <text data-year-label="" y={20} textAnchor="middle" fontSize={12} fill="var(--gray-a11)">
            {band.year}
          </text>
          <text
            data-year-figure={band.year}
            y={36}
            textAnchor="middle"
            fontSize={11}
            fill="var(--gray-a11)"
          >
            {entry.contributed === null ? "no statement" : formatCurrency(entry.contributed)}
          </text>
        </g>
      ))}
    </>
  );
}

/** What a card says about itself, and the only text a screen reader gets before the cursor moves. */
function wrapperSummary(wrapper: WrapperContributions): string {
  const drawn = drawnYearCount(wrapper);
  const total = wrapper.years.length;
  const first = wrapper.years[0];
  const last = wrapper.years[total - 1];
  const range = first === undefined || last === undefined ? "" : `, ${first.year} to ${last.year}`;
  const verb = drawn === 1 ? "has" : "have";
  const blanks =
    drawn === total
      ? ""
      : " The rest have no statement and are left blank rather than drawn as zero.";
  const ceiling = hasNoAnnualLimit(wrapper)
    ? ` ${wrapper.group} has no annual contribution limit, so no ceiling is drawn.`
    : "";
  return (
    `${wrapper.group} contributions by calendar year${range}. ` +
    `${drawn} of ${total} years ${verb} a figure.${blanks}${ceiling}`
  );
}

/** Said in the open as well as in the accessible summary, because it is the fact this card most needs stated. */
function NoLimitNote({ group }: { group: string }) {
  return (
    <Text size="2" color="gray" as="p" mt="2" data-no-limit-note="">
      {group} has no annual contribution limit, so no ceiling is drawn here. Its only contribution
      bound is a lifetime cap, which the wrappers view states.
    </Text>
  );
}

function slotsFor(placed: readonly PlacedYear[]): CursorSlot[] {
  return placed.map(({ band }) => ({ period: String(band.year), x: band.center }));
}

/**
 * True when the wrapper has years to draw and none of them has a ceiling --
 * the RESP, which has no annual contribution limit at all.
 *
 * The drawn-year test is what separates that from a wrapper the corpus
 * simply does not cover, whose years are all null for want of a statement.
 * Both have `limit === null` everywhere, and only one of them is a fact
 * about the wrapper.
 */
function hasNoAnnualLimit(wrapper: WrapperContributions): boolean {
  return drawnYearCount(wrapper) > 0 && wrapper.years.every((year) => year.limit === null);
}

/**
 * True when the wrapper contributes a derived figure in any year.
 *
 * Deliberately any-year, where the bars are per-year: one derived year among
 * three stated ones takes the whole card's badge. That is coarser than the
 * data, and the direction of the coarseness is the safe one -- it can call a
 * mostly-stated wrapper derived, never the reverse -- while the bars' fills
 * and the readout both carry the per-year truth. The corpus does not reach
 * the mixed case: the RESP is derived in its one year, and the other three
 * wrappers are stated in every year they cover. If a mixed wrapper ever
 * appears, this badge is the thing to split, not the bars.
 */
function isDerived(wrapper: WrapperContributions): boolean {
  return wrapper.years.some((year) => year.source === "derived");
}

function cursorY(entry: ContributionYear | null, axis: ValueAxis): number | null {
  if (entry === null || entry.contributed === null) return null;
  return axis.y(entry.contributed);
}

/** One wrapper's contributions per year, against its own ceiling where it has one. */
function WrapperCard({ wrapper }: { wrapper: WrapperContributions }) {
  const clipId = useSvgId("contributions-clip");
  const hatchId = useSvgId("contributions-hatch");
  const reveal = useRevealMotion(INNER_WIDTH);
  const placed = useMemo(() => placeYears(wrapper, INNER_WIDTH), [wrapper]);
  const max = useMemo(() => contributionsMax(wrapper), [wrapper]);
  const axis = useMemo(() => (max === null ? null : buildValueAxis(max, INNER_HEIGHT)), [max]);
  const points = useMemo(() => yearCursorPoints(wrapper), [wrapper]);
  const slots = useMemo(() => slotsFor(placed), [placed]);
  const cursor = useChartCursor(points, slots, CURSOR_GEOMETRY);

  const lines =
    cursor.period === null ? [] : contributionsTooltipLines(wrapper.group, cursor.point);
  const readout = lines.length === 0 ? "" : ` ${lines.join(". ")}.`;
  const noLimit = hasNoAnnualLimit(wrapper);

  return (
    <div data-contributions-card={wrapper.group}>
      <Card>
        <Flex justify="between" align="center" gap="2" mb="2" wrap="wrap">
          <Heading size="3" as="h3">
            {wrapper.group}
          </Heading>
          <Badge color={isDerived(wrapper) ? "amber" : "jade"} variant="soft">
            {SOURCE_BADGE[isDerived(wrapper) ? "derived" : "stated"]}
          </Badge>
        </Flex>
        {axis === null ? (
          <Text size="2" color="gray" as="p">
            No statement covers this wrapper in any year on the axis.
          </Text>
        ) : (
          <div style={{ position: "relative" }}>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="img"
              aria-label={`${wrapperSummary(wrapper)}${readout}`}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
              tabIndex={0}
              onPointerMove={cursor.onPointerMove}
              onPointerLeave={cursor.onPointerLeave}
              onKeyDown={cursor.onKeyDown}
              onBlur={cursor.onBlur}
              style={{ width: "100%", height: "auto", display: "block" }}
            >
              <title>{`${wrapper.group} contributions by calendar year`}</title>
              <defs>
                <HatchPattern id={hatchId} />
              </defs>
              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                <Gridlines axis={axis} />
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
                  <Bars placed={placed} axis={axis} hatchId={hatchId} />
                  <LimitLines placed={placed} axis={axis} />
                </g>
                <YearAxis placed={placed} />
                {/* No marker on a year with no figure: the crosshair alone,
                    and the readout saying in words that there is nothing here. */}
                <CursorMarks x={cursor.x} y={cursorY(cursor.point, axis)} height={INNER_HEIGHT} />
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
        {noLimit ? <NoLimitNote group={wrapper.group} /> : null}
      </Card>
    </div>
  );
}

/**
 * Contributions per calendar year, one card per registered wrapper, each
 * against its own ceiling.
 *
 * Three rules this view exists to hold, all of which a plausible-looking
 * chart would break:
 *
 * - A year no statement covers draws nothing. `buildRoomLines` reports those
 *   years as `used: 0`, and a zero bar would say the wrapper existed and
 *   took nothing in.
 * - The RESP draws no ceiling. It has no annual contribution limit at all,
 *   and a zero, a placeholder, or another wrapper's maximum standing in for
 *   it is the conflation that once produced a false over-contributed
 *   reading.
 * - A bar past a generic annual maximum is not an over-contribution.
 *   Carry-forward is invisible in statement data, so the 2025 TFSA's $21,000
 *   against a $7,000 published maximum is a fact about the maximum, not
 *   about the person. There is no over flag anywhere in this data model and
 *   none is introduced here.
 */
export function ContributionsChart({ analytics }: ContributionsChartProps) {
  const wrappers = useMemo(() => buildContributionsSeries(analytics), [analytics]);

  if (wrappers.length === 0) {
    return (
      <Flex direction="column" gap="2">
        <Heading size="5" as="h2">
          Contributions by year
        </Heading>
        <Text size="2" color="gray">
          No registered wrapper has a statement yet.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <Heading size="5" as="h2">
        Contributions by year
      </Heading>
      <ProvenanceNote wrappers={wrappers} />
      <Legend />
      {wrappers.map((wrapper) => (
        <WrapperCard key={wrapper.group} wrapper={wrapper} />
      ))}
    </Flex>
  );
}
