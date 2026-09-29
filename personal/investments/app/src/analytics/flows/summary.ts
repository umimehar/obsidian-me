import type { AccountKind } from "../../store/mask";
import { assetClassOf } from "./assetClass";
import { inPeriod } from "./period";
import type { FlowPeriod } from "./period";
import type { FlowRow, FlowsData, SourceCategory } from "./types";

export interface FlowSummary {
  paidIn: number;
  paidInBySource: Record<SourceCategory, number>;
  contributionsByKind: Partial<Record<AccountKind, number>>;
  grants: number;
  income: number;
  invested: number;
  cashEquivalentNet: number;
  cashChange: number;
  leftInCash: number;
  costs: number;
  left: number;
  investedRate: number | null;
  unpairedLegs: number;
  laggedPairs: number;
  residual: number;
  /**
   * Symbols the period bought that both go uncounted by the asset class
   * table and read, by their own held name, as a likely non-equity class
   * (`collectSuspectSymbols`) -- never every unlisted symbol, which on the
   * real corpus is most ordinary equities and would name about 150 tickers.
   */
  unlistedSymbols: string[];
}

const SOURCE_CATEGORIES: readonly SourceCategory[] = [
  "payroll",
  "outsideBank",
  "interacIn",
  "business",
];
/** Shared with `FlowTiles`'s contributions-by-kind line, so the two name and order kinds the same way. */
export const CONTRIBUTION_KINDS: readonly AccountKind[] = [
  "TFSA",
  "RRSP",
  "SpousalRRSP",
  "FHSA",
  "RESP",
];

function selectedRows(data: FlowsData, p: FlowPeriod, accounts: ReadonlySet<string>): FlowRow[] {
  return data.rows.filter((r) => accounts.has(r.accountId) && inPeriod(r.period, p));
}

/** Unpaired movement credits by source category: the money that arrived from outside. */
function sumPaidIn(rows: readonly FlowRow[]): Record<SourceCategory, number> {
  const paidIn: Record<SourceCategory, number> = {
    payroll: 0,
    outsideBank: 0,
    interacIn: 0,
    business: 0,
  };
  for (const r of rows) {
    if (r.pairId !== null) continue;
    if (!(SOURCE_CATEGORIES as readonly string[]).includes(r.category)) continue;
    paidIn[r.category as SourceCategory] += r.amountCad;
  }
  return paidIn;
}

/** `CONT` credits on TFSA/RRSP/SpousalRRSP/FHSA/RESP, plus `DEP` credits on RESP, paired or not. */
function sumContributions(
  rows: readonly FlowRow[],
  kindOf: ReadonlyMap<string, AccountKind>,
): Partial<Record<AccountKind, number>> {
  const totals: Partial<Record<AccountKind, number>> = {};
  for (const r of rows) {
    if (r.amount <= 0) continue;
    const kind = kindOf.get(r.accountId);
    if (kind === undefined || !CONTRIBUTION_KINDS.includes(kind)) continue;
    const isContribution = r.code === "CONT" || (kind === "RESP" && r.code === "DEP");
    if (!isContribution) continue;
    totals[kind] = (totals[kind] ?? 0) + r.amountCad;
  }
  return totals;
}

/**
 * Buys less sale proceeds, as positive money in, split by whether the
 * symbol is a cash equivalent. `-amountCad` alone does both jobs: a buy's
 * `amountCad` is a negative debit, so negating it adds the purchase; a
 * sale's is a positive credit, so negating it subtracts the proceeds.
 */
function sumTraded(rows: readonly FlowRow[], wantCashEquivalent: boolean): number {
  let total = 0;
  for (const r of rows) {
    if (r.category !== "buy" && r.category !== "saleProceeds") continue;
    if ((assetClassOf(r.symbol) === "cashEquivalent") !== wantCashEquivalent) continue;
    total += -r.amountCad;
  }
  return total;
}

/**
 * `cashChange` is the raw `closing - opening`, matching `graph.ts`'s cash
 * link exactly -- both figures have to describe the same money. A USD
 * block with no fx rate throws naming the account and period, the same as
 * `graph.ts`'s cash link, rather than silently dropping a real change: a
 * summary tile that quietly reads $0 lower than the Sankey it sits beside
 * is worse than a loud failure.
 */
