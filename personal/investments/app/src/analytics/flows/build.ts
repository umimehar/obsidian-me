import type { Datastore } from "../../store/datastore";
import type { AccountRecord } from "../../store/registry";
import type { Statement } from "../../types";
import { classifyStatement } from "./classify";
import { matchTransfers } from "./match";
import { buildCashBlocks } from "./reconcile";
import { selectFlowStatements } from "./select";
import type { FlowsData } from "./types";

/** The account's latest statement carries $0 -- portfolio market value, or cash closings on CASH. */
function statementIsEmpty(statement: Statement): boolean {
  if (statement.source.template === "CASH") {
    return statement.cash.length > 0 && statement.cash.every((c) => c.closing === 0);
  }
  // A null portfolio (a Chequing account's BROKERAGE twin, which carries no
  // securities) means "unknown", never "zero" -- an account can only be
  // closed by a statement that actually states a $0 total.
  return statement.portfolio !== null && statement.portfolio.totalMarketValue === 0;
}

/** The latest statement per account, by period, among the ones the flow build actually selects. */
function latestStatementByAccount(statements: readonly Statement[]): Map<string, Statement> {
  const latest = new Map<string, Statement>();
  for (const s of statements) {
    const current = latest.get(s.source.accountNo);
    if (current === undefined || s.source.period > current.source.period) {
      latest.set(s.source.accountNo, s);
    }
  }
  return latest;
}

/**
 * Closed rather than merely behind: the account's latest statement states
 * a $0 balance, and its own `lastPeriod` already trails the corpus's
 * latest period across every account -- so this is not simply an import
 * that has not reached that account's next month yet.
 */
function isClosedAccount(
  account: AccountRecord,
  statement: Statement | undefined,
  corpusLatest: string,
): boolean {
  if (statement === undefined) return false;
  if (account.lastPeriod >= corpusLatest) return false;
  return statementIsEmpty(statement);
}

export function buildFlows(datastore: Datastore): FlowsData {
  const accounts = new Map(datastore.accounts.map((a) => [a.maskedId, a]));
  const statements = selectFlowStatements(datastore.statements);
  const classified = statements.flatMap((s) => {
    const account = accounts.get(s.source.accountNo);
    if (account === undefined) throw new Error(`${s.source.file}: account not in the registry`);
    return classifyStatement(s, account);
  });
  const rows = matchTransfers(classified);
  const latestStatements = latestStatementByAccount(statements);
  const corpusLatest = datastore.accounts.reduce(
    (max, a) => (a.lastPeriod > max ? a.lastPeriod : max),
    "",
  );

  return {
    generated: datastore.meta.generated,
    accounts: datastore.accounts.map((a) => ({
      accountId: a.maskedId,
      shortId: a.shortId,
      label: a.label,
      kind: a.kind,
      purpose: a.purpose,
      inTotals: a.inTotals,
      firstPeriod: a.firstPeriod,
      lastPeriod: a.lastPeriod,
      closed: isClosedAccount(a, latestStatements.get(a.maskedId), corpusLatest),
    })),
    rows,
    blocks: buildCashBlocks(statements, rows),
  };
}
