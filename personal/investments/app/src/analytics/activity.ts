import { dedupeToLatestVersion } from "../statementVersion";
import type { ActivityRow, Currency, Statement } from "../types";

/**
 * One account-month's activity income and costs, in CAD.
 *
 * DIV, INT and FPLINT income nets `credit - debit`: an amended statement can
 * carry a reversal on the opposite side of an earlier row, and the true
 * figure is the pair netted, not the credit alone. NRT nets `debit - credit`
 * for the same reason. FEE nets `debit - credit` too: a small credit-side
 * ETF rebate on the same code is a real reduction of what was actually
 * charged, not a different kind of row (see `validate/checks.ts`'s
 * `explainRebateNetting`, which documents the same statement-side quirk).
 * REIMB nets the same way, restricted to rows recognisable as a fee refund
 * (see `isFeeRefund`); this is what reconciles fees to the statements' own
 * figure -- see `feeReconciliation.ts` for the one account whose statements
 * still do not reconcile, because its trading costs are bundled into a
 * trade's own price rather than itemised at all. FXCONVERSION uses either
 * side depending on direction for the row count, and the CAD side alone for
 * the amount, so a conversion is valued once rather than on both legs.
 * Chequing accounts carried BROKERAGE statements with coded INT rows through
 * 2026-06; from 2026-07 they send only a CASH statement, which -- like every
 * CASH statement -- carries no activity code at all, so interest earned
 * after that point is invisible here. That gap is real but recent, not the
 * whole of chequing's history.
 */
export interface ActivityTotals {
  dividends: number;
  interest: number;
  lendingIncome: number;
  withholdingTax: number;
  fees: number;
  fxConversions: number;
  /** The CAD side of every FXCONVERSION pair -- one conversion valued once, not both legs. */
  fxConversionAmount: number;
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
  fxConversionAmount: 0,
};

/**
 * A USD amount converted to CAD at the statement's own `fxRate`. A CAD
 * amount passes through unchanged. A USD amount on a statement with no
 * disclosed rate throws naming the statement, rather than silently treating
 * it as CAD. Shared by every caller that converts a statement figure,
 * activity row or cash-summary line alike -- see `statedFees.ts`.
 */
export function convertAmountToCad(
  amount: number,
  currency: Currency,
  statement: Statement,
): number {
  if (currency === "CAD") return amount;
  if (statement.fxRate === null) {
    throw new Error(`${statement.source.file}: USD amount with no statement fxRate`);
  }
  return amount * statement.fxRate;
}

/** `convertAmountToCad` for one activity row, naming the row's own code when it throws. */
export function convertToCad(amount: number, row: ActivityRow, statement: Statement): number {
  try {
    return convertAmountToCad(amount, row.currency, statement);
  } catch {
    throw new Error(
      `${statement.source.file}: USD activity row (${row.code}) with no statement fxRate`,
    );
  }
}

/**
 * `credit - debit`, converted to CAD -- the reversal netting rule for `DIV`,
 * `INT` and `FPLINT`: an amended statement can carry a reversal on the
 * opposite side of an earlier row, and the true figure is the pair netted.
 * Shared with `income.ts` so the rule lives once.
 */
export function netCreditDebit(row: ActivityRow, statement: Statement): number {
  return convertToCad(row.credit - row.debit, row, statement);
}

/** `debit - credit`, converted to CAD -- the same netting rule, the other way round, for `NRT`. */
export function netDebitCredit(row: ActivityRow, statement: Statement): number {
  return convertToCad(row.debit - row.credit, row, statement);
}

/**
 * A `REIMB` row recognisable as a fee refund rather than something else the
 * same code might carry: the two wordings seen in the corpus so far, "ETF
 * Rebate" and "ACCOUNTING_REIMBURSEMENT" (see `validate/checks.ts`'s own
 * `explainRebateNetting`, which documents the identical statement-side
 * quirk). A `REIMB` row that matches neither is left out of `fees`
 * entirely -- excluded, not guessed at -- rather than netted in on the
 * assumption every `REIMB` row is a fee refund.
 */
function isFeeRefund(row: ActivityRow): boolean {
  return /ETF Rebate|ACCOUNTING_REIMBURSEMENT/i.test(row.description);
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
      return { ...ZERO_TOTALS, dividends: netCreditDebit(row, statement) };
    case "INT":
      return { ...ZERO_TOTALS, interest: netCreditDebit(row, statement) };
    case "FPLINT":
      return {
        ...ZERO_TOTALS,
        lendingIncome: netCreditDebit(row, statement),
      };
    case "NRT":
      return {
        ...ZERO_TOTALS,
        withholdingTax: netDebitCredit(row, statement),
      };
    case "FEE":
      return { ...ZERO_TOTALS, fees: netDebitCredit(row, statement) };
    case "REIMB":
      return isFeeRefund(row)
        ? { ...ZERO_TOTALS, fees: netDebitCredit(row, statement) }
        : ZERO_TOTALS;
    case "FXCONVERSION":
      return {
        ...ZERO_TOTALS,
        fxConversions: 1,
        fxConversionAmount: row.currency === "CAD" ? Math.abs(row.debit - row.credit) : 0,
      };
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
    fxConversionAmount: a.fxConversionAmount + b.fxConversionAmount,
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
 *
 * `dedupeToLatestVersion` runs first, defensively: the committed datastore is
 * already deduplicated before this function ever sees it, but an amended
 * statement lands beside its original in the archive (see `store/archive.ts`),
 * never on top of it, so a caller handed the archive's own raw statements --
 * or a future caller of this function that is not `analytics/build.ts` --
 * would otherwise double count whichever period was amended.
 */
export function buildActivity(rawStatements: readonly Statement[]): ActivityByPeriod {
  const statements = dedupeToLatestVersion(rawStatements);
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
