import rawAnalytics from "@data/analytics.json";
import rawCards from "@data/cards.json";
import rawCheckpoints from "@data/checkpoints.json";
import rawCoverage from "@data/coverage.json";
import rawReconciliation from "@data/reconciliation.json";
import type { AnalyticsOutput } from "../analytics/build";
import type { Coverage } from "../analytics/coverage";
import type { Lens } from "../analytics/rollup";
import type { CardStatement } from "../ingest/card";
import type { ReconciliationReport, ReportedFinding } from "../validate/report";

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
    typeof candidate.rollups === "object" &&
    typeof candidate.activity === "object"
  );
}

export function parseAnalytics(raw: unknown): AnalyticsOutput {
  if (!isAnalyticsOutput(raw)) {
    throw new Error(
      "analytics.json is missing one of meta, series, rooms, income, returns, rollups, activity",
    );
  }
  return raw;
}

/** The real committed payload, parsed once at module load. */
export function loadAnalytics(): AnalyticsOutput {
  return parseAnalytics(rawAnalytics);
}

/** A figure a check could not compute stays null; it must never arrive as a zero. */
function isNumberOrNull(value: unknown): boolean {
  return value === null || typeof value === "number";
}

/**
 * A finding is only usable by the reconciliation view once it carries its
 * acknowledgement state, which `annotateFinding` in `build.ts` writes. A
 * report predating that stage would otherwise render every acknowledged
 * finding as an unexplained discrepancy, so the missing field is an error
 * rather than a default.
 */
function isReportedFinding(value: unknown): value is ReportedFinding {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.check === "string" &&
    typeof candidate.severity === "string" &&
    typeof candidate.accountShortId === "string" &&
    typeof candidate.period === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.sourceFile === "string" &&
    isNumberOrNull(candidate.expected) &&
    isNumberOrNull(candidate.actual) &&
    isNumberOrNull(candidate.delta) &&
    typeof candidate.acknowledged === "boolean" &&
    (candidate.reason === null || typeof candidate.reason === "string")
  );
}

export function parseReconciliation(raw: unknown): ReconciliationReport {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("reconciliation.json is not an object; run bun run build");
  }
  const { generated, statementCount, findings } = raw as Record<string, unknown>;
  if (typeof generated !== "string" || typeof statementCount !== "number") {
    throw new Error(
      "reconciliation.json is missing generated or statementCount; run bun run build",
    );
  }
  if (!Array.isArray(findings)) {
    throw new Error("reconciliation.json is missing its findings array; run bun run build");
  }
  if (!findings.every(isReportedFinding)) {
    throw new Error(
      "reconciliation.json has a finding without its acknowledged/reason fields; run bun run build",
    );
  }
  return { generated, statementCount, findings };
}

/** The real committed reconciliation report, parsed on every call. */
export function loadReconciliation(): ReconciliationReport {
  return parseReconciliation(rawReconciliation);
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

/**
 * The committed credit card statements.
 *
 * Deliberately its own loader with its own shape check: a card statement is
 * not an `AccountSeries` and must never reach anything that treats it as one.
 * A malformed file yields an empty list rather than throwing -- unlike
 * analytics.json, a missing card import leaves the rest of the dashboard
 * entirely correct, so it degrades to "no cards imported yet" instead of
 * taking the page down.
 */
export function loadCards(): CardStatement[] {
  if (typeof rawCards !== "object" || rawCards === null) return [];
  const { statements } = rawCards as { statements?: unknown };
  if (!Array.isArray(statements)) return [];
  return statements.filter(
    (s): s is CardStatement =>
      typeof s === "object" &&
      s !== null &&
      typeof (s as CardStatement).cardId === "string" &&
      typeof (s as CardStatement).newBalance === "number",
  );
}

/**
 * The statement coverage `bun run tracker` writes. Only the top-level shape is
 * checked here; `tracker.test.ts` proves the committed file matches the
 * datastore it was built from.
 */
export function parseCoverage(raw: unknown): Coverage {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("coverage.json is not an object; run bun run tracker");
  }
  const c = raw as Record<string, unknown>;
  if (
    typeof c.generated !== "string" ||
    typeof c.latestPeriod !== "string" ||
    !(c.latestComplete === null || typeof c.latestComplete === "string") ||
    !Array.isArray(c.accounts) ||
    !Array.isArray(c.months)
  ) {
    throw new Error("coverage.json is missing one of its fields; run bun run tracker");
  }
  return raw as Coverage;
}

export function loadCoverage(): Coverage {
  return parseCoverage(rawCoverage);
}

/**
 * A reading the owner took off the Wealthsimple app's own screen, compared
 * against the statements once they cover the same period. `reconciliation`
 * is null on a checkpoint not yet reconciled against a statement.
 */
export interface Checkpoint {
  coversPeriod: string;
  reconciliation: { ourTotal: number; appVisibleTotal: number; difference: number } | null;
}

function isReconciliation(
  value: unknown,
): value is { ourTotal: number; appVisibleTotal: number; difference: number } {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.ourTotal === "number" &&
    typeof c.appVisibleTotal === "number" &&
    typeof c.difference === "number"
  );
}

function isCheckpoint(value: unknown): value is Checkpoint {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.coversPeriod !== "string") return false;
  return c.reconciliation === undefined || isReconciliation(c.reconciliation);
}

/**
 * The owner-recorded checkpoints, for This month's "app against statements"
 * line. A malformed entry is dropped rather than thrown on -- a checkpoint is
 * a bonus reading, not something the rest of the dashboard depends on.
 */
export function loadCheckpoints(): Checkpoint[] {
  if (typeof rawCheckpoints !== "object" || rawCheckpoints === null) return [];
  const { checkpoints } = rawCheckpoints as { checkpoints?: unknown };
  if (!Array.isArray(checkpoints)) return [];
  return checkpoints
    .filter(isCheckpoint)
    .map((c) => ({ coversPeriod: c.coversPeriod, reconciliation: c.reconciliation ?? null }));
}
