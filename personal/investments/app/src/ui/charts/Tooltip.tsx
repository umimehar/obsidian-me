import type { CSSProperties } from "react";
import { formatCurrency, formatGainWithShare } from "../format";
import { formatPeriodLabel } from "./plot";

/** What a tooltip states about one month. Structurally satisfied by `PortfolioPoint`. */
export interface TooltipPoint {
  marketValue: number;
  bookCost: number;
  /** How many accounts actually reported this month. */
  accountCount: number;
}

/**
 * Whether a figure is a gain or a loss, for the one purpose of colouring it.
 *
 * Never inferred from the sign at render time. `formatGainWithShare` already
 * puts an explicit "+" or "-" on the text, and a second, independent reading
 * of the same number to decide a colour is how a green minus sign happens.
 * The caller that knows the figure states the tone with it.
 */
export type Tone = "gain" | "loss";

/** The Radix step each tone paints, on the tooltip's own solid panel. */
const TONE_COLOR: Record<Tone, string> = {
  gain: "var(--jade-11)",
  loss: "var(--red-11)",
};

/** One label/figure pair in the tooltip's aligned column -- "Market value" beside "$7,216.94". */
export interface TooltipRow {
  label: string;
  value: string;
  /** Colours the figure, never the label. Absent for a figure that is neither. */
  tone?: Tone;
}

/**
 * A footnote, optionally toned. Plain strings stay valid, so every chart that
 * states one flat line per fact keeps passing strings and only the line that
 * carries a gain or a loss becomes an object.
 */
export interface TooltipNote {
  text: string;
  tone?: Tone;
}

export type TooltipFootnote = string | TooltipNote;

/** A footnote in its object form, whichever form the caller wrote. */
export function noteOf(footnote: TooltipFootnote): TooltipNote {
  return typeof footnote === "string" ? { text: footnote } : footnote;
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
  footnotes: readonly TooltipFootnote[];
}

/**
 * What the cursor says about one month, structured as a scan target rather
 * than a paragraph: a header, an aligned market-value/book-cost/gain column,
 * then the account-count disclosure and the book-cost caveat as dimmer
 * footnotes. A reader's question is almost always "market value versus book
 * cost", and a flat sentence buries both figures at different horizontal
 * positions in different clauses -- the aligned column is what makes them
 * comparable at a glance.
 *
 * The gain row is that comparison already done. It is CUMULATIVE to the
 * hovered month, market value less book cost as at that month, not the
 * change over it: the same quantity `CostGapChart` draws a bar for, and the
 * same one the headline prints for the latest month. A reader stepping the
 * cursor back through the series is asking how far ahead of cost the
 * portfolio stood then, and subtracting two six-figure numbers in their head
 * at every step is not an answer.
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
      // The subtraction the two rows above otherwise leave to the reader,
      // cumulative to this month rather than a change over it. Third, so the
      // pair it is derived from is read first.
      {
        label: "Gain against book cost",
        value: formatGainWithShare(point.marketValue - point.bookCost, point.bookCost),
        // Stated from the figure the caller already has, not re-derived from
        // the formatted string. A flat month is a gain of zero, which reads
        // as green: there is no loss, and grey would suggest the figure is
        // not a gain-or-loss at all.
        tone: point.marketValue >= point.bookCost ? "gain" : "loss",
      },
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
  // Tone is colour and nothing else: it never reaches the spoken sentence,
  // because a screen reader gets the sign from the text and "gain" would be
  // a second, unspoken copy of what "+" already says.
  const parts = [
    content.header,
    ...content.rows.map((row) => `${row.label} ${row.value}`),
    ...content.footnotes.map((footnote) => noteOf(footnote).text),
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
export function linesToTooltipContent(lines: readonly TooltipFootnote[]): TooltipContent {
  const [header, ...footnotes] = lines;
  return { header: header === undefined ? "" : noteOf(header).text, rows: [], footnotes };
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
type TooltipInput = { lines: readonly TooltipFootnote[] } | { content: TooltipContent };

function resolveContent(props: TooltipInput): TooltipContent {
  return "content" in props ? props.content : linesToTooltipContent(props.lines);
}

/**
 * The market-value/book-cost column's fixed width, measured in a real
 * browser against the running app rather than guessed. `box-sizing:
 * border-box` on the tooltip makes this the true rendered footprint, border
 * and padding included, not just the content box.
 *
 * A single number, not a min/max range: `tooltipAnchorStyle`'s absolute
 * positioning (`left: 95%`, `transform: translateX(-100%)`) constrains a
 * shrink-to-fit box's width to whatever space happens to be left before the
 * containing block's edge, which is what made the old unconstrained tooltip
 * render 92px wide and four lines tall at either end of a chart and ~300px
 * wide in the middle -- two different-looking components depending on where
 * the cursor happened to be. A fixed width is the same box everywhere,
 * edge or centre, which was confirmed directly: hovering a chart at the
 * fraction 0.05, 0.5 and 0.95 (near-left, centre, near-right) all render
 * this exact width, and all stay fully inside both their card and the
 * viewport at every position tested.
 *
 * 320 was chosen from the two things that have to fit in it. The book-cost
 * caveat footnote ("Book cost is approximate for USD holdings and not a
 * filing figure", 68 characters) is the widest single piece of content in
 * every stated month's tooltip, wider than either row; at 320px it wraps
 * across two lines of roughly 50-55 characters each, inside the 45-60
 * character comfortable-reading range. The market-value/book-cost row has
 * to fit the largest figure this app ever states, the portfolio total
 * ($241,739.67), beside its label without wrapping -- confirmed directly,
 * that row renders on one line at 17.4px tall at 320px, with room either
 * side, and so does the smallest real row figure. The flat-line tooltip gets
 * its own fixed width, `LINES_WIDTH`, below.
 */
