import type { AccountRecord } from "../store/registry";
import type { Statement } from "../types";
import type { AccountSeries, MonthPoint } from "./types";

function buildMonthPoint(s: Statement): MonthPoint {
  const cadCash = s.cash.find((c) => c.currency === "CAD") ?? null;
  return {
    period: s.source.period,
    marketValue: s.portfolio?.totalMarketValue ?? null,
    bookCost: s.portfolio?.totalBookCost ?? null,
    cashBalance: cadCash?.closing ?? null,
    deposits: cadCash?.paidIn?.deposits ?? 0,
    withdrawals: cadCash?.paidOut?.withdrawals ?? 0,
    contributions: 0, // task 2: delta between consecutive stated year-to-date contribution figures
    grants: 0, // task 2: summed from GRANT/CLB activity credits
  };
}

/**
 * Picks, for one account, the one statement per period that carries a
 * `MonthPoint`. PERFORMANCE is dropped entirely -- it duplicates its
 * BROKERAGE twin's portfolio and would double-count. A CASH-template
 * statement is used only when no BROKERAGE statement covers the same
 * period, since a chequing account has cash but never a portfolio.
 */
function pickStatementsByPeriod(statements: readonly Statement[]): Statement[] {
  const byPeriod = new Map<string, Statement>();
  for (const s of statements) {
    if (s.source.template === "PERFORMANCE") continue;
    const existing = byPeriod.get(s.source.period);
    if (!existing || s.source.template === "BROKERAGE") {
      byPeriod.set(s.source.period, s);
    }
  }
  return [...byPeriod.values()].sort((a, b) => a.source.period.localeCompare(b.source.period));
}

/**
 * One `AccountSeries` per registry account, each holding one `MonthPoint`
 * per period that has a statement. A period with no statement is simply
 * absent -- never zero-filled -- so a gap in the corpus stays visible as a
 * gap in the series.
 */
export function buildSeries(
  statements: readonly Statement[],
  accounts: readonly AccountRecord[],
): AccountSeries[] {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) {
    const list = byAccount.get(s.source.accountNo) ?? [];
    list.push(s);
    byAccount.set(s.source.accountNo, list);
  }

  return accounts.map((account) => ({
    maskedId: account.maskedId,
    shortId: account.shortId,
    kind: account.kind,
    style: account.style,
    purpose: account.purpose,
    inTotals: account.inTotals,
    months: pickStatementsByPeriod(byAccount.get(account.maskedId) ?? []).map(buildMonthPoint),
  }));
}
