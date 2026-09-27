import { dedupeToLatestVersion } from "../build";
import type { Statement } from "../types";
import { convertAmountToCad } from "./activity";

/** period ("YYYY-MM") -> maskedId -> that account-month's fees, as the cash summary states them. */
export type StatedFeesByPeriod = Record<string, Record<string, number>>;

/**
 * One statement's own printed fee figure, from every cash currency block's
 * `paidOut.fees`, converted to CAD and summed. Distinct from `activity.ts`'s
 * `fees`, which reads only `FEE`/`REIMB` coded activity rows: an account
 * that bundles a trading cost into a trade's own price rather than
 * itemising it as a fee can state a nonzero figure here with nothing at all
 * on the activity side -- see `feeReconciliation.ts`.
 */
function statedFeesForStatement(statement: Statement): number {
  let total = 0;
  for (const cash of statement.cash) {
    if (!cash.paidOut) continue;
    total += convertAmountToCad(cash.paidOut.fees, cash.currency, statement);
  }
  return total;
}

/**
 * Stated fees per period per account, over every BROKERAGE and CASH
 * statement. PERFORMANCE statements are skipped, the same reason
 * `buildActivity` skips them: they duplicate their BROKERAGE twin's own
 * figures.
 */
export function buildStatedFees(rawStatements: readonly Statement[]): StatedFeesByPeriod {
  const statements = dedupeToLatestVersion(rawStatements);
  const byPeriod: StatedFeesByPeriod = {};
  for (const statement of statements) {
    if (statement.source.template === "PERFORMANCE") continue;
    const period = statement.source.period;
    const accountId = statement.source.accountNo;
    const byAccount = byPeriod[period] ?? {};
    byAccount[accountId] = (byAccount[accountId] ?? 0) + statedFeesForStatement(statement);
    byPeriod[period] = byAccount;
  }
  return byPeriod;
}
