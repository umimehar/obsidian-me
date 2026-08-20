import type { CSSProperties } from "react";
import { formatCurrency } from "../format";
import { formatPeriodLabel } from "./plot";

/** What a tooltip states about one month. Structurally satisfied by `PortfolioPoint`. */
export interface TooltipPoint {
  marketValue: number;
  bookCost: number;
  /** How many accounts actually reported this month. */
  accountCount: number;
}

/** One label/figure pair in the tooltip's aligned column -- "Market value" beside "$7,216.94". */
export interface TooltipRow {
  label: string;
  value: string;
}

/**
 * A tooltip's content in three zones, read top to bottom: a header (the
 * period), an aligned column of figures, then dimmer footnotes -- the
 * account-count disclosure and any caveat a figure needs. `rows` is empty
 * for a month with no statement, since there is nothing to align.
 *
 * This shape, not a flat `string[]`, is what lets both the visible tooltip
 * and the spoken announcement come from one value with no second copy of
 * any figure: `tooltipContent` builds it once, `ChartTooltip` renders it,
 * and `tooltipAnnouncement` turns that same value into a sentence.
 */
export interface TooltipContent {
  header: string;
  rows: readonly TooltipRow[];
  footnotes: readonly string[];
}

/**
 * What the cursor says about one month, structured as a scan target rather
 * than a paragraph: a header, an aligned market-value/book-cost column, then
 * the account-count disclosure and the book-cost caveat as dimmer
 * footnotes. A reader's question is almost always "market value versus book
 * cost", and a flat sentence buries both figures at different horizontal
 * positions in different clauses -- the aligned column is what makes them
 * comparable at a glance.
 *
 * Pure, and the single source of both copies: `ChartTooltip` renders this
 * value and `tooltipAnnouncement` turns it into the sentence the chart's
 * `aria-label` and `CursorAnnouncement` speak. Two independently written
 * copies of the same figures is exactly how this project shipped an
 * announced $241,740 beside a rendered $241,739.67, so there is one copy --
 * splitting the old flat lines into rows and footnotes did not reopen that
 * risk, because every figure below still comes from exactly one
 * `formatCurrency` call each, never a second one for the spoken form.
 *
 * A null `point` is a month with no statement, and it prints no figure at
 * all: `rows` stays empty and the one footnote says so. Not `$0.00`, and not
 * a neighbour's value carried across -- `months[]` omits an unstated period
 * rather than zero-filling it, and a tooltip that invented a figure there
 * would be stating something the statements do not. A real zero, like the
 * two open and unfunded accounts of 2023-06, is a point with
 * `marketValue: 0`, which prints as `$0.00` through the row exactly like any
 * other stated figure -- that is the difference.
 */
export function tooltipContent(
  period: string,
  point: TooltipPoint | null,
  countedAccounts: number,
): TooltipContent {
  const header = formatPeriodLabel(period);
  if (point === null) {
    return { header, rows: [], footnotes: ["No statement for this month"] };
  }
  const noun = countedAccounts === 1 ? "account" : "accounts";
  return {
    header,
    rows: [
      { label: "Market value", value: formatCurrency(point.marketValue) },
      { label: "Book cost", value: formatCurrency(point.bookCost) },
    ],
    footnotes: [
      `${point.accountCount} of ${countedAccounts} ${noun} reported this month`,
      "Book cost is approximate for USD holdings and not a filing figure",
    ],
  };
}

/**
 * `tooltipContent`'s structure, turned into the one sentence
 * `CursorAnnouncement` and a chart's `aria-label` speak. A pure projection
 * of the same value `ChartTooltip` renders, never a second pass over the
 * underlying point, so nothing here can drift from what a sighted reader
 * sees: a row becomes `"Market value $7,216.94"`, a footnote is its own
 * sentence, joined the same way the old flat line list was.
 */
export function tooltipAnnouncement(content: TooltipContent): string {
  const parts = [
    content.header,
    ...content.rows.map((row) => `${row.label} ${row.value}`),
    ...content.footnotes,
  ];
  return `${parts.join(". ")}.`;
}

/**
 * Wraps a flat line list -- what every other chart's own tooltip function
 * still returns (`costGapTooltipLines`, `cashflowTooltipLines`, and the
 * rest) -- as `TooltipContent` with an empty row column, so `ChartTooltip`
 * and `CursorAnnouncement` render every chart's tooltip through one shape
 * without forcing the market-value/book-cost redesign onto tooltips that
 * were never asked to change. Those charts each state one figure, not a
 * pair to compare, so they have nothing to put in an aligned column; the
 * first line becomes the header, the rest are footnotes, which is visually
 * close to how they already rendered (line 0 bold, the rest dim).
 */
export function linesToTooltipContent(lines: readonly string[]): TooltipContent {
  const [header, ...footnotes] = lines;
  return { header: header ?? "", rows: [], footnotes };
}

/**
 * Where the readout sits horizontally, as a fraction of the chart's own
 * width, so it tracks the cursor on a chart laid out at `width: 100%` with no
 * pixel measurement anywhere.
 *
 * It is anchored by its centre in the middle of the chart and by its near
 * edge at either end, so a readout over the first or last month stays inside
 * the card instead of hanging off it. Shared by both charts, since the rule
 * is about the chart's edges rather than about either chart.
 */
export function tooltipAnchorStyle(x: number, viewBoxWidth: number): CSSProperties {
  const fraction = viewBoxWidth > 0 ? Math.min(1, Math.max(0, x / viewBoxWidth)) : 0;
  const anchor = fraction < 0.2 ? "0" : fraction > 0.8 ? "-100%" : "-50%";
  return {
    position: "absolute",
    left: `${fraction * 100}%`,
    transform: `translateX(${anchor})`,
    pointerEvents: "none",
    zIndex: 5,
  };
}

