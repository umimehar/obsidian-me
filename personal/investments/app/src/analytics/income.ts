import type { AccountKind } from "../store/mask";
import type { ActivityRow, Holding, Statement } from "../types";
import { type ActivityByPeriod, buildActivity, convertToCad } from "./activity";
import type { AccountSeries } from "./types";

/**
 * The only kinds whose investment income is taxed in the owner's personal
 * hands. `Corporate` is deliberately absent: investment income inside a
 * corporation is taxed in the corporation and only reaches the owner when
 * dividended out, so it must never feed the personal estimate -- getting
 * this wrong once inflated 2026 eligible dividends from $202 to $645 (see
 * `KIND_OVERRIDES` in `../store/registry.ts`). Registered wrappers (TFSA,
 * RRSP, SpousalRRSP, FHSA, RESP) are absent too: income earned inside them
 * is not taxable as earned. `Chequing` is absent because it holds no
 * investments.
 */
const TAXABLE_KINDS: ReadonlySet<AccountKind> = new Set(["NonRegistered", "Crypto"]);

/**
 * The caller's account selection -- masked ids, mirroring the UI's
 * account-scope filter. It is a further restriction on top of
 * `TAXABLE_KINDS`, never a way around it: an account in `scope` that is not
 * one of the taxable kinds still contributes nothing.
 */
export type IncomeScope = ReadonlySet<string>;

export interface IncomeSummary {
  /** INT and FPLINT (securities lending), net of reversals, CAD. */
  interest: number;
  /** DIV on a security priced in CAD with no US tax withheld, net of reversals, CAD. */
  canadianDistributions: number;
  /** DIV on a USD priced security, or one an NRT row in the same statement withheld tax from, net of reversals, CAD. */
  foreignDividends: number;
  /** NRT, net of reversals, CAD, positive. A foreign tax credit, not an expense. */
  foreignTaxWithheld: number;
  /** Proceeds converted to CAD at the statement's own rate, minus average cost. */
  realizedGains: number;
  /** Sales with no cost basis at all: no preceding holding and no same period BUY for the symbol. */
  costUnknownSales: number;
}

function periodYear(period: string): number {
  return Number(period.slice(0, 4));
}

/** The taxable accounts (see `TAXABLE_KINDS`) that are also in the caller's `scope`. */
function taxableAccountIds(series: readonly AccountSeries[], scope: IncomeScope): Set<string> {
  const ids = new Set<string>();
  for (const account of series) {
    if (scope.has(account.maskedId) && TAXABLE_KINDS.has(account.kind)) {
      ids.add(account.maskedId);
    }
  }
  return ids;
}

/**
 * Interest and securities lending income, and foreign tax withheld, for the
 * taxable accounts in the target year -- read straight off `buildActivity`'s
 * per period, per account totals rather than re-deriving the reversal
 * netting rule a second time. `activity.ts` already nets `INT`/`FPLINT`
 * (`credit - debit`) and `NRT` (`debit - credit`) in CAD.
 */
function sumInterestAndWithholding(
  activity: ActivityByPeriod,
  taxableIds: ReadonlySet<string>,
  year: number,
): { interest: number; foreignTaxWithheld: number } {
  let interest = 0;
  let foreignTaxWithheld = 0;
  for (const [period, byAccount] of Object.entries(activity)) {
    if (periodYear(period) !== year) continue;
    for (const [accountId, totals] of Object.entries(byAccount)) {
      if (!taxableIds.has(accountId)) continue;
      interest += totals.interest + totals.lendingIncome;
      foreignTaxWithheld += totals.withholdingTax;
    }
  }
  return { interest, foreignTaxWithheld };
}

/**
 * The ticker at the front of a `BUY`, `SELL` or `DIV` row's description --
 * e.g. `"ENB - Enbridge Inc: Sold 12.0000 shares (executed at 2024-08-14)"`
 * yields `"ENB"`. Null for the description shapes ingest sometimes truncates
 * with no leading ticker at all.
 */
function parseRowSymbol(description: string): string | null {
  return /^(\S+) -/.exec(description)?.[1] ?? null;
}

