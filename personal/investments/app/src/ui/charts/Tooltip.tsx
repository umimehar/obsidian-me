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

/**
 * What the cursor says about one month, one line at a time.
 *
 * Pure, and the single source of both copies: the visible tooltip renders
 * these lines and the chart's `aria-label` joins them. Two independently
 * written copies of the same figures is exactly how this project shipped an
 * announced $241,740 beside a rendered $241,739.67, so there is one copy.
 *
 * A null `point` is a month with no statement, and it prints no figure at
 * all. Not `$0.00`, and not a neighbour's value carried across: `months[]`
 * omits an unstated period rather than zero-filling it, and a tooltip that
 * invents a figure there would be stating something the statements do not.
 * A real zero, like the two open and unfunded accounts of 2023-06, is a
 * point with `marketValue: 0` and prints as `$0.00`, which is the difference.
 */
export function tooltipLines(
  period: string,
  point: TooltipPoint | null,
  countedAccounts: number,
): string[] {
  const label = formatPeriodLabel(period);
  if (point === null) return [label, "No statement for this month"];
  const noun = countedAccounts === 1 ? "account" : "accounts";
  return [
    label,
    `Market value ${formatCurrency(point.marketValue)}`,
    `Book cost ${formatCurrency(point.bookCost)}, approximate for USD holdings and not a filing figure`,
    `${point.accountCount} of ${countedAccounts} ${noun} reported this month`,
  ];
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

/**
 * The visible readout beside the cursor.
 *
 * `aria-hidden`, deliberately: `CursorAnnouncement` below speaks these same
 * lines, and two announced copies of one figure is how they drift apart.
 *
 * It takes the finished lines rather than the point, so the caller makes one
 * `tooltipLines` call and hands the result to the tooltip, the announcement
 * and the chart's own `aria-label` alike.
 */
export function ChartTooltip({ lines }: { lines: readonly string[] }) {
  return (
    <div
      data-chart-tooltip=""
      aria-hidden="true"
      style={{
        background: "var(--color-panel-solid)",
        border: "1px solid var(--gray-a6)",
        borderRadius: "var(--radius-3)",
        boxShadow: "var(--shadow-3)",
        padding: "8px 10px",
        maxWidth: 280,
      }}
    >
      {lines.map((line, index) => (
        // The month label is always line 0 and no two lines of one readout
        // repeat, so the line is unique within a readout; the index prefix
        // keeps that true even if a future line duplicates another.
        <div
          key={`${index}:${line}`}
          style={{
            color: index === 0 ? "var(--gray-12)" : "var(--gray-a11)",
            fontSize: index === 0 ? 13 : 12,
            fontWeight: index === 0 ? 600 : 400,
            lineHeight: 1.45,
          }}
        >
          {line}
        </div>
      ))}
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
 * The spoken copy of the readout.
 *
 * The chart's `aria-label` also carries these lines, which satisfies the
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
export function CursorAnnouncement({ lines }: { lines: readonly string[] }) {
  return (
    <output aria-live="polite" data-cursor-announcement="" style={VISUALLY_HIDDEN}>
      {lines.length === 0 ? "" : `${lines.join(". ")}.`}
    </output>
  );
}
