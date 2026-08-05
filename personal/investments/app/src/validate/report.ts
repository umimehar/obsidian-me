export type CheckName =
  | "statement-arithmetic"
  | "missing-portfolio"
  | "cash-continuity"
  | "coverage-gap"
  | "cross-document"
  | "superseded"
  | "kind-drift"
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

export interface ReconciliationReport {
  generated: string;
  statementCount: number;
  findings: Finding[];
}

/** Statements print to the cent, so a cent of slack is enough. */
export const TOLERANCE = 0.011;

export function within(a: number, b: number, tolerance = TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}
