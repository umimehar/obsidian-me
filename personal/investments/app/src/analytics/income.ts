import type { AccountKind } from "../store/mask";
import type { ActivityRow, Holding, Statement } from "../types";
import { type ActivityByPeriod, buildActivity, convertToCad, netCreditDebit } from "./activity";
import { PERSONAL_NONREG_KINDS } from "./accountScopes";
import type { AccountSeries } from "./types";

/**
 * The default kinds whose investment income is taxed in the owner's
 * personal hands, when a caller passes no explicit `kinds`. `Corporate` is
 * deliberately absent: investment income inside a corporation is taxed in
 * the corporation and only reaches the owner when dividended out, so it
 * must never feed the personal estimate by default -- getting this wrong
 * once inflated 2026 eligible dividends from $202 to $645 (see
 * `KIND_OVERRIDES` in `../store/registry.ts`). Registered wrappers (TFSA,
 * RRSP, SpousalRRSP, FHSA, RESP) are absent too: income earned inside them
 * is not taxable as earned. `Chequing` is absent because it holds no
 * investments. A caller that wants the corporation's own passive income
 * (taxed in the corporation's hands, not the owner's) passes `CORPORATE_KINDS`
 * explicitly -- see `corporatePassiveIncome.ts`.
 */
const TAXABLE_KINDS: ReadonlySet<AccountKind> = PERSONAL_NONREG_KINDS;

/**
 * The caller's account selection -- masked ids, mirroring the UI's
 * account-scope filter. It is a further restriction on top of
 * `TAXABLE_KINDS`, never a way around it: an account in `scope` that is not
 * one of the taxable kinds still contributes nothing.
 */
export type IncomeScope = ReadonlySet<string>;

/** One spin-off or reorganization row worth flagging against a tax slip: the symbol it touched and the date it landed. */
export interface CorporateAction {
  symbol: string;
  date: string;
}

/**
 * One `SELL` row's realized result, for the per-sale tax table: date,
 * symbol, which account, proceeds and gain in CAD, and whether the cost
 * side is known. `acb` is `proceeds - gain` when the cost is known, and
 * null when `costUnknown` -- stating an invented ACB for a sale this
 * project cannot cost would be worse than leaving it blank.
 */
export interface SaleDetail {
  date: string;
  symbol: string;
  maskedId: string;
  proceeds: number;
  acb: number | null;
  gain: number;
  costUnknown: boolean;
}

export interface IncomeSummary {
  /** INT and FPLINT (securities lending), net of reversals, CAD. */
  interest: number;
  /** DIV on a security priced in CAD with no US tax withheld, net of reversals, CAD. */
  canadianDistributions: number;
  /** DIV on a USD priced security, or one an NRT row in the same statement withheld tax from, net of reversals, CAD. */
  foreignDividends: number;
  /** NRT, net of reversals, CAD, positive. A foreign tax credit, not an expense. */
  foreignTaxWithheld: number;
  /** Proceeds converted to CAD at the statement's own rate, minus the ledger's average cost. */
  realizedGains: number;
  /** Sales with no cost basis at all. */
  costUnknownSales: number;
  /** Stock dividends and spin-off distributions in the year, oldest first -- see `CorporateAction`. */
  corporateActions: readonly CorporateAction[];
  /** Every `SELL` row realized in the year, oldest first -- see `SaleDetail`. */
  sales: readonly SaleDetail[];
}

function periodYear(period: string): number {
  return Number(period.slice(0, 4));
}

/** The accounts of `kinds` that are also in the caller's `scope`. */
function taxableAccountIds(
  series: readonly AccountSeries[],
  scope: IncomeScope,
  kinds: ReadonlySet<AccountKind>,
): Set<string> {
  const ids = new Set<string>();
  for (const account of series) {
    if (scope.has(account.maskedId) && kinds.has(account.kind)) {
      ids.add(account.maskedId);
    }
  }
  return ids;
}

