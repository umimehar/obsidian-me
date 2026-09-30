import type { AccountKind } from "../../store/mask";
import { assetClassOf } from "./assetClass";
import { type FlowPeriod, inPeriod } from "./period";
import {
  CONTRIBUTION_KINDS,
  SOURCE_CATEGORIES,
  cashChangeByAccount,
  flowSummary,
  selectedRows,
} from "./summary";
import type { FlowAccount, FlowRow, FlowsData, SourceCategory } from "./types";

export type TileKey =
  | "paidIn"
  | "invested"
  | "leftInCash"
  | "income"
  | "costs"
  | "left"
  | "investedRate";

export interface BreakdownPart {
  key: string;
  label: string;
  amount: number;
  /** Empty when the part comes from a cash block rather than individual rows -- see `leftInCash`'s per-account parts. */
  rowIds: readonly string[];
}

export interface BreakdownSection {
  title: string;
  parts: readonly BreakdownPart[];
}

export interface TileBreakdown {
  tile: TileKey;
  total: number;
  /** Sums to `total` within a cent, for every tile except `investedRate` -- a rate, not a sum of its own parts. */
  parts: readonly BreakdownPart[];
  /** Informational groupings that do not add into `total`: a second cut of the same money, never a second sum. */
  sections: readonly BreakdownSection[];
}

/**
 * "How the tiles fit": every term of `paidIn + cesg + income + movedIn -
 * costs - left - movedOut - currencyConversion = invested + leftInCash`.
 *
 * `movedIn`/`movedOut` exist because a paired row's OTHER leg can sit in an
 * account the reader filtered out: a TFSA contribution paired with a
 * chequing debit is invisible to `paidIn` (it is a paired row, not an
 * unpaired credit) and invisible to `left` on the chequing side (chequing
 * itself is unselected), so with chequing excluded the identity would be
 * short by exactly that amount. Both are zero under the default
 * all-accounts selection, since no pair's partner is ever outside "every
 * account".
 */
export interface IdentityCheck {
  paidIn: number;
  cesg: number;
  income: number;
  movedIn: number;
  costs: number;
  left: number;
  movedOut: number;
  currencyConversion: number;
  invested: number;
  leftInCash: number;
}

export interface TileBreakdowns {
  paidIn: TileBreakdown;
  invested: TileBreakdown;
  leftInCash: TileBreakdown;
  income: TileBreakdown;
  costs: TileBreakdown;
  left: TileBreakdown;
  investedRate: TileBreakdown;
  identity: IdentityCheck;
}

/**
 * Mirrors `KIND_LABELS` in `graph.ts`. Duplicated rather than imported so
 * this module stays free of `graph.ts` -- the ticket's own browser-safety
 * boundary for `breakdown.ts` names `types`, `assetClass`, `period` and
 * `summary` only.
 */
const KIND_LABEL: Readonly<Record<AccountKind, string>> = {
  TFSA: "TFSA",
  RRSP: "RRSP",
  SpousalRRSP: "Spousal RRSP (spouse's asset)",
  FHSA: "FHSA",
  RESP: "RESP",
  NonRegistered: "Non registered",
  Crypto: "Crypto",
  Chequing: "Chequing",
  Corporate: "Corporate",
};

const SOURCE_LABEL: Readonly<Record<SourceCategory, string>> = {
  payroll: "Payroll deposited",
  outsideBank: "Outside bank",
  interacIn: "Interac received",
  business: "Business",
};

/**
 * One part: the row ids behind it, and the sum of their `amountCad` --
 * negated when `negate` is true, with the same `-0` normalisation
 * `negatedSum` in `summary.ts` applies, so a part with no rows never prints
 * a spurious minus sign.
 */
function part(
  key: string,
  label: string,
  rows: readonly FlowRow[],
  negate: boolean,
): BreakdownPart {
  let total = 0;
  for (const r of rows) total += r.amountCad;
  const amount = negate ? (total === 0 ? 0 : -total) : total;
  return { key, label, amount, rowIds: rows.map((r) => r.id) };
}

