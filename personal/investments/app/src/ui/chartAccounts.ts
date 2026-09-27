import type { AccountSeries } from "../analytics/types";

/**
 * The accounts the main chart can show: every investment account with at
 * least one stated market value. Chequing is left out; its statements state
 * no market value from 2026-07 on, so its line would stop short for a reason
 * that has nothing to do with the money.
 */
export function chartableAccounts(series: readonly AccountSeries[]): AccountSeries[] {
  return series
    .filter((a) => a.kind !== "Chequing" && a.months.some((m) => m.marketValue !== null))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The selection the chart opens with: exactly the accounts in the portfolio total. */
export function defaultSelection(series: readonly AccountSeries[]): Set<string> {
  return new Set(
    chartableAccounts(series)
      .filter((a) => a.inTotals)
      .map((a) => a.maskedId),
  );
}

export function isDefaultSelection(
  series: readonly AccountSeries[],
  selected: ReadonlySet<string>,
): boolean {
  const portfolio = defaultSelection(series);
  return portfolio.size === selected.size && [...portfolio].every((id) => selected.has(id));
}

/**
 * The series the main chart draws for a selection. The default selection is
 * the portfolio itself, passed through untouched. Any other selection charts
 * exactly the accounts picked, whether or not they count toward the total:
 * the spousal RRSP is excluded from the total, not from having a history.
 */
export function seriesForChart(
  series: readonly AccountSeries[],
  selected: ReadonlySet<string>,
): readonly AccountSeries[] {
  if (isDefaultSelection(series, selected)) return series;
  return series.filter((a) => selected.has(a.maskedId)).map((a) => ({ ...a, inTotals: true }));
}

/** What the chart is of, for its title, its accessible summary and the filter's button. */
export function chartSubject(
  series: readonly AccountSeries[],
  selected: ReadonlySet<string>,
): string {
  if (isDefaultSelection(series, selected)) return "Portfolio";
  const picked = series.filter((a) => selected.has(a.maskedId));
  const [only] = picked;
  return picked.length === 1 && only !== undefined ? only.label : `${picked.length} accounts`;
}
