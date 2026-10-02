import { dedupeToLatestVersion } from "../statementVersion";
import type { AccountKind } from "../store/mask";
import type { Currency, Statement } from "../types";
import { type PricedSighting, pricedSightingsBySymbol, resolveCurrency } from "./holdings";
import type { AccountSeries } from "./types";

/**
 * Owner-confirmed overrides on top of the currency rule below -- a symbol
 * that is Canadian or foreign REGARDLESS of its resolved price currency.
 * `.U`-suffixed symbols never need listing here: the suffix check in
 * `classifyForeignProperty` already covers every one of them (`HXQ.U`,
 * `HXS.U`), the same rule `income.ts`'s `isUsdUnitClassOfCanadianEtf`
 * encodes for dividend sourcing.
 */
const CANADIAN_LISTED_SYMBOLS: ReadonlySet<string> = new Set([
  "VFV",
  "XEQT",
  "HXQ",
  "HXS",
  "QQC",
  "CHPS",
]);

/**
 * Securities the owner has confirmed trade on a foreign exchange even
 * though their resolved price currency might otherwise mislead (or simply
 * to record the fact explicitly). `CHPX` is the US listed Global X Funds
 * ETF, distinct from `CHPS` above (the Canadian listed one) despite the
 * one-letter difference in ticker.
 */
const FOREIGN_LISTED_SYMBOLS: ReadonlySet<string> = new Set([
  "META",
  "VOO",
  "IEFA",
  "ACWV",
  "EEMV",
  "GSWO",
  "CHPX",
]);

export type ForeignPropertyClass = "canadian" | "foreign" | "unclassified";

/**
 * One holding's T1135 classification: a CAD-priced security trades on a
 * Canadian exchange and is Canadian property; a USD-priced one is foreign
 * property -- that is the rule, not a guess, and it is why this project's
 * long list of individual direct-indexing US tickers needs no per-symbol
 * review at all. The owner tables above sit on top of it as overrides for
 * the handful of symbols where the currency alone would mislead (a
 * Canadian-listed USD unit class, or a US-exchange fund the owner has
 * separately confirmed).
 *
 * `resolvedCurrency` must be the CORRECTED currency `holdings.ts` already
 * resolves (see `resolveCurrency`), never the raw `priceCurrency` field:
 * some statements omit a holding's price and the parser defaults that row
 * to `marketPrice: 0, priceCurrency: "CAD"`, which is not evidence the
 * security is actually Canadian.
 */
export function classifyForeignProperty(
  symbol: string,
  resolvedCurrency: Currency,
): ForeignPropertyClass {
  if (symbol.endsWith(".U") || CANADIAN_LISTED_SYMBOLS.has(symbol)) return "canadian";
  if (FOREIGN_LISTED_SYMBOLS.has(symbol)) return "foreign";
  switch (resolvedCurrency) {
    case "CAD":
      return "canadian";
    case "USD":
      return "foreign";
    default:
      return "unclassified";
  }
}

const REGISTERED_KINDS: ReadonlySet<AccountKind> = new Set([
  "TFSA",
  "RRSP",
  "SpousalRRSP",
  "FHSA",
  "RESP",
]);

function periodYear(period: string): number {
  return Number(period.slice(0, 4));
}

/** One month's cost amount (CAD book cost), split by classification, for the accounts in `accountIds`. */
interface MonthCost {
  period: string;
  canadian: number;
  foreign: number;
  crypto: number;
  unclassified: number;
}

/** A holding's resolved currency: the raw `priceCurrency`, corrected for the $0-price/CAD-default parser quirk via `resolveCurrency`, the same correction `holdings.ts` applies before it ever compares a currency. */
function resolvedHoldingCurrency(
  holding: { symbol: string; priceCurrency: Currency; marketPrice: number },
  accountId: string,
  period: string,
  sightings: ReadonlyMap<string, readonly PricedSighting[]>,
): Currency {
  if (holding.marketPrice !== 0 || holding.priceCurrency !== "CAD") return holding.priceCurrency;
  return resolveCurrency(sightings, holding.symbol, accountId, period, holding.priceCurrency);
}

/**
 * One statement's book cost, by `classifyForeignProperty` bucket, except a
 * `Crypto`-kind account's holdings, which are all routed to `crypto`
 * regardless of symbol -- CRA's treatment of cryptocurrency as specified
 * foreign property is genuinely unsettled, so this project never guesses
 * either way and surfaces it for the accountant instead.
 *
 * `Holding.bookCost` is read AS IS, never run through a further currency
 * conversion: the parser already expresses it in CAD, converting at the
 * statement's rate itself when the printed figure was tagged USD
 * (`bookCostConverted`) and leaving it untouched when it was already
 * printed in CAD. `priceCurrency` describes the PRICE, a separate fact
 * from which currency the book-cost column itself was printed in, and
 * converting `bookCost` a second time off `priceCurrency` double-converts
 * every USD-priced holding whose cost column was already in CAD.
 */
