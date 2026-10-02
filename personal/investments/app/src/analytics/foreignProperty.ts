import { dedupeToLatestVersion } from "../statementVersion";
import type { AccountKind } from "../store/mask";
import type { Holding, Statement } from "../types";
import { convertAmountToCad } from "./activity";
import type { AccountSeries } from "./types";

/**
 * Nothing this project parses carries a holding's listing exchange: the PDF
 * discloses a security's name, symbol, asset class and price currency, none
 * of which says where it trades. `HXQ.U` is the clearest proof a currency
 * cannot stand in for it -- a Canadian listed fund trading in USD units.
 *
 * So this is an owner-reviewed table, the same shape as `registry.ts`'s
 * `LABELS`/`PURPOSES`/`KIND_OVERRIDES`: a symbol the owner has actually
 * checked goes in one of the two sets below, and a symbol not reviewed
 * falls to `"unclassified"` in `classifyForeignProperty` rather than being
 * guessed from its price currency or asset class.
 */
const CANADIAN_LISTED_SYMBOLS: ReadonlySet<string> = new Set([
  "VFV",
  "XEQT",
  "HXQ",
  "HXQ.U",
  "HXS",
  "QQC",
  "CHPS",
]);

/**
 * Securities the owner has confirmed trade on a foreign exchange, even
 * though the account holding them is at a Canadian broker. `CHPX` is the
 * US listed Global X Funds ETF, distinct from `CHPS` above (the Canadian
 * listed one) despite the one-letter difference in ticker.
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
 * One holding's T1135 classification. `"foreign"` for a symbol on
 * `FOREIGN_LISTED_SYMBOLS` or carrying a `.U`-suffixed Canadian unit class's
 * opposite -- a real US Equities asset class the statement itself states,
 * which direct indexing's many individual US tickers rely on since they
 * cannot practically be enumerated by symbol one at a time.
 *
 * `.U`-suffixed symbols are Canadian regardless of every other signal: the
 * fund itself is Canadian listed, trading in USD units, so `HXQ.U` lands
 * `"canadian"` even though its price currency is USD -- the same rule
 * `income.ts`'s `isUsdUnitClassOfCanadianEtf` already encodes for dividend
 * sourcing, applied here for the same reason.
 */
export function classifyForeignProperty(holding: Holding): ForeignPropertyClass {
  if (holding.symbol.endsWith(".U") || CANADIAN_LISTED_SYMBOLS.has(holding.symbol)) {
    return "canadian";
  }
  if (FOREIGN_LISTED_SYMBOLS.has(holding.symbol)) return "foreign";
  if (holding.assetClass.startsWith("US Equities")) return "foreign";
  return "unclassified";
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

/**
 * One statement's book cost, by `classifyForeignProperty` bucket, except a
 * `Crypto`-kind account's holdings, which are all routed to `crypto`
 * regardless of symbol -- CRA's treatment of cryptocurrency as specified
 * foreign property is genuinely unsettled, so this project never guesses
 * either way and surfaces it for the accountant instead.
 */
function statementCost(s: Statement, kind: AccountKind): MonthCost {
  let canadian = 0;
  let foreign = 0;
  let crypto = 0;
  let unclassified = 0;
  for (const h of s.holdings) {
    if (h.bookCost === 0) continue;
    const costCad = convertAmountToCad(h.bookCost, h.priceCurrency, s);
    if (kind === "Crypto") {
      crypto += costCad;
      continue;
    }
    const bucket = classifyForeignProperty(h);
    if (bucket === "canadian") canadian += costCad;
    else if (bucket === "foreign") foreign += costCad;
    else unclassified += costCad;
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
  filingThresholdExceeded: boolean;
  detailedThresholdExceeded: boolean;
}

/**
 * The T1135 cost-amount summary for one year, over the accounts of `kind`
 * (personal non-registered, or `Corporate` -- registered wrappers and
 * Chequing are never in scope, since T1135 excludes registered accounts
 * and cash is not a specified foreign property). Cost amount, never market
 * value: the statement's own `bookCost`, converted to CAD, the figure the
 * form actually asks for.
 */
export function foreignPropertySummary(
  statements: readonly Statement[],
  series: readonly AccountSeries[],
  year: number,
  scopeKinds: ReadonlySet<AccountKind>,
  thresholds: { filingThreshold: number; detailedThreshold: number },
): ForeignPropertySummary {
  const kindByAccount = new Map(series.map((a) => [a.maskedId, a.kind]));
  const scopedIds = new Set(
    series
      .filter((a) => scopeKinds.has(a.kind) || a.kind === "Crypto")
      .filter((a) => !REGISTERED_KINDS.has(a.kind))
      .map((a) => a.maskedId),
  );

  const deduped = dedupeToLatestVersion(statements);
  const months: MonthCost[] = [];
  for (const s of deduped) {
    if (s.source.template !== "BROKERAGE") continue;
    if (!scopedIds.has(s.source.accountNo)) continue;
    if (periodYear(s.source.period) !== year) continue;
    const kind = kindByAccount.get(s.source.accountNo);
    if (kind === undefined) continue;
    months.push(statementCost(s, kind));
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
    filingThresholdExceeded: maxForeignCost >= thresholds.filingThreshold,
    detailedThresholdExceeded: maxForeignCost >= thresholds.detailedThreshold,
  };
}
