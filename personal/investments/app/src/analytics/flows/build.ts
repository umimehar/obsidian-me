import type { Datastore } from "../../store/datastore";
import { closedPeriod } from "../../store/registry";
import { classifyStatement, collectSuspectSymbols } from "./classify";
import { matchTransfers } from "./match";
import { buildCashBlocks } from "./reconcile";
import { selectFlowStatements } from "./select";
import type { FlowAccount, FlowsData } from "./types";

/**
 * Closed rather than merely behind: an owner-declared closing period exists
 * and the account has not reported past it. Pure and decoupled from the
 * registry lookup so the comparison itself is directly testable without an
 * entry in the real (today empty) `CLOSED_ACCOUNTS` map. A $0 balance is
 * never used to infer closure -- a live pass-through chequing account sits
 * at $0 between movements, and inferring closure from that would let
 * `missingAccounts` stop naming it the first month its statement is simply
 * late.
 */
export function isClosedAsOf(closingPeriod: string | null, lastPeriod: string): boolean {
  return closingPeriod !== null && closingPeriod <= lastPeriod;
}

function toFlowAccount(a: Datastore["accounts"][number]): FlowAccount {
  return {
    accountId: a.maskedId,
    shortId: a.shortId,
    label: a.label,
    kind: a.kind,
    purpose: a.purpose,
    inTotals: a.inTotals,
    firstPeriod: a.firstPeriod,
    lastPeriod: a.lastPeriod,
    closed: isClosedAsOf(closedPeriod(a.shortId), a.lastPeriod),
  };
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

  return {
    generated: datastore.meta.generated,
    accounts: datastore.accounts.map(toFlowAccount),
    rows,
    blocks: buildCashBlocks(statements, rows),
    suspectSymbols: collectSuspectSymbols(statements),
  };
}
