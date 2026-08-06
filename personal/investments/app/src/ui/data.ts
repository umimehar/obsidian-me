import rawAnalytics from "@data/analytics.json";
import type { AnalyticsOutput } from "../analytics/build";
import type { Lens } from "../analytics/rollup";

const LENSES: readonly Lens[] = ["registration", "account", "purpose"];

/**
 * A narrow structural check on the raw JSON import, so `parseAnalytics`
 * never trusts the file's shape with an unchecked cast. It checks the
 * top-level contract only -- the nested figures are exercised by
 * `data.test.ts` against the real committed file, not re-validated here.
 */
function isAnalyticsOutput(value: unknown): value is AnalyticsOutput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.meta === "object" &&
    candidate.meta !== null &&
    Array.isArray(candidate.series) &&
    typeof candidate.rooms === "object" &&
    typeof candidate.income === "object" &&
    Array.isArray(candidate.returns) &&
    typeof candidate.rollups === "object"
  );
}

export function parseAnalytics(raw: unknown): AnalyticsOutput {
  if (!isAnalyticsOutput(raw)) {
    throw new Error(
      "analytics.json is missing one of meta, series, rooms, income, returns, rollups",
    );
  }
  return raw;
}

/** The real committed payload, parsed once at module load. */
export function loadAnalytics(): AnalyticsOutput {
  return parseAnalytics(rawAnalytics);
}

/**
 * The most recent statement period the portfolio total reflects, `YYYY-MM`.
 * Scoped to `inTotals: true` accounts only -- a Cash account's statement can
 * land a month ahead of the brokerage accounts (see the investments
 * CLAUDE.md on cash exclusion), and counting it here would date-stamp the
 * total to a period its own figure does not actually cover.
 */
export function latestPeriod(analytics: AnalyticsOutput): string | null {
  let latest: string | null = null;
  for (const account of analytics.series) {
    if (!account.inTotals) continue;
    const last = account.months[account.months.length - 1];
    if (last === undefined) continue;
    if (latest === null || last.period > latest) latest = last.period;
  }
  return latest;
}

/**
 * The grand total for one lens: the sum of every group's `total` in that
 * lens's rollup. All three lenses regroup the same money, so this figure
 * must agree across `"registration"`, `"account"` and `"purpose"` -- the
 * strongest invariant `data.test.ts` checks.
 */
export function lensTotal(analytics: AnalyticsOutput, lens: Lens): number {
  const groups = analytics.rollups[lens];
  let total = 0;
  for (const group of groups) total += group.total;
  return total;
}

/** `lensTotal` for every lens, keyed by lens -- lets the UI display or cross-check all three. */
export function totalsByLens(analytics: AnalyticsOutput): Record<Lens, number> {
  return Object.fromEntries(LENSES.map((lens) => [lens, lensTotal(analytics, lens)])) as Record<
    Lens,
    number
  >;
}

/** The portfolio total shown as the headline figure, from the registration lens. */
export function grandTotal(analytics: AnalyticsOutput): number {
  return lensTotal(analytics, "registration");
}