/** Either shape a caller may already have on hand; both resolve to the same rendering value. */
type TooltipInput = { lines: readonly string[] } | { content: TooltipContent };

function resolveContent(props: TooltipInput): TooltipContent {
  return "content" in props ? props.content : linesToTooltipContent(props.lines);
}

/**
 * The market-value/book-cost column's bounds, measured in a real browser
 * against the running app rather than guessed. `box-sizing: border-box` on
 * the tooltip makes these the true rendered footprint, border and padding
 * included, not just the content box -- confirmed directly: the box renders
 * at exactly 300px for a short-figured point and exactly 340px for a
 * long-figured one, never in between or beyond.
 *
 * In practice the book-cost caveat footnote ("Book cost is approximate for
 * USD holdings and not a filing figure", 68 characters) is the widest single
 * piece of content in every stated month's tooltip, wider than either row,
 * so it is what pushes the box toward 340px. `minWidth: 300` is the floor
 * that stops the row column crowding when the footnote alone would not hold
 * the box open -- both the smallest real row figure and the largest this
 * app ever states, the portfolio total ($241,739.67), render their row on
 * one line at 17.4px tall with no wrap at this width, confirmed directly for
 * both. `maxWidth: 340` keeps the footnote wrapping at a comfortable measure
 * instead of running the width of the card -- at this font size it wraps
 * that sentence across two lines, each within the 45-60 character
 * comfortable-reading range. Only applied when there is a column to protect
 * -- see `linesToTooltipContent`'s comment for why every other chart's
 * flat-line tooltip keeps its own unconstrained width.
 */
const ROWS_MIN_WIDTH = 300;
const ROWS_MAX_WIDTH = 340;

const SEPARATOR: CSSProperties = {
  border: "none",
  borderTop: "1px solid var(--gray-a5)",
  margin: "6px 0",
};

/**
 * The visible readout beside the cursor, three zones top to bottom: the
 * period header, an aligned market-value/book-cost column, then dimmer
 * footnotes. Figures render with `fontVariantNumeric: "tabular-nums"` so
 * every digit occupies equal width and the two amounts stack into a
 * genuinely comparable column, not just a visually similar one.
 *
 * `aria-hidden`, deliberately: `CursorAnnouncement` speaks the same
 * structure via `tooltipAnnouncement`, and two announced copies of one
 * figure is how they drift apart.
 *
 * Accepts either the new structured `content` (the group and portfolio
 * charts) or the flat `lines` every other chart's own tooltip function
 * still returns, normalised through `linesToTooltipContent`.
 */
export function ChartTooltip(props: TooltipInput) {
  const content = resolveContent(props);
  const hasRows = content.rows.length > 0;
  return (
    <div
      data-chart-tooltip=""
      aria-hidden="true"
      style={{
        boxSizing: "border-box",
        background: "var(--color-panel-solid)",
        border: "1px solid var(--gray-a6)",
        borderRadius: "var(--radius-3)",
        boxShadow: "var(--shadow-3)",
        padding: "8px 10px",
        maxWidth: hasRows ? ROWS_MAX_WIDTH : 280,
        minWidth: hasRows ? ROWS_MIN_WIDTH : undefined,
      }}
    >
      <div style={{ color: "var(--gray-12)", fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
        {content.header}
      </div>
      {hasRows ? (
        <>
          <hr style={SEPARATOR} />
          {content.rows.map((row) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: "var(--gray-11)", fontSize: 12 }}>{row.label}</span>
              <span
                style={{
                  color: "var(--gray-12)",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </>
      ) : null}
      {content.footnotes.length > 0 ? (
        <>
          {hasRows ? <hr style={SEPARATOR} /> : null}
          {content.footnotes.map((footnote, index) => (
            // No two footnotes of one readout repeat, so the footnote text is
            // unique within a readout; the index prefix keeps that true even
            // if a future footnote duplicates another.
            <div
              key={`${index}:${footnote}`}
              style={{ color: "var(--gray-11)", fontSize: 11, lineHeight: 1.45 }}
            >
              {footnote}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

/** Off-screen but still rendered, so a screen reader reads it and no sighted reader sees it. */
const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Either shape `CursorAnnouncement` may be given; `null` is "no cursor", the empty announcement. */
type CursorAnnouncementInput = { lines: readonly string[] } | { content: TooltipContent | null };

function announcementText(props: CursorAnnouncementInput): string {
  if ("content" in props) {
    return props.content === null ? "" : tooltipAnnouncement(props.content);
  }
  return props.lines.length === 0 ? "" : `${props.lines.join(". ")}.`;
}

/**
 * The spoken copy of the readout.
 *
 * The chart's `aria-label` also carries this text, which satisfies the
 * accessible name but not much else: screen readers do not reliably
 * re-announce a name change on an element that is already focused, so a
 * keyboard user arrowing along the series could hear the first point and
 * then silence. A polite live region is the thing that actually speaks on
 * each move.
 *
 * It is rendered at all times, empty when the cursor is away, because a live
 * region that appears at the same moment its content does is not reliably
 * announced either.
 *
 * `<output>` rather than a `div` with `role="status"`: the element carries
 * that role natively, so there is no role to get wrong.
 */
export function CursorAnnouncement(props: CursorAnnouncementInput) {
  return (
    <output aria-live="polite" data-cursor-announcement="" style={VISUALLY_HIDDEN}>
      {announcementText(props)}
    </output>
  );
}
