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

export interface ChartTooltipProps {
  /** `YYYY-MM` under the cursor. */
  period: string;
  /** The point for that month, or null when the series states nothing for it. */
  point: TooltipPoint | null;
  /** How many accounts the chart counts in total, so a partial month can say it is partial. */
  countedAccounts: number;
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
 * `aria-hidden`, deliberately: the chart's own `aria-label` already carries
 * these exact lines, and a second announced copy is a second figure to drift
 * out of step with the first.
 */
export function ChartTooltip({ period, point, countedAccounts }: ChartTooltipProps) {
  const lines = tooltipLines(period, point, countedAccounts);
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
        <div
          key={line}
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
