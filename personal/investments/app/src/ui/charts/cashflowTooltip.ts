import type { CashflowPoint } from "../../analytics/cashflowSeries";
import { formatCurrency } from "../format";
import { formatPeriodLabel } from "./plot";

/**
 * What the cursor says about one month, one line at a time.
 *
 * Pure, and the single source of all three copies: the visible tooltip, the
 * live announcement and the chart's accessible name are all built from one
 * call, so an announced figure cannot round differently from a printed one.
 *
 * A null `point` is a month no `inTotals` account has a statement for, and
 * prints as an absence in words, never as `$0.00`. A month present with no
 * deposits and no withdrawals is a different `point`, one whose fields are
 * both zero, and it prints those zeroes plainly -- the CASH-template
 * statements that carry no `paidIn`/`paidOut` block are exactly this case.
 */
export function cashflowTooltipLines(period: string, point: CashflowPoint | null): string[] {
  const label = formatPeriodLabel(period);
  if (point === null) return [label, "No statement for this month"];
  const noun = point.accountCount === 1 ? "account" : "accounts";
  return [
    label,
    `Deposits ${formatCurrency(point.deposits)}`,
    `Withdrawals ${formatCurrency(point.withdrawals)}`,
    `${point.accountCount} ${noun} reported this month`,
  ];
}