function buildPaidIn(
  rows: readonly FlowRow[],
  kindOf: ReadonlyMap<string, AccountKind>,
  total: number,
): TileBreakdown {
  const parts = SOURCE_CATEGORIES.map((cat) =>
    part(
      cat,
      SOURCE_LABEL[cat],
      rows.filter((r) => r.pairId === null && r.category === cat),
      false,
    ),
  );
  const contribRows = rows.filter((r) => {
    if (r.amount <= 0) return false;
    const kind = kindOf.get(r.accountId);
    if (kind === undefined || !CONTRIBUTION_KINDS.includes(kind)) return false;
    return r.code === "CONT" || (kind === "RESP" && r.code === "DEP");
  });
  const contribParts = CONTRIBUTION_KINDS.map((kind) =>
    part(
      kind,
      KIND_LABEL[kind],
      contribRows.filter((r) => kindOf.get(r.accountId) === kind),
      false,
    ),
  ).filter((p) => p.amount !== 0);
  return {
    tile: "paidIn",
    total,
    parts,
    sections:
      contribParts.length === 0
        ? []
        : [{ title: "Of which contributions to registered accounts", parts: contribParts }],
  };
}

function buildInvested(
  rows: readonly FlowRow[],
  kindOf: ReadonlyMap<string, AccountKind>,
  total: number,
): TileBreakdown {
  const buys = rows.filter(
    (r) => r.category === "buy" && assetClassOf(r.symbol) !== "cashEquivalent",
  );
  const sales = rows.filter(
    (r) => r.category === "saleProceeds" && assetClassOf(r.symbol) !== "cashEquivalent",
  );
  const purchases = part("purchases", "Purchases", buys, true);
  const soldPart = part("sales", "Sales", sales, true);

  const byKind = new Map<AccountKind, FlowRow[]>();
  for (const r of [...buys, ...sales]) {
    const kind = kindOf.get(r.accountId);
    if (kind === undefined) continue;
    const list = byKind.get(kind) ?? [];
    list.push(r);
    byKind.set(kind, list);
  }
  const kindParts = [...byKind.entries()]
    .map(([kind, rs]) => part(kind, KIND_LABEL[kind], rs, true))
    .filter((p) => p.amount !== 0);

  return {
    tile: "invested",
    total,
    parts: [purchases, soldPart],
    sections: kindParts.length === 0 ? [] : [{ title: "Net by account type", parts: kindParts }],
  };
}

/**
 * The per-account cash parts carry no `rowIds`: they come from each
 * account's own cash block (`cashChangeByAccount`), not from individual
 * statement rows, the same reason a cash-change Sankey link carries none.
 */
function buildLeftInCash(
  data: FlowsData,
  p: FlowPeriod,
  accounts: ReadonlySet<string>,
  rows: readonly FlowRow[],
  total: number,
): TileBreakdown {
  const accountsById = new Map(data.accounts.map((a) => [a.accountId, a]));
  const byAccount = cashChangeByAccount(data, p, accounts);
  const cashParts: BreakdownPart[] = [...byAccount.entries()]
    .filter(([, amount]) => Math.abs(amount) > 0.005)
    .map(([accountId, amount]) => ({
      key: accountId,
      label: accountsById.get(accountId)?.label ?? accountId,
      amount,
      rowIds: [],
    }))
    .sort((a, b) => b.amount - a.amount);

  const equivRows = rows.filter(
    (r) =>
      (r.category === "buy" || r.category === "saleProceeds") &&
      assetClassOf(r.symbol) === "cashEquivalent",
  );
  const bySymbol = new Map<string, FlowRow[]>();
  for (const r of equivRows) {
    const list = bySymbol.get(r.symbol) ?? [];
    list.push(r);
    bySymbol.set(r.symbol, list);
  }
  const symbolParts = [...bySymbol.entries()]
    .map(([symbol, rs]) => part(symbol, symbol, rs, true))
    .sort((a, b) => b.amount - a.amount);

  return { tile: "leftInCash", total, parts: [...cashParts, ...symbolParts], sections: [] };
}

const INCOME_GROUPS: readonly { key: string; label: string; codes: readonly string[] }[] = [
  { key: "dividends", label: "Dividends", codes: ["DIV"] },
  { key: "interest", label: "Interest", codes: ["INT", "CASH_INTEREST"] },
  { key: "securitiesLending", label: "Securities lending", codes: ["FPLINT"] },
  { key: "cashBack", label: "Cash back", codes: ["CASHBACK"] },
  { key: "rewards", label: "Rewards", codes: ["REFER", "GIVEAWAY", "CASH_REWARD"] },
  { key: "otherRefunds", label: "Other refunds", codes: ["REIMB"] },
];

function buildIncome(rows: readonly FlowRow[], total: number): TileBreakdown {
  const incomeRows = rows.filter((r) => r.category === "income");
  const parts = INCOME_GROUPS.map((g) =>
    part(
      g.key,
      g.label,
      incomeRows.filter((r) => g.codes.includes(r.code)),
      false,
    ),
  );
  return { tile: "income", total, parts, sections: [] };
}