function sumCash(
  data: FlowsData,
  p: FlowPeriod,
  accounts: ReadonlySet<string>,
): { cashChange: number; residual: number } {
  let cashChange = 0;
  let residual = 0;
  for (const b of data.blocks) {
    if (!accounts.has(b.accountId) || !inPeriod(b.period, p)) continue;
    const changed = Math.abs(b.closing - b.opening) > 1e-7 || Math.abs(b.residual) > 1e-7;
    const rate = b.currency === "USD" ? b.fxRate : 1;
    if (rate === null) {
      if (changed) {
        throw new Error(
          `flow summary: ${b.accountId} ${b.period} has a USD cash change with no fx rate`,
        );
      }
      continue;
    }
    cashChange += (b.closing - b.opening) * rate;
    residual += b.residual * rate;
  }
  return { cashChange, residual };
}

/**
 * Every symbol in `suspectSymbols` (built once, from the held name, at
 * build time -- see `collectSuspectSymbols`) that the period's own selected
 * rows actually bought, scoped to this call the same way every other
 * figure here is scoped to the period and account selection.
 */
function sumUnlistedSymbols(
  rows: readonly FlowRow[],
  suspectSymbols: ReadonlySet<string>,
): string[] {
  return [
    ...new Set(
      rows
        .filter((r) => r.category === "buy" && r.symbol !== "" && suspectSymbols.has(r.symbol))
        .map((r) => r.symbol),
    ),
  ].sort();
}

/**
 * The negated sum of `amount` over `rows`, with `-0` normalised to a plain
 * `0`. Negating a sum of zero rows (no fee, no withholding, nothing left
 * Wealthsimple) yields the IEEE `-0`, which is numerically zero but reads
 * through `formatCurrency` as "-$0.00" -- a real month, `2023-06`'s Costs
 * tile, prints a minus sign in front of nothing.
 */
function negatedSum(rows: readonly FlowRow[], amount: (r: FlowRow) => number): number {
  const total = rows.reduce((s, r) => s + amount(r), 0);
  return total === 0 ? 0 : -total;
}

function countLagged(rows: readonly FlowRow[]): number {
  return new Set(
    rows
      .filter((r) => r.lagDays !== null && r.lagDays > 0 && r.pairId !== null)
      .map((r) => r.pairId),
  ).size;
}

/** The Flow tab's summary tiles, computed once over a period and account selection. */
export function flowSummary(
  data: FlowsData,
  p: FlowPeriod,
  accounts: ReadonlySet<string>,
): FlowSummary {
  const rows = selectedRows(data, p, accounts);
  const kindOf = new Map(data.accounts.map((a) => [a.accountId, a.kind]));

  const paidInBySource = sumPaidIn(rows);
  const paidIn = Object.values(paidInBySource).reduce((s, v) => s + v, 0);
  const grants = rows.filter((r) => r.category === "grant").reduce((s, r) => s + r.amountCad, 0);
  const income = rows.filter((r) => r.category === "income").reduce((s, r) => s + r.amountCad, 0);
  const invested = sumTraded(rows, false);
  const cashEquivalentNet = sumTraded(rows, true);
  const { cashChange, residual } = sumCash(data, p, accounts);
  const costs = negatedSum(
    rows.filter((r) => r.category === "fee" || r.category === "withholding"),
    (r) => r.amountCad,
  );
  const left = negatedSum(
    rows.filter((r) => r.category === "leftWealthsimple" && r.pairId === null),
    (r) => r.amountCad,
  );
  const denominator = paidIn + grants + income;

  return {
    paidIn,
    paidInBySource,
    contributionsByKind: sumContributions(rows, kindOf),
    grants,
    income,
    invested,
    cashEquivalentNet,
    cashChange,
    leftInCash: cashChange + cashEquivalentNet,
    costs,
    left,
    investedRate: denominator > 0 ? invested / denominator : null,
    unpairedLegs: rows.filter((r) => r.movement && r.pairId === null).length,
    laggedPairs: countLagged(rows),
    residual,
    unlistedSymbols: sumUnlistedSymbols(rows, new Set(data.suspectSymbols)),
  };
}
