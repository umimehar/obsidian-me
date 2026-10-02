import { REGISTERED_KINDS } from "../../analytics/accountScopes";
import type { AnalyticsOutput } from "../../analytics/build";
import type { HoldingSummary, HoldingsOutput } from "../../analytics/holdings";
import type { SaleDetail } from "../../analytics/income";
import type { SuperficialLossCandidate } from "../../analytics/superficialLoss";
import type { AccountKind } from "../../store/mask";

/**
 * Pure, tested presentation summaries for the Non-registered and Corporate
 * tax tabs. Everything here derives from fields `analytics.json` already
 * carries -- no new build-time analytics, just grouping and filtering the
 * owner reads on screen.
 */

export interface AccountSalesSummary {
  maskedId: string;
  label: string;
  count: number;
  proceeds: number;
  netGain: number;
}

/** Realized sales for the year, grouped by account, sorted by label. */
export function salesByAccount(
  sales: readonly SaleDetail[],
  labelById: ReadonlyMap<string, string>,
): AccountSalesSummary[] {
  const byAccount = new Map<string, AccountSalesSummary>();
  for (const sale of sales) {
    const existing = byAccount.get(sale.maskedId) ?? {
      maskedId: sale.maskedId,
      label: labelById.get(sale.maskedId) ?? sale.maskedId,
      count: 0,
      proceeds: 0,
      netGain: 0,
    };
    existing.count += 1;
    existing.proceeds += sale.proceeds;
    existing.netGain += sale.gain;
    byAccount.set(sale.maskedId, existing);
  }
  return [...byAccount.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export interface MonthSalesSummary {
  month: string;
  count: number;
  proceeds: number;
  netGain: number;
}

/** Realized sales for the year, grouped by calendar month (`YYYY-MM`), oldest first -- at most 12 rows, one per month a year can have. */
export function salesByMonth(sales: readonly SaleDetail[]): MonthSalesSummary[] {
  const byMonth = new Map<string, MonthSalesSummary>();
  for (const sale of sales) {
    const month = sale.date.slice(0, 7);
    const existing = byMonth.get(month) ?? { month, count: 0, proceeds: 0, netGain: 0 };
    existing.count += 1;
    existing.proceeds += sale.proceeds;
    existing.netGain += sale.gain;
    byMonth.set(month, existing);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface UnknownCostSummary {
  count: number;
  gain: number;
}

/** How many sales in the year have no cost basis, and the gain they were counted at (never silently dropped from the total). */
export function unknownCostSummary(sales: readonly SaleDetail[]): UnknownCostSummary {
  const unknown = sales.filter((s) => s.costUnknown);
  return { count: unknown.length, gain: unknown.reduce((sum, s) => sum + s.gain, 0) };
}

export interface CapitalLossCarryforwardRow {
  year: number;
  /** This year's net ALLOWABLE loss (`|realizedGains| x inclusion`), zero for a net-gain year. */
  yearLoss: number;
  /** The running balance carried forward, oldest year first -- never resets, and never applied against a future gain automatically. */
  running: number;
}

/**
 * The personal capital-loss carryforward, year by year: an estimate, never
 * a filing number, since the actual balance on file with CRA can differ
 * (a loss already claimed in a prior return, one carried BACK three years
 * instead of forward, etc). Only a net-loss year adds to the running
 * balance; a net-gain year contributes nothing and leaves it unchanged
 * rather than reducing it, since applying a carryforward against a gain is
 * the owner's own election, never automatic.
 */
export function capitalLossCarryforward(
  income: AnalyticsOutput["income"],
  inclusion: number,
): CapitalLossCarryforwardRow[] {
  const years = Object.keys(income)
    .map(Number)
    .sort((a, b) => a - b);
  let running = 0;
  return years.map((year) => {
    const realized = income[String(year)]?.realizedGains ?? 0;
    const yearLoss = realized < 0 ? Math.abs(realized) * inclusion : 0;
    running += yearLoss;
    return { year, yearLoss, running };
  });
}

export interface CrossAccountLoss {
  sale: SaleDetail;
  replacementAccountId: string;
}

export interface SameAccountSummary {
  count: number;
  total: number;
}

export interface SuperficialLossSplit {
  /** Confirmed losses whose replacement buy landed in a DIFFERENT account -- the owner's own doing, worth a line each. */
  crossAccount: CrossAccountLoss[];
  /** Confirmed losses whose replacement buy landed in the SAME account -- direct indexing's own rebalancing, summarized as one line rather than listed. Null when there are none. */
  sameAccount: SameAccountSummary | null;
}

/** Splits confirmed superficial losses into the cross-account ones (listed) and the same-account ones (summarized) -- see `redesign-spec.md`'s "Needs attention" section. */
export function splitSuperficialLosses(
  candidates: readonly SuperficialLossCandidate[],
): SuperficialLossSplit {
  const confirmed = candidates.filter((c) => c.status === "confirmed" && c.matchedBuy !== null);
  const crossAccount: CrossAccountLoss[] = [];
  let sameCount = 0;
  let sameTotal = 0;
  for (const c of confirmed) {
    const matchedBuy = c.matchedBuy;
    if (matchedBuy === null) continue;
    if (matchedBuy.maskedId !== c.sale.maskedId) {
      crossAccount.push({ sale: c.sale, replacementAccountId: matchedBuy.maskedId });
    } else {
      sameCount += 1;
      sameTotal += Math.abs(c.sale.gain);
    }
  }
  return {
    crossAccount,
    sameAccount: sameCount === 0 ? null : { count: sameCount, total: sameTotal },
  };
}

/** Superficial-loss windows still open (status `"pending"`) -- the owner can still avoid denial by not repurchasing before `windowEnd`. */
export function openSuperficialLossWindows(
  candidates: readonly SuperficialLossCandidate[],
): SuperficialLossCandidate[] {
  return candidates.filter((c) => c.status === "pending");
}

export interface HarvestCandidate {
  symbol: string;
  name: string;
  loss: number;
  taxValue: number;
}

const HARVEST_THRESHOLD = 100;

/** Unrealized losses over $100, personal scope only -- holding-level harvesting candidates with their tax value at the marginal rate. */
export function harvestCandidates(
  holdings: HoldingsOutput,
  rates: { inclusion: number; rate: number } | null,
): HarvestCandidate[] {
  if (rates === null) return [];
  const candidates: HarvestCandidate[] = [];
  for (const h of holdings.holdings) {
    const loss = h.value - h.bookCost;
    if (loss >= -HARVEST_THRESHOLD) continue;
    candidates.push({
      symbol: h.symbol || h.name,
      name: h.name,
      loss,
      taxValue: Math.abs(loss) * rates.inclusion * rates.rate,
    });
  }
  return candidates.sort((a, b) => a.loss - b.loss);
}

/** True when a holding row is a cash line (symbol-less, `bookCost` always 0) -- never a holding to show in a symbol table. */
export function isCashHolding(holding: HoldingSummary): boolean {
  return holding.symbol === "" && holding.name.startsWith("Cash (");
}

/** Every non-cash holding whose `accounts` list names `accountLabel` -- a pooled holding appears under every account it is pooled across, each time at its full combined value, since a shared ACB pool is not something this project can split back to one account's share. */
export function holdingsForAccount(
  holdings: HoldingsOutput,
  accountLabel: string,
): HoldingSummary[] {
  return holdings.holdings.filter((h) => !isCashHolding(h) && h.accounts.includes(accountLabel));
}

/** `rows`, with every entry `isZero` flags removed -- e.g. a corporate history year with no activity at all. Order is preserved. */
export function hideZeroRows<T>(rows: readonly T[], isZero: (row: T) => boolean): T[] {
  return rows.filter((row) => !isZero(row));
}

export interface AttentionItem {
  key: string;
  text: string;
  anchor: string;
  tone: "amber" | "gray";
}

const T1135_ATTENTION_SHARE = 0.8;

/**
 * The "Needs attention" list: superficial losses that crossed accounts (one
 * line each, the owner's own doing and avoidable), the same-account
 * direct-indexing repurchases (one summarizing line), open superficial-loss
 * windows, harvest candidates over $100 (personal scope only), and a T1135
 * flag once the year's maximum cost crosses 80% of the filing threshold.
 * Empty when nothing qualifies -- the caller renders the single quiet line.
 */
/** `true` when a buy landing in this account's kind permanently denies the loss (a registered wrapper has no cost base to add a denied loss to); `false` when it is deferred into the new shares' cost instead. */
function buyDeniesPermanently(buyingKind: AccountKind | undefined): boolean {
  return buyingKind !== undefined && REGISTERED_KINDS.has(buyingKind);
}

export function attentionItems(input: {
  superficialLoss: readonly SuperficialLossCandidate[];
  harvest: readonly HarvestCandidate[];
  t1135MaxCost: number | null;
  t1135FilingThreshold: number | null;
  labelById: ReadonlyMap<string, string>;
  kindById: ReadonlyMap<string, AccountKind>;
  formatCurrency: (amount: number) => string;
}): AttentionItem[] {
  const {
    superficialLoss,
    harvest,
    t1135MaxCost,
    t1135FilingThreshold,
    labelById,
    kindById,
    formatCurrency,
  } = input;
  const items: AttentionItem[] = [];
  const split = splitSuperficialLosses(superficialLoss);

  for (const { sale, replacementAccountId } of split.crossAccount) {
    const buyingLabel = labelById.get(replacementAccountId) ?? replacementAccountId;
    const fate = buyDeniesPermanently(kindById.get(replacementAccountId))
      ? "Gone permanently (registered account)"
      : "Deferred: added to the cost of the shares bought";
    items.push({
      key: `cross:${sale.maskedId}:${sale.symbol}:${sale.date}`,
      text:
        `${sale.symbol}: ${formatCurrency(Math.abs(sale.gain))} of loss denied because you bought ` +
        `${sale.symbol} in your ${buyingLabel} within 30 days. ${fate}.`,
      anchor: "#superficial-loss-watch",
      tone: "amber",
    });
  }

  if (split.sameAccount !== null) {
    items.push({
      key: "same-account-superficial",
      text:
        `${split.sameAccount.count} loss${split.sameAccount.count === 1 ? "" : "es"} deferred by ` +
        `direct indexing buying back within 30 days, ${formatCurrency(split.sameAccount.total)} ` +
        "total; deferred, not lost.",
      anchor: "#superficial-loss-watch",
      tone: "gray",
    });
  }

  for (const open of openSuperficialLossWindows(superficialLoss)) {
    items.push({
      key: `open:${open.sale.maskedId}:${open.sale.symbol}:${open.sale.date}`,
      text: `Don't buy ${open.sale.symbol} until ${open.windowEnd}, or its ${formatCurrency(
        Math.abs(open.sale.gain),
      )} loss from ${open.sale.date} may become superficial.`,
      anchor: "#superficial-loss-watch",
      tone: "amber",
    });
  }

  for (const h of harvest) {
    items.push({
      key: `harvest:${h.symbol}`,
      text: `${h.symbol}: unrealized loss ${formatCurrency(h.loss)}, worth about ${formatCurrency(
        h.taxValue,
      )} in tax if harvested this year.`,
      anchor: "#holdings",
      tone: "gray",
    });
  }

  if (
    t1135MaxCost !== null &&
    t1135FilingThreshold !== null &&
    t1135MaxCost > t1135FilingThreshold * T1135_ATTENTION_SHARE
  ) {
    items.push({
      key: "t1135-threshold",
      text: `Foreign property cost reached ${formatCurrency(t1135MaxCost)}, over 80% of the ${formatCurrency(
        t1135FilingThreshold,
      )} T1135 filing threshold.`,
      anchor: "#t1135-foreign-property",
      tone: "amber",
    });
  }

  return items;
}
