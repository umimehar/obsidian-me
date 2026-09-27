import type { ReportedFinding } from "../../validate/report";

export interface BookCostDivergence {
  /** Distinct statements whose book cost does not reconcile. */
  statementCount: number;
  /** The largest of those divergences, in dollars. */
  maxDelta: number;
}

/**
 * How far, and on how many statements, book cost fails to reconcile --
 * derived from the reconciliation report the page already loads.
 *
 * `CostGapChart`'s caveat stated these as two literals in its prose ("19
 * statements, by up to $218.92"). Both went stale the first time a month was
 * imported: the real figures moved to 21 and $279.94 while the callout kept
 * announcing 19 and $218.92 to the reader. A caveat whose whole job is to
 * say how approximate a figure is cannot itself be a stale figure, so it is
 * computed rather than written down.
 *
 * Keyed on the check's own message rather than on the check name: a
 * `statement-arithmetic` finding covers several distinct arithmetic
 * failures, and only the book-cost ones belong in this caveat.
 */
export function bookCostDivergence(findings: readonly ReportedFinding[]): BookCostDivergence {
  const matches = findings.filter((finding) => finding.message.includes("book cost differs by"));
  const statements = new Set(
    matches.map((finding) => `${finding.accountShortId}:${finding.period}`),
  );
  const deltas = matches.map((finding) => Math.abs(finding.delta ?? 0));
  return {
    statementCount: statements.size,
    maxDelta: deltas.length === 0 ? 0 : Math.max(...deltas),
  };
}
