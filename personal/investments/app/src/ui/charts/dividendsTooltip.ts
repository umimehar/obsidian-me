import type { MonthlyActivity } from "../../analytics/incomeCosts";
import { formatCurrency } from "../format";
import { formatPeriodLabel } from "./plot";

/**
 * What the cursor says about one month, one line at a time. Interest and
 * securities lending ride along beside dividends, the chart's own bar,
 * rather than needing a second chart to see a month's other income.
 *
 * A null `point` is a month no statement covers, and it prints as an
 * absence in words, never as `$0.00`. A month present with no dividends
 * still prints its real stated zero.
 */
export function dividendsTooltipLines(period: string, point: MonthlyActivity | null): string[] {
  const label = formatPeriodLabel(period);
  if (point === null) return [label, "No statement for this month"];
  return [
    label,
    `Dividends ${formatCurrency(point.totals.dividends)}`,
    `Interest ${formatCurrency(point.totals.interest)}`,
    `Securities lending ${formatCurrency(point.totals.lendingIncome)}`,
  ];
}
