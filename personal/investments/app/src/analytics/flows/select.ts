import { dedupeToLatestVersion } from "../../statementVersion";
import type { Statement } from "../../types";

const key = (s: Statement) => `${s.source.accountNo}|${s.source.period}`;

/** One statement per account and month: BROKERAGE where it exists, CASH only where it does not. */
export function selectFlowStatements(statements: readonly Statement[]): Statement[] {
  const latest = dedupeToLatestVersion(statements).filter(
    (s) => s.source.template !== "PERFORMANCE",
  );
  const brokerage = new Set(latest.filter((s) => s.source.template === "BROKERAGE").map(key));
  return latest.filter((s) => s.source.template === "BROKERAGE" || !brokerage.has(key(s)));
}