const ROWS_WIDTH = 320;

/**
 * The flat-line tooltip's fixed width, for the same reason as `ROWS_WIDTH`:
 * shrink-to-fit near a chart's edge wrapped "This month 3.22%" onto two lines.
 */
const LINES_WIDTH = 260;

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
        width: hasRows ? ROWS_WIDTH : LINES_WIDTH,
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
                data-tooltip-tone={row.tone}
                style={{
                  color: row.tone === undefined ? "var(--gray-12)" : TONE_COLOR[row.tone],
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
          {content.footnotes.map(noteOf).map((note, index) => (
            // No two footnotes of one readout repeat, so the footnote text is
            // unique within a readout; the index prefix keeps that true even
            // if a future footnote duplicates another.
            <div
              key={`${index}:${note.text}`}
              data-tooltip-tone={note.tone}
              style={{
                // A toned footnote is a figure, so it is painted and left at
                // the footnote's own size rather than promoted into the row
                // column: the charts that use footnotes state one figure each
                // and have no second figure to align it against.
                color: note.tone === undefined ? "var(--gray-11)" : TONE_COLOR[note.tone],
                fontSize: 11,
                lineHeight: 1.45,
              }}
            >
              {note.text}
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

/**
 * The readout clause a chart appends to its own `aria-label`, leading space
 * and trailing stop included, or "" when the cursor is away.
 *
 * Every chart had its own copy of this join. That was harmless while a line
 * was always a string and became `[object Object]` in the accessible name the
 * moment one carried a tone -- in the one copy of the figures no sighted
 * reader ever sees, which is precisely where this project keeps finding
 * these. One function now, so a chart that adopts tones later cannot
 * reintroduce it.
 */
export function readoutSuffix(lines: readonly TooltipFootnote[]): string {
  if (lines.length === 0) return "";
  return ` ${lines.map((line) => noteOf(line).text).join(". ")}.`;
}

/** Either shape `CursorAnnouncement` may be given; `null` is "no cursor", the empty announcement. */
type CursorAnnouncementInput =
  | { lines: readonly TooltipFootnote[] }
  | { content: TooltipContent | null };

function announcementText(props: CursorAnnouncementInput): string {
  if ("content" in props) {
    return props.content === null ? "" : tooltipAnnouncement(props.content);
  }
  return readoutSuffix(props.lines).trimStart();
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
