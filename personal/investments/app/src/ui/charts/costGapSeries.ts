import { type PortfolioPoint, periodExtent } from "../../analytics/portfolioSeries";
import { formatCurrency } from "../format";
import { formatPeriodLabel } from "./plot";

export { periodExtent as costGapPeriodExtent };

/**
 * One period's gap between market value and book cost, alongside the two
 * figures it is drawn from.
 *
 * `gap` is never itself a stated figure -- no statement prints it -- and it
 * inherits `bookCost`'s own caveat: book cost for a USD holding is a current
 * month-end rate applied to a basis that was actually accumulated at each
 * purchase's own historical rate, so it does not reconcile on 19 statements
 * in this corpus, by up to $218.92. `gap` is therefore approximate wherever
 * `bookCost` is, which every consumer of this type has to say next to the
 * number rather than only once on the page.
 */
export interface GapPoint extends PortfolioPoint {
  gap: number;
}

/**
 * Adds the gap to every point `buildPortfolioSeries` already built.
 *
 * Deliberately not a second aggregation: `buildPortfolioSeries` is the one
 * place that sums `inTotals` accounts and skips a period neither figure is
 * stated for, and this only subtracts two fields it already produced.
 */
export function buildGapPoints(points: readonly PortfolioPoint[]): GapPoint[] {
  return points.map((point) => ({ ...point, gap: point.marketValue - point.bookCost }));
}

/**
 * What the cursor says about one month, one line at a time.
 *
 * Pure, and the single source of the accessible name, the live announcement
 * and the visible tooltip alike, so an announced gap cannot round differently
 * from a printed one. The word "approximate" sits on the same line as the
 * figure it qualifies, not in a caveat printed once elsewhere on the chart --
 * a reader hovering one month must not have to scroll to learn the number
 * they are looking at is not a filing figure.
 *
 * A null `point` is a month no `inTotals` account has both figures stated
 * for, and prints as an absence in words, never as `$0.00`. A month present
 * with market value equal to book cost is a different `point`, a real stated
 * zero gap, like the two open and unfunded accounts of 2023-06.
 */
export function costGapTooltipLines(period: string, point: GapPoint | null): string[] {
  const label = formatPeriodLabel(period);
  if (point === null) return [label, "No statement for this month"];
  const noun = point.accountCount === 1 ? "account" : "accounts";
  const direction =
    point.gap === 0
      ? "Market value equal to book cost"
      : point.gap > 0
        ? "Market value ahead of book cost"
        : "Book cost ahead of market value";
  return [
    label,
    `Gap ${formatCurrency(point.gap)}, approximate`,
    direction,
    `Market value ${formatCurrency(point.marketValue)}, book cost ${formatCurrency(point.bookCost)}, ` +
      "converted and approximate for USD holdings",
    `${point.accountCount} ${noun} reported this month`,
  ];
}
