import { dedupeToLatestVersion } from "../statementVersion";
import type { AccountRecord } from "../store/registry";
import type { Currency, Holding, Statement } from "../types";
import { convertAmountToCad } from "./activity";

/** One symbol at one price currency, combined across every counted account that holds it that way. */
export interface HoldingSummary {
  /** Empty for a holding with no printed ticker, or for a cash bucket. */
  symbol: string;
  name: string;
  value: number;
  share: number;
  /** Account labels holding this symbol, sorted. */
  accounts: string[];
  priceCurrency: Currency;
  assetClass: string;
  /** True when the statement flags this symbol's pricing as not yet final. */
  pendingValuation: boolean;
}

export interface HoldingsGroup {
  label: string;
  symbols: string[];
  value: number;
  share: number;
  /** Account labels holding any symbol in this group, sorted. */
  accounts: string[];
}

export interface HoldingsOutput {
  /** The single period every row below is drawn from, `YYYY-MM` -- the latest any counted account reports. */
  period: string;
  total: number;
  holdings: HoldingSummary[];
  groups: HoldingsGroup[];
  currency: { CAD: number; USD: number };
  assetClasses: { name: string; value: number }[];
  /** Counted account labels with no BROKERAGE statement at `period`, sorted -- named, never silently dropped. */
  behind: string[];
}

/**
 * Symbols this project treats as S&P 500 exposure: Vanguard and iShares
 * Canadian listed trackers, their USD listed twins, and the direct US
 * listed funds. Only the ones actually held show up in
 * `HoldingsOutput.groups`.
 */
export const INDEX_GROUPS: Readonly<Record<string, readonly string[]>> = {
  "S&P 500": ["VFV", "VOO", "ZSP", "XUS", "SPY", "IVV", "VFV.U", "ZSP.U"],
};

interface Entry {
  symbol: string;
  name: string;
  value: number;
  accounts: Set<string>;
  priceCurrency: Currency;
  assetClass: string;
  pendingValuation: boolean;
}

/** The running totals `buildHoldings` folds every account's statement into. */
interface Totals {
  bySymbol: Map<string, Entry>;
  currency: { CAD: number; USD: number };
  assetClasses: Map<string, number>;
  total: number;
}

function emptyTotals(): Totals {
  return { bySymbol: new Map(), currency: { CAD: 0, USD: 0 }, assetClasses: new Map(), total: 0 };
}

interface EntryInput {
  key: string;
  symbol: string;
  name: string;
  value: number;
  accountLabel: string;
  priceCurrency: Currency;
  assetClass: string;
  pendingValuation: boolean;
}

/**
 * Folds one row into `totals`. `key` is the map identity (symbol AND
 * currency together -- see `buildHoldings`'s own doc for why the currency
 * has to be part of it) while `symbol`/`name` are what the row itself is
 * displayed as; the two can differ in principle, but a key collision always
 * means the same real security under this scheme.
 */
function addEntry(totals: Totals, input: EntryInput): void {
  const entry = totals.bySymbol.get(input.key) ?? {
    symbol: input.symbol,
    name: input.name,
    value: 0,
    accounts: new Set<string>(),
    priceCurrency: input.priceCurrency,
    assetClass: input.assetClass,
    pendingValuation: false,
  };
  entry.value += input.value;
  entry.accounts.add(input.accountLabel);
  entry.pendingValuation = entry.pendingValuation || input.pendingValuation;
  totals.bySymbol.set(input.key, entry);
  totals.total += input.value;
  totals.currency[input.priceCurrency] += input.value;
  totals.assetClasses.set(
    input.assetClass,
    (totals.assetClasses.get(input.assetClass) ?? 0) + input.value,
  );
}

/** One symbol priced properly (`marketPrice > 0`) somewhere in the corpus: which account, which period, in which currency. */
interface PricedSighting {
  accountId: string;
  period: string;
  currency: Currency;
}

/**
 * Every properly priced sighting of every symbol, across every BROKERAGE
 * statement and every account -- not only the target period, since a
 * symbol's true currency is a fact about the security, not about the one
 * statement that happened to omit its price.
 */
