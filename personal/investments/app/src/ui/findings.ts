import type { CheckName, ReportedFinding } from "../validate/report";

export interface FindingGroup {
  check: CheckName;
  findings: ReportedFinding[];
  errorCount: number;
  warningCount: number;
  acknowledgedCount: number;
}

/** An error sorts before a warning, everywhere -- group ordering and row ordering both. */
function severityRank(finding: ReportedFinding): number {
  return finding.severity === "error" ? 0 : 1;
}

function summarise(check: CheckName, findings: ReportedFinding[]): FindingGroup {
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return {
    check,
    findings: [...findings].sort(
      (a, b) => severityRank(a) - severityRank(b) || a.period.localeCompare(b.period),
    ),
    errorCount,
    warningCount: findings.length - errorCount,
    acknowledgedCount: findings.filter((f) => f.acknowledged).length,
  };
}

/**
 * Findings grouped by check, groups carrying an error first, then the
 * largest group. Nothing is filtered: an acknowledged finding stays in its
 * group and is counted, because the reason it is expected is worth reading
 * and a report that quietly drops what it has explained cannot be audited.
 */
export function groupFindings(findings: readonly ReportedFinding[]): FindingGroup[] {
  const byCheck = new Map<CheckName, ReportedFinding[]>();
  for (const finding of findings) {
    const bucket = byCheck.get(finding.check);
    if (bucket) bucket.push(finding);
    else byCheck.set(finding.check, [finding]);
  }

  return [...byCheck.entries()]
    .map(([check, bucket]) => summarise(check, bucket))
    .sort(
      (a, b) =>
        Number(a.errorCount === 0) - Number(b.errorCount === 0) ||
        b.findings.length - a.findings.length ||
        a.check.localeCompare(b.check),
    );
}

/**
 * The most recently observed whole-portfolio ground-truth line, or null when
 * the report has none. Latest wins because `truth.ts` accumulates one
 * observation per time the owner checked the app, and the headline is about
 * where the two figures stand today.
 */
export function groundTruthFinding(findings: readonly ReportedFinding[]): ReportedFinding | null {
  let latest: ReportedFinding | null = null;
  for (const finding of findings) {
    if (finding.check !== "ground-truth") continue;
    if (latest === null || finding.period > latest.period) latest = finding;
  }
  return latest;
}
