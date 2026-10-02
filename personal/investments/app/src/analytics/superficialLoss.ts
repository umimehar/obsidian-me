import type { Statement } from "../types";
import { PERSONAL_NONREG_KINDS } from "./accountScopes";
import type { SaleDetail } from "./income";
import type { AccountSeries } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * The superficial-loss rule's verdict for one loss sale. `"confirmed"`: a
 * replacement acquisition landed in the window AND identical property was
 * still held at the window's end. `"clear"`: the corpus has enough
 * statements to rule the sale out, either because no qualifying
 * replacement acquisition exists or because nothing was still held at the
 * window's end. `"pending"`: a statement needed to settle one of the two
 * conditions -- the window has not elapsed yet, or the account's statement
 * covering the window's end is not in the corpus yet -- is missing, so the
 * verdict cannot be reached.
 */
export type SuperficialLossStatus = "confirmed" | "clear" | "pending";

/**
 * One loss sale the superficial-loss rule may touch: the sale itself, the
 * 30-day window it opens, the verdict (see `SuperficialLossStatus`), and
 * the replacement acquisition that triggered it, when one was found.
 */
export interface SuperficialLossCandidate {
  sale: SaleDetail;
  windowStart: string;
  windowEnd: string;
  status: SuperficialLossStatus;
  /** The replacement BUY of the identical symbol that satisfies condition one. Null when no qualifying buy was found. */
  matchedBuy: { date: string; maskedId: string } | null;
}

interface SymbolBuy {
  symbol: string;
  date: string;
  maskedId: string;
}

/** Every `BUY` row in the corpus, across every account regardless of kind -- a replacement buy in a TFSA, RRSP or the spousal RRSP counts exactly as one in a personal non-registered account does. */
function allBuys(statements: readonly Statement[]): SymbolBuy[] {
  const buys: SymbolBuy[] = [];
  for (const s of statements) {
    if (s.source.template !== "BROKERAGE") continue;
    for (const row of s.activity) {
      if (row.code !== "BUY") continue;
      const match = /^(\S+) -/.exec(row.description)?.[1];
      if (match) buys.push({ symbol: match, date: row.date, maskedId: s.source.accountNo });
    }
  }
  return buys;
}

/** The latest activity date across every statement -- "as of" for deciding whether a sale's window has fully elapsed. */
export function latestStatementDate(statements: readonly Statement[]): string {
  let latest = "";
  for (const s of statements) {
    for (const row of s.activity) {
      if (row.date > latest) latest = row.date;
    }
  }
  return latest;
}

/** One account's BROKERAGE statements, oldest first by `periodEnd`. */
function statementsByAccount(statements: readonly Statement[]): Map<string, Statement[]> {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) {
    if (s.source.template !== "BROKERAGE") continue;
    const list = byAccount.get(s.source.accountNo) ?? [];
    list.push(s);
    byAccount.set(s.source.accountNo, list);
  }
  for (const list of byAccount.values())
    list.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  return byAccount;
}

/** `symbol`'s total quantity across a statement's holdings -- normally one row, summed defensively. */
function quantityOf(statement: Statement, symbol: string): number {
  let total = 0;
  for (const h of statement.holdings) {
    if (h.symbol === symbol) total += h.quantity;
  }
  return total;
}

/**
 * The first statement of `account` whose `periodEnd` is on or after
 * `target` -- a month-end approximation of the exact calendar date CRA's
 * rule actually asks for, since that is the finest grain a monthly
 * statement can state. Null when the account's statements have not
 * reached that far yet, the "not in the corpus yet" case the caller must
 * read as pending rather than absent.
 */
function firstStatementAtOrAfter(account: readonly Statement[], target: string): Statement | null {
  return account.find((s) => s.periodEnd >= target) ?? null;
}

/**
 * Whether a BUY counts toward condition one for `sale`. A buy strictly
 * after the sale date always counts -- it is unambiguously a fresh
 * acquisition. A buy in a DIFFERENT account on or before the sale date
 * also always counts, since it cannot be entangled with the lot that was
 * sold. A buy in the SAME account on or before the sale date counts only
 * when some of the symbol remained in that account immediately after the
 * sale (its closing holdings at the sale's own statement): when the whole
 * position was sold, that earlier buy was simply part of what got sold,
 * never a replacement.
 */
function buyCountsForCondition1(
  buy: SymbolBuy,
  sale: SaleDetail,
  byAccount: ReadonlyMap<string, Statement[]>,
): boolean {
  if (buy.date > sale.date) return true;
  if (buy.maskedId !== sale.maskedId) return true;
  const salePeriod = sale.date.slice(0, 7);
  const statement = (byAccount.get(sale.maskedId) ?? []).find(
    (s) => s.source.period === salePeriod,
  );
  if (!statement) return false;
  return quantityOf(statement, sale.symbol) > 1e-9;
}

