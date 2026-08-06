import type { AccountKind } from "../store/mask";
import type { ActivityRow, Holding, Statement } from "../types";
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
  interest: number;
  eligibleDividends: number;
  foreignIncome: number;
  realizedGains: number;
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

interface ActivityIncome {
  interest: number;
  eligibleDividends: number;
  foreignIncome: number;
}

const ZERO_ACTIVITY_INCOME: ActivityIncome = {
  interest: 0,
  eligibleDividends: 0,
  foreignIncome: 0,
};

/** One row's contribution: `INT` credits are interest, `DIV` credits split by the row's own currency. */
function activityIncomeForRow(row: ActivityRow): ActivityIncome {
  if (row.code === "INT") return { ...ZERO_ACTIVITY_INCOME, interest: row.credit };
  if (row.code === "DIV") {
    return row.currency === "CAD"
      ? { ...ZERO_ACTIVITY_INCOME, eligibleDividends: row.credit }
      : { ...ZERO_ACTIVITY_INCOME, foreignIncome: row.credit };
  }
  return ZERO_ACTIVITY_INCOME;
}

function addActivityIncome(a: ActivityIncome, b: ActivityIncome): ActivityIncome {
  return {
    interest: a.interest + b.interest,
    eligibleDividends: a.eligibleDividends + b.eligibleDividends,
    foreignIncome: a.foreignIncome + b.foreignIncome,
  };
}

/** Whether a statement's activity should count toward a taxable-account, target-year sum. */
function isInScopeForYear(s: Statement, taxableIds: ReadonlySet<string>, year: number): boolean {
  return (
    s.source.template !== "PERFORMANCE" &&
    taxableIds.has(s.source.accountNo) &&
    periodYear(s.source.period) === year
  );
}

/**
 * Interest, Canadian eligible dividends and foreign income, each summed
 * straight off activity credits for the target year -- interest from `INT`
 * rows, dividends from `DIV` rows split by the row's own currency (CAD is
 * an eligible dividend, USD is foreign income). PERFORMANCE-template
 * statements are skipped: they duplicate their BROKERAGE twin's activity
 * rows, the same reason `series.ts` and `rooms.ts` drop them.
 */
function sumActivityIncome(
  statements: readonly Statement[],
  taxableIds: ReadonlySet<string>,
  year: number,
): ActivityIncome {
  let total = ZERO_ACTIVITY_INCOME;
  for (const s of statements) {
    if (!isInScopeForYear(s, taxableIds, year)) continue;
    for (const row of s.activity) {
      total = addActivityIncome(total, activityIncomeForRow(row));
    }
  }
  return total;
}

/**
 * A `SELL` row's symbol and quantity, parsed off its description --
 * e.g. `"ENB - Enbridge Inc: Sold 12.0000 shares (executed at
 * 2024-08-14)"`. Neither field is carried on `ActivityRow` itself, so this
 * is the only way to link a sale back to the holding it closed out. Returns
 * null for the description shapes ingest sometimes truncates (a known
 * extraction gap, not something this layer can repair) -- an unparseable
 * sale is excluded from realized gains rather than guessed at.
 */
