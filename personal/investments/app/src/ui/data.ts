import rawAnalytics from "@data/analytics.json";
import rawBenchmark from "@data/benchmark.json";
import rawCards from "@data/cards.json";
import rawCheckpoints from "@data/checkpoints.json";
import rawCoverage from "@data/coverage.json";
import rawFlows from "@data/flows.json";
import rawReconciliation from "@data/reconciliation.json";
import type { AnalyticsOutput } from "../analytics/build";
import type { Coverage } from "../analytics/coverage";
import type { FlowsData } from "../analytics/flows/types";
import type { Lens } from "../analytics/rollup";
import type { CardStatement } from "../ingest/card";
import type { BenchmarkData } from "../tools/benchmark";
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
    typeof candidate.activity === "object" &&
    typeof candidate.statedFees === "object" &&
    typeof candidate.holdings === "object"
  );
}

export function parseAnalytics(raw: unknown): AnalyticsOutput {
  if (!isAnalyticsOutput(raw)) {
    throw new Error(
      "analytics.json is missing one of meta, series, rooms, income, returns, rollups, " +
        "activity, statedFees, holdings",
    );
  }
  return raw;
}

/** The real committed payload, parsed once at module load. */
export function loadAnalytics(): AnalyticsOutput {
  return parseAnalytics(rawAnalytics);
}

/**
 * A narrow structural check on the raw `flows.json` import, the same shape
 * `isAnalyticsOutput` checks its own file with: it never trusts the file's
 * shape with an unchecked cast, and the nested figures are exercised by
 * the flows corpus tests against the real committed file, not re-validated
 * here.
 */
function isFlowsData(value: unknown): value is FlowsData {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.generated === "string" &&
    Array.isArray(candidate.accounts) &&
    Array.isArray(candidate.rows) &&
    Array.isArray(candidate.blocks)
  );
}

export function parseFlows(raw: unknown): FlowsData {
  if (!isFlowsData(raw)) {
    throw new Error("flows.json is missing one of generated, accounts, rows, blocks");
  }
  return raw;
}

/** The real committed payload, parsed once at module load. */
export function loadFlows(): FlowsData {
  return parseFlows(rawFlows);
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

/** Names one checkpoint for an error: its index, plus its own `observed` date when it has one. */
function checkpointLabel(raw: unknown, index: number): string {
  const observed =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).observed : undefined;
  return typeof observed === "string" ? `checkpoint ${index} (${observed})` : `checkpoint ${index}`;
}

/**
 * `null` (not yet reconciled against a statement) and the field absent
 * entirely both mean the same thing and are both accepted; anything else
 * shaped wrong throws naming the field, so a typo in the owner's own
 * hand-edited file is caught here rather than read back as a wrong figure.
 */
function parseCheckpointReconciliation(raw: unknown, label: string): Checkpoint["reconciliation"] {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") {
    throw new Error(`${label}: reconciliation is not an object`);
  }
  const c = raw as Record<string, unknown>;
  for (const field of ["ourTotal", "appVisibleTotal", "difference"] as const) {
    if (typeof c[field] !== "number") {
      throw new Error(`${label}: reconciliation.${field} is not a number`);
    }
  }
  return {
    ourTotal: c.ourTotal as number,
    appVisibleTotal: c.appVisibleTotal as number,
    difference: c.difference as number,
  };
}

function parseCheckpoint(raw: unknown, index: number): Checkpoint {
  const label = checkpointLabel(raw, index);
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${label}: is not an object`);
  }
  const c = raw as Record<string, unknown>;
  if (typeof c.coversPeriod !== "string") {
    throw new Error(`${label}: coversPeriod is not a string`);
  }
  return {
    coversPeriod: c.coversPeriod,
    reconciliation: parseCheckpointReconciliation(c.reconciliation, label),
  };
}

/**
 * The owner-recorded checkpoints, for This month's "app against statements"
 * line. A malformed checkpoint throws naming its index (and `observed` date,
 * when the entry carries one) and the bad field, rather than being dropped
 * silently: a hand-edited file with a typo should fail loudly, the same as
 * every other committed artifact this file loads.
 */
export function parseCheckpoints(raw: unknown): Checkpoint[] {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("checkpoints.json is not an object");
  }
  const { checkpoints } = raw as { checkpoints?: unknown };
  if (!Array.isArray(checkpoints)) {
    throw new Error("checkpoints.json is missing its checkpoints array");
  }
  return checkpoints.map((c, index) => parseCheckpoint(c, index));
}

export function loadCheckpoints(): Checkpoint[] {
  return parseCheckpoints(rawCheckpoints);
}

/**
 * `bun run benchmark`'s committed output, checked the same way every other
 * committed artifact here is: a missing field throws naming it, rather than
 * a chart silently drawing from `undefined`.
 */
export function parseBenchmark(raw: unknown): BenchmarkData {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("benchmark.json is not an object; run bun run benchmark");
  }
  const { symbol, fetched, closes } = raw as Record<string, unknown>;
  if (typeof symbol !== "string" || typeof fetched !== "string") {
    throw new Error("benchmark.json is missing symbol or fetched; run bun run benchmark");
  }
  if (typeof closes !== "object" || closes === null) {
    throw new Error("benchmark.json is missing its closes map; run bun run benchmark");
  }
  for (const value of Object.values(closes)) {
    if (typeof value !== "number") {
      throw new Error("benchmark.json has a non-numeric close; run bun run benchmark");
    }
  }
  return { symbol, fetched, closes: closes as Record<string, number> };
}

export function loadBenchmark(): BenchmarkData {
  return parseBenchmark(rawBenchmark);
}
