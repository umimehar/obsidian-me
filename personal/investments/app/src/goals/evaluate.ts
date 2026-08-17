import type { AnalyticsOutput } from "../analytics/build";
import type { AccountSeries } from "../analytics/types";
import type { ProjectionYear } from "../projection/engine";
import { type ProjectionGroup, groupOf } from "../projection/inputs";
import { accountValues } from "./allocation";
import type { Goal } from "./config";
import { type ScopeCoverage, resolveScope } from "./scope";

export interface GoalVerdict {
  goal: Goal;
  /** Null when the scope covers no projected account, or the target year is past the projection. */
  projected: number | null;
  /** `projected - target`. Null whenever `projected` is. Positive is a surplus. */
  gap: number | null;
  /** Extra contribution per month that closes a shortfall. Null when there is no shortfall or none can. */
  monthlyToClose: number | null;
  /** Set when a shortfall cannot be closed by contributing, with the reason in words. */
  blocked: string | null;
  coverage: ScopeCoverage;
}

/**
 * The extra ANNUAL amount that, contributed at year end for `years` years
 * (mirroring `engine.ts`'s own convention -- growth applies to the opening
 * balance, a contribution lands at year end and earns nothing in its own
 * year), grows to close a shortfall of size `-gap`.
 *
 * A textbook annuity-due formula assumes a start-of-year contribution and
 * would return a smaller figure than the engine's chart can actually
 * deliver -- the card would quietly contradict the chart beside it. At
 * `rate` of exactly 0 the growth factor `((1 + rate) ** years - 1) / rate`
 * divides by zero, so that case returns the shortfall split evenly across
 * the years instead.
 */
export function contributionToClose(gap: number, years: number, rate: number): number {
  const shortfall = -gap;
  if (rate === 0) return shortfall / years;
  const growthFactor = ((1 + rate) ** years - 1) / rate;
  return shortfall / growthFactor;
}

/**
 * Whether at least one of the scope's covered accounts belongs to a wrapper
 * that still has CRA room left at the target year, or to a wrapper with no
 * CRA room concept at all.
 *
 * Corporate is the one projected group with no CRA contribution room --
 * `engine.ts` reports its `roomRemaining` as a flat 0 because there is
 * nothing to report, not because the wrapper is capped. Reading that 0 as
 * "no room" would falsely block every corporate-scoped shortfall, the one
 * case CRA places no ceiling on at all. Every other group's `roomRemaining`
 * really is the room CRA has left for that wrapper at that year, and it
 * reads 0 for TFSA/RRSP/RESP/FHSA in most projected years precisely because
 * the baseline projection already assumes maxing out contributions -- there
 * is no unused room for an extra dollar to use.
 */
function scopeHasRoom(covered: readonly AccountSeries[], targetRow: ProjectionYear): boolean {
  const groups = new Set<ProjectionGroup>();
  for (const account of covered) {
    const group = groupOf(account.kind);
    if (group !== null) groups.add(group);
  }
  for (const group of groups) {
    if (group === "Corporate") return true;
    if ((targetRow.roomRemaining[group] ?? 0) > 0) return true;
  }
  return false;
}

const unprojectable = (goal: Goal, coverage: ScopeCoverage): GoalVerdict => ({
  goal,
  projected: null,
  gap: null,
  monthlyToClose: null,
  blocked: null,
  coverage,
});

/**
 * Turns one declared goal into a verdict against a projection: what its
 * scope is worth in the target year, the gap against the target, and the
 * extra monthly contribution that would close a shortfall.
 *
 * `projected` and `gap` are null, never a clamped or coerced zero, whenever
 * the scope covers no projected account or the target year falls outside
 * `rows` -- both are facts the projection cannot state, not a zero balance.
 * The target row is found by matching `year`, never by treating `rows` as
 * indexed by calendar year: `rows` starts wherever the corpus's latest
 * statement does, not at year zero.
 */
export function evaluateGoal(
  goal: Goal,
  analytics: AnalyticsOutput,
  rows: readonly ProjectionYear[],
  returnRate: number,
  fhsaCloseYear: string,
): GoalVerdict {
  const coverage = resolveScope(analytics.series, goal.scope);
  if (coverage.covered.length === 0) return unprojectable(goal, coverage);

  const coveredIds = new Set(coverage.covered.map((a) => a.shortId));
  const values = accountValues(rows, analytics.series, returnRate, fhsaCloseYear);
  const scoped = values.filter((v) => coveredIds.has(v.accountId));

  const targetIndex = rows.findIndex((row) => row.year === goal.by);
  const startRow = rows[0];
  const targetRow = rows[targetIndex];
  if (targetIndex === -1 || startRow === undefined || targetRow === undefined) {
    return unprojectable(goal, coverage);
  }

  let projected = 0;
  for (const series of scoped) projected += series.values[targetIndex] ?? 0;
  const gap = projected - goal.target;

  if (gap >= 0) {
    return { goal, projected, gap, monthlyToClose: null, blocked: null, coverage };
  }

  if (!scopeHasRoom(coverage.covered, targetRow)) {
    return {
      goal,
      projected,
      gap,
      monthlyToClose: null,
      blocked: `${goal.label}'s account has no CRA room left by ${goal.by}, so an extra contribution cannot close this shortfall.`,
      coverage,
    };
  }

  const years = Math.max(1, Number(targetRow.year) - Number(startRow.year) + 1);
  const annual = contributionToClose(gap, years, returnRate);
  return { goal, projected, gap, monthlyToClose: annual / 12, blocked: null, coverage };
}