function parseSoldLot(row: ActivityRow): { symbol: string; quantity: number } | null {
  const symbolMatch = /^(\S+) -/.exec(row.description);
  const quantityMatch = /Sold ([\d.]+)/.exec(row.description);
  if (!symbolMatch?.[1] || !quantityMatch?.[1]) return null;

  const quantity = Number(quantityMatch[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return { symbol: symbolMatch[1], quantity };
}

function holdingsBySymbol(holdings: readonly Holding[]): Map<string, Holding> {
  const map = new Map<string, Holding>();
  for (const h of holdings) {
    if (h.symbol) map.set(h.symbol, h);
  }
  return map;
}

/**
 * One `SELL` row's gain against the holdings map as of the immediately
 * preceding BROKERAGE statement: proceeds (the row's credit) minus average
 * cost per share times the quantity sold. Zero when the row is not a sale,
 * its description is unparseable (see `parseSoldLot`), or its symbol has no
 * preceding holding to price it against -- excluded rather than guessed at.
 */
function gainForRow(row: ActivityRow, priorHoldings: ReadonlyMap<string, Holding>): number {
  if (row.code !== "SELL") return 0;
  const lot = parseSoldLot(row);
  if (!lot) return 0;
  const prior = priorHoldings.get(lot.symbol);
  if (!prior || prior.quantity <= 0) return 0;
  const averageCostPerShare = prior.bookCost / prior.quantity;
  return row.credit - averageCostPerShare * lot.quantity;
}

/**
 * One statement's realized gains, against the holdings map as of the
 * immediately preceding BROKERAGE statement -- see `gainForRow`.
 */
function realizedGainForStatement(
  s: Statement,
  priorHoldings: ReadonlyMap<string, Holding>,
): number {
  let gain = 0;
  for (const row of s.activity) {
    gain += gainForRow(row, priorHoldings);
  }
  return gain;
}

/**
 * One account's realized gains for `year`: for every `SELL` row in that
 * year, proceeds minus average cost -- the average cost per share stated on
 * the symbol's holding as of the immediately preceding BROKERAGE statement
 * (see `gainForRow`). A partial sale leaves the average cost per remaining
 * share unchanged, so the preceding statement's figure is exact for that
 * case; a symbol bought and sold within the same month is the one case this
 * approximates, since monthly snapshots cannot see the intra-month order of
 * a buy and a sell.
 */
function realizedGainForAccount(
  statements: readonly Statement[],
  accountId: string,
  year: number,
): number {
  const brokerage = statements
    .filter((s) => s.source.accountNo === accountId && s.source.template === "BROKERAGE")
    .sort((a, b) => a.source.period.localeCompare(b.source.period));

  let gain = 0;
  let priorHoldings = new Map<string, Holding>();

  for (const s of brokerage) {
    if (periodYear(s.source.period) === year) {
      gain += realizedGainForStatement(s, priorHoldings);
    }
    priorHoldings = holdingsBySymbol(s.holdings);
  }

  return gain;
}

function sumRealizedGains(
  statements: readonly Statement[],
  taxableIds: ReadonlySet<string>,
  year: number,
): number {
  let total = 0;
  for (const accountId of taxableIds) {
    total += realizedGainForAccount(statements, accountId, year);
  }
  return total;
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
  const activityIncome = sumActivityIncome(statements, taxableIds, year);
  const realizedGains = sumRealizedGains(statements, taxableIds, year);
  return { ...activityIncome, realizedGains };
}

export interface TaxEstimate {
  /** Sum of `income`'s four figures, minus `rrspContributed`, floored at zero. */
  taxableIncome: number;
  /** Echoes the amount actually contributed this year -- never unused room. */
  rrspDeduction: number;
  estimatedTax: number;
  /** Always render this alongside the figures above -- see the type doc. */
  disclaimer: string;
}

/**
 * Not a filing figure. It ignores marginal tax brackets (a single flat
 * `rate` stands in for the real progressive schedule), the dividend
 * gross-up and credit, the 50% capital gains inclusion rate, and every
 * deduction besides the RRSP amount actually contributed this year. Ship
 * `disclaimer` wherever `estimatedTax` is shown.
 */
const TAX_ESTIMATE_DISCLAIMER =
  "Rough estimate only, not a filing figure. Ignores tax brackets, the dividend gross-up and credit, the capital gains inclusion rate, and every deduction besides RRSP contributions actually made this year.";

/**
 * Subtracts `rrspContributed` -- the amount actually contributed this year,
 * never unused room -- from total income, then applies a flat `rate`. See
 * `TaxEstimate` and `TAX_ESTIMATE_DISCLAIMER` for what this deliberately
 * does not model.
 */
export function estimateTax(
  income: IncomeSummary,
  rrspContributed: number,
  rate: number,
): TaxEstimate {
  const grossIncome =
    income.interest + income.eligibleDividends + income.foreignIncome + income.realizedGains;
  const taxableIncome = Math.max(0, grossIncome - rrspContributed);
  return {
    taxableIncome,
    rrspDeduction: rrspContributed,
    estimatedTax: taxableIncome * rate,
    disclaimer: TAX_ESTIMATE_DISCLAIMER,
  };
}
