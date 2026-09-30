import type { CSSProperties } from "react";
import type { ReadoutLine, ReadoutRole } from "./linkReadout";

export interface ReadoutCardProps {
  lines: readonly ReadoutLine[];
  /** The hovered band's own colour family, painted on the header's swatch chip. */
  swatchColor: string;
}

/**
 * The card's fixed width, the same "shrink-to-fit near an edge" problem
 * `ChartTooltip`'s own `ROWS_WIDTH` solves: a box whose width comes from
 * `left`/`right` percentages rather than its own content renders a
 * different size depending on how much room happens to be left at the
 * anchor. 260 fits the widest single line this card states on the real
 * corpus -- a share-of-destination sentence naming "Spousal RRSP (spouse's
 * asset)" -- on one line at 12px, confirmed in a real running chart.
 */
export const CARD_WIDTH = 260;

/**
 * The card's own estimated height, for `readoutPlacement.ts` to reserve
 * room for before paint -- a placement computed from the layout, not
 * measured after the fact, so the card never flashes at one spot then jumps
 * to another. `getBoundingClientRect()` on the real running chart measured
 * 151.95px for the six-line shape (both share lines present, the common
 * case) and the same for a cash band (its rows line is longer text but one
 * line, same as a row count's). 156 keeps a small margin above that; a rarer
 * five-line card (one share omitted, a zero-value node) simply leaves blank
 * space below it inside the reserved box rather than one running short.
 */
export const CARD_HEIGHT = 156;

const CARD_STYLE: CSSProperties = {
  boxSizing: "border-box",
  width: CARD_WIDTH,
  background: "var(--color-panel-solid)",
  border: "1px solid var(--gray-a6)",
  borderRadius: "var(--radius-3)",
  boxShadow: "var(--shadow-4)",
  padding: "10px 12px",
};

const SEPARATOR: CSSProperties = {
  border: "none",
  borderTop: "1px solid var(--gray-a5)",
  margin: "6px 0",
};

const SUMMARY_ROW: CSSProperties = { color: "var(--gray-11)", fontSize: 12, lineHeight: 1.45 };

function lineOf(lines: readonly ReadoutLine[], role: ReadoutRole): string | undefined {
  return lines.find((l) => l.role === role)?.text;
}

/**
 * The structured readout for a hovered or focused Sankey band (TCK-0016): a
 * swatch and "Source → Destination", the amount at a larger step, its share
 * of all money in, a divider, its share of its own source and destination
 * nodes, then how many statement rows sit behind it. Every line's text
 * comes from `linkReadout`, the one function that also builds the band's
 * `aria-label` and its live announcement, so the three can never disagree.
 *
 * `aria-hidden`: `CursorAnnouncement` speaks the same lines through
 * `readoutText`, and a screen reader reading both would hear the figures
 * twice.
 */
export function ReadoutCard({ lines, swatchColor }: ReadoutCardProps) {
  const header = lineOf(lines, "header");
  const amount = lineOf(lines, "amount");
  const shareTotal = lineOf(lines, "shareTotal");
  const shareSource = lineOf(lines, "shareSource");
  const shareDestination = lineOf(lines, "shareDestination");
  const rows = lineOf(lines, "rows");
  return (
    <div data-flow-readout-card="" aria-hidden="true" style={CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 2,
            background: swatchColor,
            flexShrink: 0,
          }}
        />
        <span style={{ color: "var(--gray-12)", fontSize: 12, fontWeight: 600, lineHeight: 1.45 }}>
          {header}
        </span>
      </div>
      <div
        style={{
          color: "var(--gray-12)",
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.3,
          marginTop: 4,
        }}
      >
        {amount}
      </div>
      <div style={SUMMARY_ROW}>{shareTotal}</div>
      <hr style={SEPARATOR} />
      {shareSource === undefined ? null : <div style={SUMMARY_ROW}>{shareSource}</div>}
      {shareDestination === undefined ? null : <div style={SUMMARY_ROW}>{shareDestination}</div>}
      <div style={SUMMARY_ROW}>{rows}</div>
    </div>
  );
}