/** A `BUY` or `SELL` row's symbol and quantity, parsed off its description. `verb` is "Bought" or "Sold". */
function parseTradeLot(
  row: ActivityRow,
  verb: "Bought" | "Sold",
): { symbol: string; quantity: number } | null {
  const symbol = parseRowSymbol(row.description);
  const quantityMatch = new RegExp(`${verb} ([\\d.]+)`).exec(row.description);
  if (!symbol || !quantityMatch?.[1]) return null;

  const quantity = Number(quantityMatch[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return { symbol, quantity };
}

function holdingsBySymbol(holdings: readonly Holding[]): Map<string, Holding> {
  const map = new Map<string, Holding>();
  for (const h of holdings) {
    if (h.symbol) map.set(h.symbol, h);
  }
  return map;
}

/** Every date an `NRT` row fires on, within one statement. */
function nrtDatesForStatement(s: Statement): ReadonlySet<string> {
  const dates = new Set<string>();
  for (const row of s.activity) {
    if (row.code === "NRT") dates.add(row.date);
  }
  return dates;
}

/**
 * Whether one `DIV` row is foreign source: the row itself is in USD, or its
 * symbol prices in USD on this statement's holdings, or -- when the symbol
 * cannot be resolved against a holding at all, the one case a `DIV` row
 * carries no currency or holding evidence of its own -- an `NRT` row fired
 * on the same date in the same statement, which only happens on a foreign
 * security. Everything else is a Canadian listed distribution.
 */
function isForeignDividend(
  row: ActivityRow,
  holdings: ReadonlyMap<string, Holding>,
  nrtDates: ReadonlySet<string>,
): boolean {
  if (row.currency === "USD") return true;
  const symbol = parseRowSymbol(row.description);
  const holding = symbol ? holdings.get(symbol) : undefined;
  if (holding) return holding.priceCurrency === "USD";
  return nrtDates.has(row.date);
}

interface DividendTotals {
  canadianDistributions: number;
  foreignDividends: number;
}

const ZERO_DIVIDENDS: DividendTotals = { canadianDistributions: 0, foreignDividends: 0 };

/** One statement's `DIV` rows, classified and netted (`credit - debit`), converted to CAD. */
function dividendTotalsForStatement(s: Statement): DividendTotals {
  const holdings = holdingsBySymbol(s.holdings);
  const nrtDates = nrtDatesForStatement(s);
  let canadianDistributions = 0;
  let foreignDividends = 0;

  for (const row of s.activity) {
    if (row.code !== "DIV") continue;
    const net = convertToCad(row.credit - row.debit, row, s);
    if (isForeignDividend(row, holdings, nrtDates)) foreignDividends += net;
    else canadianDistributions += net;
  }

  return { canadianDistributions, foreignDividends };
}

function sumDividends(
  statements: readonly Statement[],
  taxableIds: ReadonlySet<string>,
  year: number,
): DividendTotals {
  let canadianDistributions = 0;
  let foreignDividends = 0;
  for (const s of statements) {
    if (s.source.template === "PERFORMANCE") continue;
    if (!taxableIds.has(s.source.accountNo)) continue;
    if (periodYear(s.source.period) !== year) continue;
    const totals = dividendTotalsForStatement(s);
    canadianDistributions += totals.canadianDistributions;
    foreignDividends += totals.foreignDividends;
  }
  return { canadianDistributions, foreignDividends };
}

/**
 * A symbol's average cost per share from this statement's own `BUY` rows --
 * the cost basis for a sale that closes out a position bought and sold
 * inside the same monthly snapshot, where no preceding holding exists to
 * price it against. Null when the symbol has no `BUY` row this statement
 * either, which is the genuine cost unknown case.
 */
function sameStatementBuyCostPerShare(s: Statement, symbol: string): number | null {
  let quantity = 0;
  let costCad = 0;
  for (const row of s.activity) {
    if (row.code !== "BUY") continue;
    const lot = parseTradeLot(row, "Bought");
    if (!lot || lot.symbol !== symbol) continue;
    quantity += lot.quantity;
    costCad += convertToCad(row.debit, row, s);
  }
  return quantity > 0 ? costCad / quantity : null;
}

interface RowGain {
  gain: number;
  costUnknown: boolean;
}

const NO_GAIN: RowGain = { gain: 0, costUnknown: false };

/**
 * One `SELL` row's gain: proceeds (converted to CAD at the statement's own
 * `fxRate`) minus average cost per share times the quantity sold. Cost comes
 * from the holding as of the immediately preceding BROKERAGE statement when
 * one exists, or failing that from this statement's own `BUY` rows for the
 * symbol (a position opened and closed within one month). Only when neither
 * exists is the sale "cost unknown": it counts nothing toward the gain
 * rather than the zero a missing cost basis used to silently produce.
 */
function gainForRow(
  row: ActivityRow,
  s: Statement,
  priorHoldings: ReadonlyMap<string, Holding>,
): RowGain {
  if (row.code !== "SELL") return NO_GAIN;
  const lot = parseTradeLot(row, "Sold");
  if (!lot) return NO_GAIN;

  const proceedsCad = convertToCad(row.credit, row, s);
  const prior = priorHoldings.get(lot.symbol);
  if (prior && prior.quantity > 0) {
    const averageCostPerShare = prior.bookCost / prior.quantity;
    return { gain: proceedsCad - averageCostPerShare * lot.quantity, costUnknown: false };
  }

  const sameStatementCost = sameStatementBuyCostPerShare(s, lot.symbol);
  if (sameStatementCost !== null) {
    return { gain: proceedsCad - sameStatementCost * lot.quantity, costUnknown: false };
  }

  return { gain: 0, costUnknown: true };
}

interface StatementGain {
  gain: number;
  costUnknownCount: number;
}

function realizedGainForStatement(
  s: Statement,
  priorHoldings: ReadonlyMap<string, Holding>,
): StatementGain {
  let gain = 0;
  let costUnknownCount = 0;
  for (const row of s.activity) {
    const r = gainForRow(row, s, priorHoldings);
    gain += r.gain;
    if (r.costUnknown) costUnknownCount += 1;
  }
  return { gain, costUnknownCount };
}

/**
 * One account's realized gains and cost unknown count for `year`, walking
 * every BROKERAGE statement in order so `priorHoldings` always reflects the
 * immediately preceding one -- see `gainForRow`.
 */
function realizedGainForAccount(
  statements: readonly Statement[],
  accountId: string,
  year: number,
): StatementGain {
  const brokerage = statements
    .filter((s) => s.source.accountNo === accountId && s.source.template === "BROKERAGE")
    .sort((a, b) => a.source.period.localeCompare(b.source.period));

  let gain = 0;
  let costUnknownCount = 0;
  let priorHoldings = new Map<string, Holding>();

  for (const s of brokerage) {
    if (periodYear(s.source.period) === year) {
      const result = realizedGainForStatement(s, priorHoldings);
      gain += result.gain;
      costUnknownCount += result.costUnknownCount;
    }
    priorHoldings = holdingsBySymbol(s.holdings);
  }

  return { gain, costUnknownCount };
}

function sumRealizedGains(
  statements: readonly Statement[],
  taxableIds: ReadonlySet<string>,
  year: number,
): { realizedGains: number; costUnknownSales: number } {
  let realizedGains = 0;
  let costUnknownSales = 0;
  for (const accountId of taxableIds) {
    const result = realizedGainForAccount(statements, accountId, year);
    realizedGains += result.gain;
    costUnknownSales += result.costUnknownCount;
  }
  return { realizedGains, costUnknownSales };
}

/**
 * Income by type and realized gains for one calendar year, over the
 * accounts that are both in `scope` and one of `TAXABLE_KINDS`. `Corporate`
 * and every registered wrapper are excluded regardless of `scope` -- see
 * `TAXABLE_KINDS`.
 */
export function buildIncome(
  series: readonly AccountSeries[],
  statements: readonly Statement[],
  year: number,
  scope: IncomeScope,
): IncomeSummary {
  const taxableIds = taxableAccountIds(series, scope);
  const activity = buildActivity(statements);
  const { interest, foreignTaxWithheld } = sumInterestAndWithholding(activity, taxableIds, year);
  const { canadianDistributions, foreignDividends } = sumDividends(statements, taxableIds, year);
  const { realizedGains, costUnknownSales } = sumRealizedGains(statements, taxableIds, year);
  return {
    interest,
    canadianDistributions,
    foreignDividends,
    foreignTaxWithheld,
    realizedGains,
    costUnknownSales,
  };
}