function statementCost(
  s: Statement,
  kind: AccountKind,
  sightings: ReadonlyMap<string, readonly PricedSighting[]>,
): MonthCost {
  let canadian = 0;
  let foreign = 0;
  let crypto = 0;
  let unclassified = 0;
  for (const h of s.holdings) {
    if (h.bookCost === 0) continue;
    if (kind === "Crypto") {
      crypto += h.bookCost;
      continue;
    }
    const resolvedCurrency = resolvedHoldingCurrency(
      h,
      s.source.accountNo,
      s.source.period,
      sightings,
    );
    const bucket = classifyForeignProperty(h.symbol, resolvedCurrency);
    if (bucket === "canadian") canadian += h.bookCost;
    else if (bucket === "foreign") foreign += h.bookCost;
    else unclassified += h.bookCost;
  }
  return { period: s.source.period, canadian, foreign, crypto, unclassified };
}

export interface ForeignPropertySummary {
  year: number;
  /** The year's maximum month-end foreign cost amount, across however many statements the year has -- see `monthsConsidered`. */
  maxForeignCost: number;
  /** The last statement month's foreign cost amount in the year. */
  yearEndForeignCost: number;
  /** How many month-end statements this estimate is drawn from -- stated on screen, since "max of month-end cost" is itself an approximation of the true daily maximum. */
  monthsConsidered: number;
  /** Crypto holdings' book cost at year end, kept apart: not included in either threshold figure, "unclear, ask the accountant". */
  cryptoCostAtYearEnd: number;
  /** Unclassified holdings' book cost at year end -- never folded into the foreign total, since classifying it would be a guess. */
  unclassifiedCostAtYearEnd: number;
}

/**
 * Whether a cost amount reaches the T1135 filing and detailed-method
 * thresholds. Separated from `foreignPropertySummary` so the comparison --
 * a cheap read of two numbers from `tax.json` -- can run in the browser
 * against a cost already baked into `analytics.json`, without the browser
 * ever touching a raw statement.
 */
export function t1135ThresholdStatus(
  maxForeignCost: number,
  thresholds: { filingThreshold: number; detailedThreshold: number },
): { filingThresholdExceeded: boolean; detailedThresholdExceeded: boolean } {
  return {
    filingThresholdExceeded: maxForeignCost >= thresholds.filingThreshold,
    detailedThresholdExceeded: maxForeignCost >= thresholds.detailedThreshold,
  };
}

/**
 * The T1135 cost-amount summary for one year, over the accounts of `kind`
 * (personal non-registered, or `Corporate` -- registered wrappers and
 * Chequing are never in scope, since T1135 excludes registered accounts
 * and cash is not a specified foreign property). Cost amount, never market
 * value: the statement's own `bookCost`, already in CAD -- see
 * `statementCost`'s own doc for why it is never converted a second time.
 * Computed at the build step, over raw statements -- never in the browser
 * -- the same rule every other statement-derived figure in this project
 * follows.
 *
 * `sightings` is built over EVERY statement in the corpus, not only the
 * scoped accounts: a symbol's true currency is a fact about the security,
 * which a sighting in a different account or a different year can resolve
 * exactly as well as one inside this call's own scope.
 */
export function foreignPropertySummary(
  statements: readonly Statement[],
  series: readonly AccountSeries[],
  year: number,
  scopeKinds: ReadonlySet<AccountKind>,
): ForeignPropertySummary {
  const kindByAccount = new Map(series.map((a) => [a.maskedId, a.kind]));
  const scopedIds = new Set(
    series
      .filter((a) => scopeKinds.has(a.kind))
      .filter((a) => !REGISTERED_KINDS.has(a.kind))
      .map((a) => a.maskedId),
  );

  const deduped = dedupeToLatestVersion(statements);
  const sightings = pricedSightingsBySymbol(deduped);
  const months: MonthCost[] = [];
  for (const s of deduped) {
    if (s.source.template !== "BROKERAGE") continue;
    if (!scopedIds.has(s.source.accountNo)) continue;
    if (periodYear(s.source.period) !== year) continue;
    const kind = kindByAccount.get(s.source.accountNo);
    if (kind === undefined) continue;
    months.push(statementCost(s, kind, sightings));
  }

  const byPeriod = new Map<string, MonthCost>();
  for (const m of months) {
    const existing = byPeriod.get(m.period);
    byPeriod.set(
      m.period,
      existing
        ? {
            period: m.period,
            canadian: existing.canadian + m.canadian,
            foreign: existing.foreign + m.foreign,
            crypto: existing.crypto + m.crypto,
            unclassified: existing.unclassified + m.unclassified,
          }
        : m,
    );
  }
  const sorted = [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
  const maxForeignCost = sorted.reduce((max, m) => Math.max(max, m.foreign), 0);
  const last = sorted[sorted.length - 1];

  return {
    year,
    maxForeignCost,
    yearEndForeignCost: last?.foreign ?? 0,
    monthsConsidered: sorted.length,
    cryptoCostAtYearEnd: last?.crypto ?? 0,
    unclassifiedCostAtYearEnd: last?.unclassified ?? 0,
  };
}