const COST_GROUPS: readonly { key: string; label: string; codes: readonly string[] }[] = [
  { key: "managementFees", label: "Management fees", codes: ["FEE"] },
  { key: "withholdingTax", label: "Withholding tax", codes: ["NRT"] },
  { key: "feeRebates", label: "Fee rebates", codes: ["REIMB"] },
];

function buildCosts(rows: readonly FlowRow[], total: number): TileBreakdown {
  const costRows = rows.filter((r) => r.category === "fee" || r.category === "withholding");
  const parts = COST_GROUPS.map((g) =>
    part(
      g.key,
      g.label,
      costRows.filter((r) => g.codes.includes(r.code)),
      true,
    ),
  );
  return { tile: "costs", total, parts, sections: [] };
}

const LEFT_GROUPS: readonly { key: string; label: string; codes: readonly string[] }[] = [
  { key: "transfersOut", label: "Transfers out", codes: ["TRFOUT", "TRFOUTTF", "CASH_TRANSFER"] },
  { key: "interacSent", label: "Interac sent", codes: ["CASH_INTERAC_OUT"] },
  { key: "withdrawals", label: "Withdrawals", codes: ["WD"] },
  { key: "cardPurchases", label: "Card purchases", codes: ["SPEND"] },
  { key: "sentToPerson", label: "Sent to a person", codes: ["P2P_OUT"] },
];

function buildLeft(
  rows: readonly FlowRow[],
  accountsById: ReadonlyMap<string, FlowAccount>,
  total: number,
): TileBreakdown {
  const leftRows = rows.filter((r) => r.category === "leftWealthsimple" && r.pairId === null);
  const parts = LEFT_GROUPS.map((g) =>
    part(
      g.key,
      g.label,
      leftRows.filter((r) => g.codes.includes(r.code)),
      true,
    ),
  );

  const byAccount = new Map<string, FlowRow[]>();
  for (const r of leftRows) {
    const list = byAccount.get(r.accountId) ?? [];
    list.push(r);
    byAccount.set(r.accountId, list);
  }
  const accountParts = [...byAccount.entries()]
    .map(([accountId, rs]) =>
      part(accountId, accountsById.get(accountId)?.label ?? accountId, rs, true),
    )
    .sort((a, b) => b.amount - a.amount);

  return {
    tile: "left",
    total,
    parts,
    sections: accountParts.length === 0 ? [] : [{ title: "By account", parts: accountParts }],
  };
}

/**
 * The invested rate's own numerator and three denominator terms. Its parts
 * never sum to `total` -- the tile is a ratio, not a sum -- so the UI never
 * prints a share for it; see `FlowTiles.tsx`'s `shareMode`.
 */
function buildInvestedRate(
  rows: readonly FlowRow[],
  investedTotal: number,
  paidIn: number,
  grants: number,
  income: number,
  rate: number | null,
): TileBreakdown {
  const investedRows = rows.filter(
    (r) =>
      (r.category === "buy" || r.category === "saleProceeds") &&
      assetClassOf(r.symbol) !== "cashEquivalent",
  );
  const paidInRows = rows.filter(
    (r) => r.pairId === null && (SOURCE_CATEGORIES as readonly string[]).includes(r.category),
  );
  const grantRows = rows.filter((r) => r.category === "grant");
  const incomeRows = rows.filter((r) => r.category === "income");
  const parts: BreakdownPart[] = [
    {
      key: "invested",
      label: "Invested",
      amount: investedTotal,
      rowIds: investedRows.map((r) => r.id),
    },
    {
      key: "paidIn",
      label: "Paid in from outside",
      amount: paidIn,
      rowIds: paidInRows.map((r) => r.id),
    },
    { key: "cesg", label: "CESG", amount: grants, rowIds: grantRows.map((r) => r.id) },
    { key: "income", label: "Income earned", amount: income, rowIds: incomeRows.map((r) => r.id) },
  ];
  return { tile: "investedRate", total: rate ?? 0, parts, sections: [] };
}

/**
 * The other leg for a paired row, or `null` when unpaired or the partner
 * row is missing -- the same lookup `FlowRows.tsx`'s `partnerLabel` does,
 * kept independent since that module reaches UI code this one must stay
 * free of.
 */
function partnerRow(row: FlowRow, rowsById: ReadonlyMap<string, FlowRow>): FlowRow | null {
  if (row.pairId === null) return null;
  const [outId, inId] = row.pairId.split(">");
  const partnerId = row.id === outId ? inId : outId;
  const partner = partnerId === undefined ? undefined : rowsById.get(partnerId);
  return partner ?? null;
}

