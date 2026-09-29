import type { Datastore } from "../../store/datastore";
import { classifyStatement } from "./classify";
import { matchTransfers } from "./match";
import { buildCashBlocks } from "./reconcile";
import { selectFlowStatements } from "./select";
import type { FlowsData } from "./types";

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
    accounts: datastore.accounts.map((a) => ({
      accountId: a.maskedId,
      shortId: a.shortId,
      label: a.label,
      kind: a.kind,
      purpose: a.purpose,
      inTotals: a.inTotals,
      firstPeriod: a.firstPeriod,
      lastPeriod: a.lastPeriod,
    })),
    rows,
    blocks: buildCashBlocks(statements, rows),
  };
}