/**
 * Interest and securities lending income, and foreign tax withheld, for the
 * taxable accounts in the target year -- read straight off `buildActivity`'s
 * per period, per account totals rather than re-deriving the reversal
 * netting rule a second time.
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
 * The ticker at the front of a `BUY`, `SELL`, `DIV`, `STKDIV` or `STKDIS`
 * row's description -- e.g. `"ENB - Enbridge Inc: Sold 12.0000 shares
 * (executed at 2024-08-14)"` yields `"ENB"`. Null for the blank
 * descriptions ingest sometimes carries.
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

/**
 * A `STKDIV` or `STKDIS` row's signed share delta -- e.g. `"Stock dividend
 * distribution of 0.0107"` or `"Distribution of -1.3728 shares"` both yield
 * their number, sign included. Null when the row states no figure at all
 * (a `STKREORG` reorg, which carries none).
 */
function parseCorporateActionDelta(description: string): number | null {
  const match = /[Dd]istribution of (-?[\d.]+)/.exec(description);
  if (!match?.[1]) return null;
  const delta = Number(match[1]);
  return Number.isFinite(delta) ? delta : null;
}

/** A sentinel for a symbol two distinct holdings both claim in one statement -- never silently keep the last. */
const AMBIGUOUS = "ambiguous" as const;
type HoldingLookup = Holding | typeof AMBIGUOUS;

