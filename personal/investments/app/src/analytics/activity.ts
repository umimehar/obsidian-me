import type { ActivityRow, Statement } from "../types";

/**
 * One account-month's activity income and costs, in CAD.
 *
 * DIV, INT and FPLINT income nets `credit - debit`: an amended statement can
 * carry a reversal on the opposite side of an earlier row, and the true
 * figure is the pair netted, not the credit alone. NRT nets `debit - credit`
 * for the same reason. FEE stays debit-only: its credit side is an ETF
 * rebate, a different kind of row, not a reversal of a fee. FXCONVERSION
 * uses either side depending on direction, so only the row count is kept.
 * Chequing accounts' CASH-template rows carry no code at all, so their
 * interest is invisible here -- a known gap, not a bug in this module.
 */
export interface ActivityTotals {
  dividends: number;
  interest: number;
  lendingIncome: number;
  withholdingTax: number;
  fees: number;
  fxConversions: number;
}

/** period ("YYYY-MM") -> maskedId -> that account-month's activity totals. */
export type ActivityByPeriod = Record<string, Record<string, ActivityTotals>>;

const ZERO_TOTALS: ActivityTotals = {
  dividends: 0,
  interest: 0,
  lendingIncome: 0,
  withholdingTax: 0,
  fees: 0,
  fxConversions: 0,
};

/**
 * A USD row's amount converted to CAD at the statement's own `fxRate`. A CAD
 * row passes through unchanged. A USD row on a statement with no disclosed
 * rate throws naming the statement, rather than silently treating it as CAD.
 */
function convertToCad(amount: number, row: ActivityRow, statement: Statement): number {
  if (row.currency === "CAD") return amount;
  if (statement.fxRate === null) {
    throw new Error(
      `${statement.source.file}: USD activity row (${row.code}) with no statement fxRate`,
    );
  }
  return amount * statement.fxRate;
}

/**
 * One row's contribution to `ActivityTotals`, converted to CAD. `convertToCad`
 * is called only for the one field a row's own code actually feeds -- never
 * for every field unconditionally, or an unrelated USD `BUY`/`SELL` row on a
 * statement with no disclosed rate would throw over a figure it never touches.
 */
function totalsForRow(row: ActivityRow, statement: Statement): ActivityTotals {
  switch (row.code) {
    case "DIV":
      return { ...ZERO_TOTALS, dividends: convertToCad(row.credit - row.debit, row, statement) };
    case "INT":
      return { ...ZERO_TOTALS, interest: convertToCad(row.credit - row.debit, row, statement) };
    case "FPLINT":
      return {
        ...ZERO_TOTALS,
        lendingIncome: convertToCad(row.credit - row.debit, row, statement),
      };
    case "NRT":
      return {
        ...ZERO_TOTALS,
        withholdingTax: convertToCad(row.debit - row.credit, row, statement),
      };
    case "FEE":
      return { ...ZERO_TOTALS, fees: convertToCad(row.debit, row, statement) };
    case "FXCONVERSION":
      return { ...ZERO_TOTALS, fxConversions: 1 };
    default:
      return ZERO_TOTALS;
  }
}

function addTotals(a: ActivityTotals, b: ActivityTotals): ActivityTotals {
  return {
    dividends: a.dividends + b.dividends,
    interest: a.interest + b.interest,
    lendingIncome: a.lendingIncome + b.lendingIncome,
    withholdingTax: a.withholdingTax + b.withholdingTax,
    fees: a.fees + b.fees,
    fxConversions: a.fxConversions + b.fxConversions,
  };
}

/** Sums a list of `ActivityTotals`, all-zero for an empty list. */
export function sumActivity(rows: readonly ActivityTotals[]): ActivityTotals {
  return rows.reduce(addTotals, ZERO_TOTALS);
}

/**
 * Activity income and costs per period per account, over every BROKERAGE and
 * CASH statement. PERFORMANCE statements are skipped: they duplicate their
 * BROKERAGE twin's activity rows, the same reason `income.ts` and `rooms.ts`
 * drop them. Each row is converted to CAD before it is added to the running
 * total, never after -- summing raw USD and CAD figures together first.
 */
export function buildActivity(statements: readonly Statement[]): ActivityByPeriod {
  const byPeriod: ActivityByPeriod = {};
  for (const statement of statements) {
    if (statement.source.template === "PERFORMANCE") continue;
    const period = statement.source.period;
    const accountId = statement.source.accountNo;
    let total = ZERO_TOTALS;
    for (const row of statement.activity) {
      total = addTotals(total, totalsForRow(row, statement));
    }
    const byAccount = byPeriod[period] ?? {};
    byAccount[accountId] = addTotals(byAccount[accountId] ?? ZERO_TOTALS, total);
    byPeriod[period] = byAccount;
  }
  return byPeriod;
}