/**
 * The two "How the tiles fit" terms a filtered selection can hide: money
 * that arrived in a selected account from a paired leg whose partner sits
 * OUTSIDE the selection (`movedIn`), and money that left a selected
 * account to a partner outside it (`movedOut`). "Outside" means outside
 * the account selection OR outside the period -- a pair lagged across a
 * month boundary (all 249 pairs on the real corpus match same-day, but
 * `select.ts`'s own pairing allows up to three) has its partner leg in a
 * different month, and a single month's own identity would otherwise be
 * short by that leg even with every account selected. `rowsById` is built
 * from the WHOLE corpus, not just `rows`, because the partner leg the
 * reader filtered out -- by account or by period -- is exactly the row
 * this looks up.
 */
function movedAcrossSelection(
  rows: readonly FlowRow[],
  rowsById: ReadonlyMap<string, FlowRow>,
  accounts: ReadonlySet<string>,
  p: FlowPeriod,
): { movedIn: number; movedOut: number } {
  let movedIn = 0;
  let movedOut = 0;
  for (const r of rows) {
    const partner = partnerRow(r, rowsById);
    if (partner === null) continue;
    const crossesBoundary = !accounts.has(partner.accountId) || !inPeriod(partner.period, p);
    if (!crossesBoundary) continue;
    if (r.amountCad > 0) movedIn += r.amountCad;
    else if (r.amountCad < 0) movedOut += -r.amountCad;
  }
  return { movedIn, movedOut };
}

/** The part named by `sectionTitle`/`partKey` in a breakdown, or `undefined` once it no longer exists -- a period or account change can remove it. */
export function findBreakdownPart(
  breakdown: TileBreakdown,
  sectionTitle: string | null,
  partKey: string,
): BreakdownPart | undefined {
  const parts =
    sectionTitle === null
      ? breakdown.parts
      : breakdown.sections.find((s) => s.title === sectionTitle)?.parts;
  return parts?.find((p) => p.key === partKey);
}

/**
 * Every part and section behind the Flow tab's summary tiles, plus the
 * identity that ties them together, for one period and account selection.
 * Every part is filtered from the exact rows `flowSummary` itself reads
 * (`selectedRows`, the shared source categories, `cashChangeByAccount`), so
 * a part and the tile it belongs to can never disagree.
 */
export function tileBreakdowns(
  data: FlowsData,
  p: FlowPeriod,
  accounts: ReadonlySet<string>,
): TileBreakdowns {
  const rows = selectedRows(data, p, accounts);
  const kindOf = new Map(data.accounts.map((a) => [a.accountId, a.kind]));
  const accountsById = new Map(data.accounts.map((a) => [a.accountId, a]));
  const s = flowSummary(data, p, accounts);

  const rowsById = new Map(data.rows.map((r) => [r.id, r]));
  const { movedIn, movedOut } = movedAcrossSelection(rows, rowsById, accounts, p);

  // "Currency conversion" is the spread Wealthsimple charges converting
  // currency, classified `fxConversion` and otherwise counted nowhere on
  // the tab (`CLAUDE.md`'s Costs tile explanation says so: "The currency
  // conversion spread is not in the statements"). It is the one classified
  // category no tile sums, so it is exactly the gap between what came in
  // and out and what the money became -- proven by the corpus identity
  // test, not asserted by fiat. `s.residual`, the small per-block fx
  // revaluation gap, is folded in the same way `sumCash` folds it into
  // `cashChange`, so the identity holds to the cent even on a statement
  // with a genuine reconciliation gap, not only on today's near-zero one.
  const fxRows = rows.filter((r) => r.category === "fxConversion");
  const currencyConversion =
    part("fxConversion", "Currency conversion", fxRows, true).amount - s.residual;

  return {
    paidIn: buildPaidIn(rows, kindOf, s.paidIn),
    invested: buildInvested(rows, kindOf, s.invested),
    leftInCash: buildLeftInCash(data, p, accounts, rows, s.leftInCash),
    income: buildIncome(rows, s.income),
    costs: buildCosts(rows, s.costs),
    left: buildLeft(rows, accountsById, s.left),
    investedRate: buildInvestedRate(rows, s.invested, s.paidIn, s.grants, s.income, s.investedRate),
    identity: {
      paidIn: s.paidIn,
      cesg: s.grants,
      income: s.income,
      movedIn,
      costs: s.costs,
      left: s.left,
      movedOut,
      currencyConversion,
      invested: s.invested,
      leftInCash: s.leftInCash,
    },
  };
}