function holdingsBySymbol(holdings: readonly Holding[]): Map<string, HoldingLookup> {
  const map = new Map<string, HoldingLookup>();
  for (const h of holdings) {
    if (!h.symbol) continue;
    map.set(h.symbol, map.has(h.symbol) ? AMBIGUOUS : h);
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
 * Every symbol this account has ever carried at a real USD market price
 * (`priceCurrency: "USD"` and `marketPrice > 0`, so a placeholder price
 * from a pending valuation never taints the set), across every statement
 * regardless of period. The one signal that survives a month where the
 * position was already sold and so is absent from that statement's own
 * holdings.
 */
function usdPricedSymbolsForAccount(
  statements: readonly Statement[],
  accountId: string,
): ReadonlySet<string> {
  const symbols = new Set<string>();
  for (const s of statements) {
    if (s.source.accountNo !== accountId) continue;
    for (const h of s.holdings) {
      if (h.symbol && h.priceCurrency === "USD" && h.marketPrice > 0) symbols.add(h.symbol);
    }
  }
  return symbols;
}

/**
 * Whether one `DIV` row is foreign source: the row itself is in USD, its
 * holding's asset class opens with "US Equities", the symbol has ever
 * priced in USD for this account (current statement included), or --
 * failing all of that -- an `NRT` row fired on the same date in the same
 * statement. A CAD `priceCurrency` is trusted only when `marketPrice > 0`,
 * since a pending or stale $0 price is not evidence of anything. A symbol
 * two holdings both claim (`AMBIGUOUS`) skips the holding-based checks
 * entirely and falls straight to the NRT fallback -- classifying it off a
 * holding record that might belong to the wrong security is worse than not
 * classifying it at all.
 */
/**
 * A ".U" suffix marks the USD denominated unit class of a Canadian listed
 * ETF (HXQ.U, PSU.U) -- the fund itself is Canadian regardless of what it
 * holds or which currency its distribution pays in, so this overrides
 * every other signal, including the row's own USD currency.
 */
function isUsdUnitClassOfCanadianEtf(symbol: string | null): boolean {
  return symbol?.endsWith(".U") ?? false;
}

function isForeignDividend(
  row: ActivityRow,
  holdingsThisStatement: ReadonlyMap<string, HoldingLookup>,
  historicalUsd: ReadonlySet<string>,
  nrtDates: ReadonlySet<string>,
): boolean {
  const symbol = parseRowSymbol(row.description);
  if (isUsdUnitClassOfCanadianEtf(symbol)) return false;

  if (row.currency === "USD") return true;

  const holding = symbol ? holdingsThisStatement.get(symbol) : undefined;

  if (holding !== AMBIGUOUS) {
    if (holding?.assetClass.startsWith("US Equities")) return true;
    if (symbol !== null && historicalUsd.has(symbol)) return true;
    if (holding !== undefined && holding.priceCurrency === "CAD" && holding.marketPrice > 0) {
      return false;
    }
  }

  return nrtDates.has(row.date);
}

interface DividendTotals {
  canadianDistributions: number;
  foreignDividends: number;
}

/** One statement's `DIV` rows, classified and netted (`credit - debit`), converted to CAD. */
function dividendTotalsForStatement(
  s: Statement,
  historicalUsd: ReadonlySet<string>,
): DividendTotals {
  const holdings = holdingsBySymbol(s.holdings);
  const nrtDates = nrtDatesForStatement(s);
  let canadianDistributions = 0;
  let foreignDividends = 0;

  for (const row of s.activity) {
    if (row.code !== "DIV") continue;
    const net = netCreditDebit(row, s);
    if (isForeignDividend(row, holdings, historicalUsd, nrtDates)) foreignDividends += net;
    else canadianDistributions += net;
  }

  return { canadianDistributions, foreignDividends };
}

function sumDividends(
  statements: readonly Statement[],
  taxableIds: ReadonlySet<string>,
  year: number,
): DividendTotals {
  const historicalUsdByAccount = new Map<string, ReadonlySet<string>>();
  let canadianDistributions = 0;
  let foreignDividends = 0;

  for (const s of statements) {
    if (s.source.template === "PERFORMANCE") continue;
    if (!taxableIds.has(s.source.accountNo)) continue;
    if (periodYear(s.source.period) !== year) continue;

    const accountId = s.source.accountNo;
    let historicalUsd = historicalUsdByAccount.get(accountId);
    if (historicalUsd === undefined) {
      historicalUsd = usdPricedSymbolsForAccount(statements, accountId);
      historicalUsdByAccount.set(accountId, historicalUsd);
    }

    const totals = dividendTotalsForStatement(s, historicalUsd);
    canadianDistributions += totals.canadianDistributions;
    foreignDividends += totals.foreignDividends;
  }
  return { canadianDistributions, foreignDividends };
}

/** One statement's `STKDIV`/`STKDIS` rows, symbol and date -- the corporate actions worth flagging against a tax slip. */
function corporateActionsForStatement(s: Statement): CorporateAction[] {
  const actions: CorporateAction[] = [];
  for (const row of s.activity) {
    if (row.code !== "STKDIV" && row.code !== "STKDIS") continue;
    const symbol = parseRowSymbol(row.description);
    if (symbol) actions.push({ symbol, date: row.date });
  }
  return actions;
}

/**
 * One entry per symbol per date, even when several rows fire on it -- a
 * spin-off like XOM's 2026-07-02 STKDIS posts as a same-day pair (the old
 * symbol removed, the new one added), both parsing to the one ticker at
 * the front of their description, and a reader checking a tax slip needs
 * to see that date once, not twice.
 */
function dedupeCorporateActions(actions: readonly CorporateAction[]): CorporateAction[] {
  const seen = new Set<string>();
  const deduped: CorporateAction[] = [];
  for (const action of actions) {
    const key = `${action.symbol}\u0000${action.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }
  return deduped;
}

function collectCorporateActions(
  statements: readonly Statement[],
  taxableIds: ReadonlySet<string>,
  year: number,
): CorporateAction[] {
  const actions: CorporateAction[] = [];
  for (const s of statements) {
    if (s.source.template === "PERFORMANCE") continue;
    if (!taxableIds.has(s.source.accountNo)) continue;
    if (periodYear(s.source.period) !== year) continue;
    actions.push(...corporateActionsForStatement(s));
  }
  const sorted = actions.sort(
    (a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol),
  );
  return dedupeCorporateActions(sorted);
}

/**
 * One symbol's running position within a statement: quantity, CAD cost,
 * whether a corporate action has made both untrustworthy (`unknown`), and
 * whether an unreadable BUY quantity has made the quantity alone
 * untrustworthy while the cost is still real (`quantityUncertain`) -- see
 * `processBuy` and `processSell`.
 */
interface LedgerEntry {
  quantity: number;
  cost: number;
  unknown: boolean;
  quantityUncertain: boolean;
}

function seedLedger(priorHoldings: ReadonlyMap<string, HoldingLookup>): Map<string, LedgerEntry> {
  const ledger = new Map<string, LedgerEntry>();
  for (const [symbol, holding] of priorHoldings) {
    ledger.set(
      symbol,
      holding === AMBIGUOUS
        ? { quantity: 0, cost: 0, unknown: true, quantityUncertain: false }
        : {
            quantity: holding.quantity,
            cost: holding.bookCost,
            unknown: false,
            quantityUncertain: false,
          },
    );
  }
  return ledger;
}

function ledgerEntryFor(ledger: Map<string, LedgerEntry>, symbol: string): LedgerEntry {
  const existing = ledger.get(symbol);
  if (existing) return existing;
  const fresh: LedgerEntry = { quantity: 0, cost: 0, unknown: false, quantityUncertain: false };
  ledger.set(symbol, fresh);
  return fresh;
}

/** `s.activity` in date order, original row order breaking a tie -- a stable sort, since the source array is already close to chronological. */
function orderedRows(s: Statement): readonly ActivityRow[] {
  return s.activity
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.date.localeCompare(b.row.date) || a.index - b.index)
    .map(({ row }) => row);
}

interface RowGain {
  gain: number;
  costUnknown: boolean;
  /** The row's own symbol and CAD proceeds, present only for a `SELL` row -- see `SaleDetail`. */
  symbol: string | null;
  proceedsCad: number | null;
}

const NO_GAIN: RowGain = { gain: 0, costUnknown: false, symbol: null, proceedsCad: null };

/**
 * A full close: the position is absent from this statement's own closing
 * holdings, so whatever cost the ledger still carries is realized in full
 * -- no per-share figure is needed, which is what lets this branch price a
 * sale even when the quantity behind it (sold or bought) was never
 * readable at all.
 */
function closeOutRemainingCost(
  entry: LedgerEntry,
  symbol: string,
  proceedsCad: number,
): RowGain {
  const gain = proceedsCad - entry.cost;
  entry.cost = 0;
  entry.quantity = 0;
  entry.quantityUncertain = false;
  return { gain, costUnknown: false, symbol, proceedsCad };
}

/**
 * A sale larger than the ledger's remaining quantity: the covered part
 * prices at the ledger's own average cost, the uncovered part -- the
 * shares this snapshot has no record of at all -- has no cost basis,
 * proceeds split pro rata between the two. Costing the whole sale at the
 * average, the previous behaviour, both mispriced the uncovered shares and
 * could drive the ledger negative for every row that followed it this
 * statement (see ADI 2025-11, HD 2026-03).
 */
function oversell(
  entry: LedgerEntry,
  symbol: string,
  soldQuantity: number,
  proceedsCad: number,
): RowGain {
  const coveredFraction = entry.quantity > 0 ? entry.quantity / soldQuantity : 0;
  const coveredProceeds = proceedsCad * coveredFraction;
  const coveredCost = entry.cost;
  entry.cost = 0;
  entry.quantity = 0;
  return { gain: coveredProceeds - coveredCost, costUnknown: true, symbol, proceedsCad };
}

/**
 * One `SELL` row against the running ledger. A symbol the ledger has
 * already marked `unknown` (an ambiguous holding, or a corporate action
 * with no readable ratio -- see `applyRowToLedger`) counts as cost unknown
 * outright, never priced off a stale average. A description with no
 * readable symbol at all is the same case. A readable symbol with an
 * unreadable quantity, or a readable partial sale against a ledger whose
 * quantity an earlier unreadable BUY made uncertain, is a full close when
 * this statement's own closing holdings no longer carry the position (see
 * `closeOutRemainingCost`) -- otherwise it is cost unknown, and the ledger
 * is marked `unknown` for the rest of the statement, since a quantity
 * already wrong is not made right by the next row.
 */
function processSell(
  row: ActivityRow,
  s: Statement,
  ledger: Map<string, LedgerEntry>,
  closingHoldings: ReadonlyMap<string, HoldingLookup>,
): RowGain {
  const symbol = parseRowSymbol(row.description);
  if (symbol === null) return { gain: 0, costUnknown: true };

  const entry = ledgerEntryFor(ledger, symbol);
  if (entry.unknown) return { gain: 0, costUnknown: true };

  const proceedsCad = convertToCad(row.credit, row, s);
  const lot = parseTradeLot(row, "Sold");
  const stillOpen = closingHoldings.get(symbol) !== undefined;

  if (lot === null || entry.quantityUncertain) {
    if (!stillOpen) return closeOutRemainingCost(entry, proceedsCad);
    entry.unknown = true;
    return { gain: 0, costUnknown: true };
  }

  if (entry.quantity <= 1e-9) return { gain: 0, costUnknown: true };
  if (lot.quantity > entry.quantity + 1e-9) return oversell(entry, lot.quantity, proceedsCad);

  const costPerShare = entry.cost / entry.quantity;
  const cost = costPerShare * lot.quantity;
  entry.cost -= cost;
  entry.quantity -= lot.quantity;
  return { gain: proceedsCad - cost, costUnknown: false };
}

/**
 * A BUY with an unreadable quantity still adds its cost, but marks the
 * ledger's quantity `quantityUncertain`: dividing the now inflated cost by
 * the old (too small) quantity would silently overstate the average cost
 * per share for every sale that follows, in either direction -- see
 * `processSell`.
 */
function processBuy(row: ActivityRow, s: Statement, ledger: Map<string, LedgerEntry>): void {
  const symbol = parseRowSymbol(row.description);
  if (!symbol) return;
  const lot = parseTradeLot(row, "Bought");
  const entry = ledgerEntryFor(ledger, symbol);
  if (entry.unknown) return;
  entry.cost += convertToCad(row.debit, row, s);
  if (lot) entry.quantity += lot.quantity;
  else entry.quantityUncertain = true;
}

/** A stock dividend or spin-off distribution: quantity rebased by the row's own stated delta, cost unchanged. */
function processCorporateActionDelta(row: ActivityRow, ledger: Map<string, LedgerEntry>): void {
  const symbol = parseRowSymbol(row.description);
  const delta = parseCorporateActionDelta(row.description);
  if (!symbol || delta === null) return;
  const entry = ledgerEntryFor(ledger, symbol);
  if (!entry.unknown) entry.quantity += delta;
}

/** A reorg with no readable ratio: mark the symbol unknown for the rest of the statement -- see `applyRowToLedger`. */
function processUnreadableReorg(row: ActivityRow, ledger: Map<string, LedgerEntry>): void {
  const symbol = parseRowSymbol(row.description);
  const delta = parseCorporateActionDelta(row.description);
  if (symbol && delta === null) ledgerEntryFor(ledger, symbol).unknown = true;
}

/**
 * One row's effect on the running ledger: `BUY` adds quantity and CAD cost
 * (see `processBuy`); `SELL` realizes a gain (see `processSell`);
 * `STKDIV`/`STKDIS` rebase quantity by the row's own stated delta at
 * unchanged cost; `STKREORG` carries no readable ratio at all, so it marks
 * the symbol `unknown` for the rest of the statement rather than let a
 * later sale price post-split shares off a pre-split average.
 */
function applyRowToLedger(
  row: ActivityRow,
  s: Statement,
  ledger: Map<string, LedgerEntry>,
  closingHoldings: ReadonlyMap<string, HoldingLookup>,
): RowGain {
  switch (row.code) {
    case "BUY":
      processBuy(row, s, ledger);
      return NO_GAIN;
    case "SELL":
      return processSell(row, s, ledger, closingHoldings);
    case "STKDIV":
    case "STKDIS":
      processCorporateActionDelta(row, ledger);
      return NO_GAIN;
    case "STKREORG":
      processUnreadableReorg(row, ledger);
      return NO_GAIN;
    default:
      return NO_GAIN;
  }
}

interface StatementGain {
  gain: number;
  costUnknownCount: number;
}

function realizedGainForStatement(
  s: Statement,
  priorHoldings: ReadonlyMap<string, HoldingLookup>,
): StatementGain {
  const ledger = seedLedger(priorHoldings);
  const closingHoldings = holdingsBySymbol(s.holdings);
  let gain = 0;
  let costUnknownCount = 0;
  for (const row of orderedRows(s)) {
    const result = applyRowToLedger(row, s, ledger, closingHoldings);
    gain += result.gain;
    if (result.costUnknown) costUnknownCount += 1;
  }
  return { gain, costUnknownCount };
}

/**
 * One account's realized gains and cost unknown count for `year`, walking
 * every BROKERAGE statement in order so the ledger always seeds from the
 * immediately preceding one -- see `realizedGainForStatement`.
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
  let priorHoldings = new Map<string, HoldingLookup>();

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
  const corporateActions = collectCorporateActions(statements, taxableIds, year);
  return {
    interest,
    canadianDistributions,
    foreignDividends,
    foreignTaxWithheld,
    realizedGains,
    costUnknownSales,
    corporateActions,
  };
}