function pricedSightingsBySymbol(statements: readonly Statement[]): Map<string, PricedSighting[]> {
  const bySymbol = new Map<string, PricedSighting[]>();
  for (const statement of statements) {
    if (statement.source.template !== "BROKERAGE") continue;
    for (const holding of statement.holdings) {
      if (!holding.symbol || holding.marketPrice <= 0) continue;
      const list = bySymbol.get(holding.symbol) ?? [];
      list.push({
        accountId: statement.source.accountNo,
        period: statement.source.period,
        currency: holding.priceCurrency,
      });
      bySymbol.set(holding.symbol, list);
    }
  }
  return bySymbol;
}

function monthIndex(period: string): number {
  const [year, month] = period.split("-").map(Number);
  return (year ?? 0) * 12 + (month ?? 0);
}

/**
 * The true currency of a $0-priced holding row, recovered from other
 * priced sightings of the same symbol. Some tickers are shared by two
 * unrelated companies on different exchanges (`L` is Loblaw in CAD and
 * Loews Corp in USD in this corpus), so a symbol alone cannot be trusted
 * across accounts -- a sighting from the SAME account outscores one from a
 * different account regardless of period, and only ties are broken by
 * period: the same period first, then whichever is closest in time.
 */
function resolveCurrency(
  sightings: ReadonlyMap<string, readonly PricedSighting[]>,
  symbol: string,
  accountId: string,
  period: string,
  fallback: Currency,
): Currency {
  const list = symbol ? sightings.get(symbol) : undefined;
  if (list === undefined || list.length === 0) return fallback;

  let best: PricedSighting | undefined;
  let bestScore = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const sighting of list) {
    const score = (sighting.accountId === accountId ? 2 : 0) + (sighting.period === period ? 1 : 0);
    const distance = Math.abs(monthIndex(sighting.period) - monthIndex(period));
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = sighting;
      bestScore = score;
      bestDistance = distance;
    }
  }
  return best?.currency ?? fallback;
}

/** The latest period any counted account has a BROKERAGE statement for -- the single period every row is drawn from. */
function latestCountedPeriod(
  statements: readonly Statement[],
  countedIds: ReadonlySet<string>,
): string {
  let period = "";
  for (const statement of statements) {
    if (statement.source.template !== "BROKERAGE") continue;
    if (!countedIds.has(statement.source.accountNo)) continue;
    if (statement.source.period > period) period = statement.source.period;
  }
  return period;
}

/** Each counted account's BROKERAGE statement at exactly `period`, keyed by masked id -- an account missing one is simply absent, not backfilled from an older statement. */
function statementsAtPeriod(
  statements: readonly Statement[],
  countedIds: ReadonlySet<string>,
  period: string,
): Map<string, Statement> {
  const byAccount = new Map<string, Statement>();
  for (const statement of statements) {
    if (statement.source.template !== "BROKERAGE") continue;
    if (statement.source.period !== period) continue;
    if (!countedIds.has(statement.source.accountNo)) continue;
    byAccount.set(statement.source.accountNo, statement);
  }
  return byAccount;
}

/** One holding row folded into `totals`, with the $0-price/CAD-default quirk corrected via `resolveCurrency`. */
function addHolding(
  totals: Totals,
  holding: Holding,
  label: string,
  accountId: string,
  period: string,
  sightings: ReadonlyMap<string, readonly PricedSighting[]>,
): void {
  if (holding.marketValue === 0) return;
  const priceCurrency =
    holding.marketPrice === 0 && holding.priceCurrency === "CAD"
      ? resolveCurrency(sightings, holding.symbol, accountId, period, holding.priceCurrency)
      : holding.priceCurrency;
  const key = `${holding.symbol || holding.name}|${priceCurrency}`;
  addEntry(totals, {
    key,
    symbol: holding.symbol,
    name: holding.name,
    value: holding.marketValue,
    accountLabel: label,
    priceCurrency,
    assetClass: holding.assetClass,
    pendingValuation: holding.pendingValuation,
  });
}

