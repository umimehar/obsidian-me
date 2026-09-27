import { dedupeToLatestVersion } from "../statementVersion";
import type { AccountRecord } from "../store/registry";
import type { Currency, Holding, Statement } from "../types";
import { convertAmountToCad } from "./activity";

/** One symbol (or cash bucket), combined across every counted account that holds it. */
export interface HoldingSummary {
  symbol: string;
  name: string;
  value: number;
  share: number;
  /** Account labels holding this symbol, sorted. */
  accounts: string[];
  priceCurrency: Currency;
  assetClass: string;
}

export interface HoldingsOutput {
  /** The latest period a counted account's BROKERAGE statement reports, `YYYY-MM`. */
  period: string;
  total: number;
  holdings: HoldingSummary[];
  groups: { label: string; symbols: string[]; value: number; share: number }[];
  currency: { CAD: number; USD: number };
  assetClasses: { name: string; value: number }[];
}

/**
 * Symbols this project treats as S&P 500 exposure, whatever wrapper they sit
 * in: Vanguard and iShares Canadian listed trackers, their USD listed twins,
 * and the direct US listed funds. Only the ones actually held show up in
 * `HoldingsOutput.groups`, since a group with no symbol held is not a real
 * exposure.
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

function addEntry(
  totals: Totals,
  key: string,
  name: string,
  value: number,
  accountLabel: string,
  priceCurrency: Currency,
  assetClass: string,
): void {
  const entry = totals.bySymbol.get(key) ?? {
    symbol: key,
    name,
    value: 0,
    accounts: new Set<string>(),
    priceCurrency,
    assetClass,
  };
  entry.value += value;
  entry.accounts.add(accountLabel);
  totals.bySymbol.set(key, entry);
  totals.total += value;
  totals.currency[priceCurrency] += value;
  totals.assetClasses.set(assetClass, (totals.assetClasses.get(assetClass) ?? 0) + value);
}

/**
 * A symbol's price currency across every BROKERAGE statement that actually
 * prices it (`marketPrice > 0`). Some statements omit a holding's price
 * entirely, which parses as `marketPrice: 0` and `priceCurrency: "CAD"` by
 * default -- a statement-side gap, not a real CAD price -- so a later pass
 * over the same symbol's priced sightings is the only way to recover the
 * true currency for those rows.
 */
function inferredCurrencyBySymbol(statements: readonly Statement[]): Map<string, Currency> {
  const known = new Map<string, Currency>();
  for (const statement of statements) {
    if (statement.source.template !== "BROKERAGE") continue;
    for (const holding of statement.holdings) {
      if (holding.symbol && holding.marketPrice > 0)
        known.set(holding.symbol, holding.priceCurrency);
    }
  }
  return known;
}

/** Each counted account's own latest BROKERAGE statement, keyed by masked id. */
function latestBrokerageByAccount(
  statements: readonly Statement[],
  countedIds: ReadonlySet<string>,
): Map<string, Statement> {
  const latest = new Map<string, Statement>();
  for (const statement of statements) {
    if (statement.source.template !== "BROKERAGE") continue;
    if (!countedIds.has(statement.source.accountNo)) continue;
    const current = latest.get(statement.source.accountNo);
    if (!current || statement.source.period > current.source.period) {
      latest.set(statement.source.accountNo, statement);
    }
  }
  return latest;
}

/** One holding row folded into `totals`, with the $0-price/CAD-default quirk corrected. */
function addHolding(totals: Totals, holding: Holding, label: string, known: Map<string, Currency>) {
  if (holding.marketValue === 0) return;
  const key = holding.symbol || holding.name;
  const priceCurrency =
    holding.marketPrice === 0 && holding.priceCurrency === "CAD"
      ? (known.get(holding.symbol) ?? holding.priceCurrency)
      : holding.priceCurrency;
  addEntry(
    totals,
    key,
    holding.name,
    holding.marketValue,
    label,
    priceCurrency,
    holding.assetClass,
  );
}

/** One statement's cash balance, one entry per currency, folded into `totals`. */
function addCashHoldings(totals: Totals, statement: Statement, label: string) {
  for (const cash of statement.cash) {
    if (cash.closing === 0) continue;
    const converted = convertAmountToCad(cash.closing, cash.currency, statement);
    addEntry(
      totals,
      `Cash:${cash.currency}`,
      `Cash (${cash.currency})`,
      converted,
      label,
      cash.currency,
      "Cash",
    );
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
    }))
    .sort((a, b) => b.value - a.value);
}

function toGroups(holdings: readonly HoldingSummary[], total: number): HoldingsOutput["groups"] {
  return Object.entries(INDEX_GROUPS)
    .map(([label, symbols]) => {
      const held = holdings.filter((h) => (symbols as readonly string[]).includes(h.symbol));
      const value = held.reduce((sum, h) => sum + h.value, 0);
      return {
        label,
        symbols: held.map((h) => h.symbol).sort(),
        value,
        share: total === 0 ? 0 : value / total,
      };
    })
    .filter((g) => g.symbols.length > 0);
}

/**
 * What the owner actually owns, combined across every account counted toward
 * the portfolio total, at each account's own latest BROKERAGE statement.
 *
 * An account whose latest statement is CASH-only (see the investments
 * CLAUDE.md on the chequing template change) contributes nothing here even
 * though it counts toward the portfolio total, so `total` can land a few
 * cents to a few dollars short of that total -- a real gap the page states
 * rather than hides, never patched by inventing a holding.
 *
 * Cash is a holding named "Cash (CAD)"/"Cash (USD)", one per currency,
 * from each statement's own `cash[].closing`, converted to CAD with that
 * statement's `fxRate`.
 */
export function buildHoldings(
  statements: readonly Statement[],
  accounts: readonly AccountRecord[],
): HoldingsOutput {
  const deduped = dedupeToLatestVersion(statements);
  const countedIds = new Set(accounts.filter((a) => a.inTotals).map((a) => a.maskedId));
  const labelById = new Map(accounts.map((a) => [a.maskedId, a.label]));
  const inferredCurrency = inferredCurrencyBySymbol(deduped);
  const latestByAccount = latestBrokerageByAccount(deduped, countedIds);

  const totals = emptyTotals();
  let period = "";

  for (const [accountId, statement] of latestByAccount) {
    if (statement.source.period > period) period = statement.source.period;
    const label = labelById.get(accountId) ?? accountId;
    for (const holding of statement.holdings) addHolding(totals, holding, label, inferredCurrency);
    addCashHoldings(totals, statement, label);
  }

  const holdings = toHoldingSummaries(totals);
  const groups = toGroups(holdings, totals.total);
  const assetClasses = [...totals.assetClasses.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return { period, total: totals.total, holdings, groups, currency: totals.currency, assetClasses };
}
