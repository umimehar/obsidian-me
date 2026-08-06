export type CheckName =
  | "statement-arithmetic"
  | "missing-portfolio"
  | "cash-continuity"
  | "coverage-gap"
  | "cross-document"
  | "superseded"
  | "kind-drift"
  | "style-drift"
  | "balance-chain"
  | "return-direction"
  | "ingest"
  | "ground-truth";

export interface Finding {
  check: CheckName;
  severity: "error" | "warning";
  accountShortId: string;
  period: string;
  message: string;
  expected: number | null;
  actual: number | null;
  delta: number | null;
  sourceFile: string;
}

/**
 * A finding as it reaches `reconciliation.json`, and through it the UI:
 * the check's own output plus whether `corrections.ts` acknowledges it.
 *
 * The annotation lives on the finding rather than in the renderer because
 * acknowledgement is a property of the finding, not of how it is drawn. The
 * dashboard reads its committed artifacts and never re-derives them, so if
 * the reason were not written here the view could only get it by importing
 * `corrections.ts` and repeating the match.
 */
export interface ReportedFinding extends Finding {
  acknowledged: boolean;
  /** The acknowledgement's reason, or null when the finding is not acknowledged. Never an empty string. */
  reason: string | null;
}

export interface ReconciliationReport {
  generated: string;
  statementCount: number;
  findings: ReportedFinding[];
}

/** Statements print to the cent, so a cent of slack is enough. */
export const TOLERANCE = 0.011;

export function within(a: number, b: number, tolerance = TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}