/** One statement's cash balance, one entry per currency, folded into `totals`. */
function addCashHoldings(totals: Totals, statement: Statement, label: string): void {
  for (const cash of statement.cash) {
    if (cash.closing === 0) continue;
    const converted = convertAmountToCad(cash.closing, cash.currency, statement);
    addEntry(totals, {
      key: `Cash|${cash.currency}`,
      symbol: "",
      name: `Cash (${cash.currency})`,
      value: converted,
      accountLabel: label,
      priceCurrency: cash.currency,
      assetClass: "Cash",
      pendingValuation: false,
    });
  }
}

function toHoldingSummaries(totals: Totals): HoldingSummary[] {
  return [...totals.bySymbol.values()]
    .map((e) => ({
      symbol: e.symbol,
      name: e.name,
      value: e.value,
      share: totals.total === 0 ? 0 : e.value / totals.total,
      accounts: [...e.accounts].sort(),
      priceCurrency: e.priceCurrency,
      assetClass: e.assetClass,
      pendingValuation: e.pendingValuation,
    }))
    .sort((a, b) => b.value - a.value);
}

function toGroups(holdings: readonly HoldingSummary[], total: number): HoldingsGroup[] {
  return Object.entries(INDEX_GROUPS)
    .map(([label, symbols]) => {
      const held = holdings.filter((h) => (symbols as readonly string[]).includes(h.symbol));
      const value = held.reduce((sum, h) => sum + h.value, 0);
      const accounts = new Set<string>();
      for (const h of held) for (const a of h.accounts) accounts.add(a);
      return {
        label,
        symbols: [...new Set(held.map((h) => h.symbol))].sort(),
        value,
        share: total === 0 ? 0 : value / total,
        accounts: [...accounts].sort(),
      };
    })
    .filter((g) => g.symbols.length > 0);
}

/**
 * What the owner actually owns, combined across every account counted
 * toward the portfolio total, all at the single latest period any counted
 * account reports.
 *
 * A row is keyed by symbol AND its resolved price currency together, never
 * by symbol alone: a bare ticker can name two unrelated companies on two
 * exchanges (`L` is Loblaw in CAD and Loews Corp in USD here), and keying
 * by symbol alone would silently sum their values into one invented
 * security.
 *
 * An account with no BROKERAGE statement at that period -- a CASH-only
 * month, or simply behind -- contributes nothing and is named in `behind`
 * rather than backfilled from an older statement, so `total` can land a
 * little short of the portfolio total and the gap is traceable rather than
 * hidden.
 *
 * Cash is a holding named "Cash (CAD)"/"Cash (USD)", one per currency, from
 * each statement's own `cash[].closing`, converted to CAD with that
 * statement's `fxRate`.
 */
export function buildHoldings(
  statements: readonly Statement[],
  accounts: readonly AccountRecord[],
): HoldingsOutput {
  const deduped = dedupeToLatestVersion(statements);
  const countedIds = new Set(accounts.filter((a) => a.inTotals).map((a) => a.maskedId));
  const labelById = new Map(accounts.map((a) => [a.maskedId, a.label]));
  const sightings = pricedSightingsBySymbol(deduped);

  const period = latestCountedPeriod(deduped, countedIds);
  const atPeriod = statementsAtPeriod(deduped, countedIds, period);
  const behind = [...countedIds]
    .filter((id) => !atPeriod.has(id))
    .map((id) => labelById.get(id) ?? id)
    .sort();

  const totals = emptyTotals();
  for (const [accountId, statement] of atPeriod) {
    const label = labelById.get(accountId) ?? accountId;
    for (const holding of statement.holdings) {
      addHolding(totals, holding, label, accountId, period, sightings);
    }
    addCashHoldings(totals, statement, label);
  }

  const holdings = toHoldingSummaries(totals);
  const groups = toGroups(holdings, totals.total);
  const assetClasses = [...totals.assetClasses.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return {
    period,
    total: totals.total,
    holdings,
    groups,
    currency: totals.currency,
    assetClasses,
    behind,
  };
}
