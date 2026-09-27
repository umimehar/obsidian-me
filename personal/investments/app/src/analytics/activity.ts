import type { ActivityRow, Statement } from "../types";

/**
 * One account-month's activity income and costs, in CAD.
 *
 * Row sides checked against the real corpus (`jq` over `data/datastore.json`,
 * 2026-09-27): DIV, INT and FPLINT post their income to `credit`; NRT posts
 * its tax to `debit`; FEE posts a charge to `debit` and an ETF rebate to
 * `credit`, so reading `debit` alone keeps the rebate out of a "fees paid"
 * figure; FXCONVERSION rows use either side depending on direction, so only
 * the row count is kept.
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
 * row passes through unchanged. Review Focus line 4: USD activity rows are
 * never summed raw with CAD rows, and a USD row on a statement with no
 * disclosed rate throws naming the statement rather than silently treating
 * it as CAD.
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
      return { ...ZERO_TOTALS, dividends: convertToCad(row.credit, row, statement) };
    case "INT":
      return { ...ZERO_TOTALS, interest: convertToCad(row.credit, row, statement) };
    case "FPLINT":
      return { ...ZERO_TOTALS, lendingIncome: convertToCad(row.credit, row, statement) };
    case "NRT":
      return { ...ZERO_TOTALS, withholdingTax: convertToCad(row.debit, row, statement) };
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
 * drop them. The row amounts are converted with `convertToCad` before being
 * added, never after -- summing raw USD and CAD figures together is exactly
 * the mistake Review Focus line 4 exists to catch.
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