/**
 * Whether identical property is still held at the window's end, in either
 * the sale's own account or the account a qualifying replacement buy
 * landed in. `null` when a needed statement is not in the corpus yet, so
 * the caller reads this as pending rather than a definite answer either
 * way.
 */
function stillOwnedAtWindowEnd(
  sale: SaleDetail,
  matchedBuy: { maskedId: string } | null,
  windowEnd: string,
  byAccount: ReadonlyMap<string, Statement[]>,
): boolean | null {
  const accountIds = new Set([sale.maskedId, ...(matchedBuy ? [matchedBuy.maskedId] : [])]);
  let anyCoverageMissing = false;
  for (const accountId of accountIds) {
    const statement = firstStatementAtOrAfter(byAccount.get(accountId) ?? [], windowEnd);
    if (statement === null) {
      anyCoverageMissing = true;
      continue;
    }
    if (quantityOf(statement, sale.symbol) > 1e-9) return true;
  }
  return anyCoverageMissing ? null : false;
}

/** One sale's verdict: the window, the matched replacement buy (if any) and the status both conditions settle on -- the per-sale body `superficialLossWatch`'s loop calls once per candidate. */
function evaluateSale(
  sale: SaleDetail,
  buys: readonly SymbolBuy[],
  byAccount: ReadonlyMap<string, Statement[]>,
  asOf: string,
): SuperficialLossCandidate {
  const windowStart = addDays(sale.date, -WINDOW_DAYS);
  const windowEnd = addDays(sale.date, WINDOW_DAYS);
  const windowOpen = daysBetween(windowEnd, asOf) < 0;

  // A buy strictly after the sale, or in a different account, is
  // unambiguous evidence on its own; a same-account buy on or before the
  // sale date is the one case `buyCountsForCondition1` has to reason
  // about via a month-end snapshot, which a later trade that same month
  // can contaminate. Trying the unambiguous ones first means the reported
  // `matchedBuy` is the clean trigger whenever one exists, rather than an
  // earlier buy that only looks valid because of a LATER trade's effect
  // on the same snapshot.
  const priority = (b: SymbolBuy): number => {
    if (b.date > sale.date) return 0;
    if (b.maskedId !== sale.maskedId) return 1;
    return 2;
  };
  const candidateBuys = buys
    .filter((b) => b.symbol === sale.symbol && b.date >= windowStart && b.date <= windowEnd)
    .sort((a, b) => priority(a) - priority(b));
  const matchedBuyRow = candidateBuys.find((b) => buyCountsForCondition1(b, sale, byAccount));
  const matchedBuy = matchedBuyRow
    ? { date: matchedBuyRow.date, maskedId: matchedBuyRow.maskedId }
    : null;

  let status: SuperficialLossStatus;
  if (matchedBuy === null) {
    status = windowOpen ? "pending" : "clear";
  } else {
    const stillOwned = stillOwnedAtWindowEnd(sale, matchedBuy, windowEnd, byAccount);
    status = stillOwned === null ? "pending" : stillOwned ? "confirmed" : "clear";
  }

  return { sale, windowStart, windowEnd, status, matchedBuy };
}

/**
 * The superficial-loss watch: every loss sale in the personal
 * non-registered/Crypto scope the caller passes in via `sales`, evaluated
 * against both halves of the rule -- a replacement acquisition in
 * [sale-30d, sale+30d], across every account regardless of kind (TFSA,
 * RRSP and the spousal RRSP included), AND identical property still held
 * at the window's end. See `SuperficialLossStatus` for the three verdicts
 * and `evaluateSale` for one sale's own logic.
 *
 * This never computes the denied amount: CRA's formula needs the exact
 * replacement shares still held, which a monthly statement cannot state
 * precisely. It settles whether the loss is superficial at all and leaves
 * the amount to the owner.
 */
export function superficialLossWatch(
  statements: readonly Statement[],
  series: readonly AccountSeries[],
  sales: readonly SaleDetail[],
): SuperficialLossCandidate[] {
  const personalIds = new Set(
    series.filter((a) => PERSONAL_NONREG_KINDS.has(a.kind)).map((a) => a.maskedId),
  );
  const buys = allBuys(statements);
  const byAccount = statementsByAccount(statements);
  const asOf = latestStatementDate(statements);

  const candidates = sales
    .filter((sale) => sale.gain < 0 && personalIds.has(sale.maskedId))
    .map((sale) => evaluateSale(sale, buys, byAccount, asOf));
  return candidates.sort((a, b) => a.sale.date.localeCompare(b.sale.date));
}
