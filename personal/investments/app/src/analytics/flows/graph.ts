import type { AccountKind } from "../../store/mask";
import type { Purpose } from "../../store/registry";
import { ASSET_CLASS_LABELS, type AssetClass, assetClassOf } from "./assetClass";
import { inPeriod } from "./period";
import type { FlowPeriod } from "./period";
import type { FlowAccount, FlowRow, FlowsData } from "./types";

export type GroupBy = "accountType" | "account" | "purpose" | "assetClass" | "holding";
export type Column = 0 | 1 | 2 | 3;

export interface FlowNode {
  id: string;
  column: Column;
  label: string;
  value: number;
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
  recycled: boolean;
  rowIds: string[];
}

export interface FlowGraph {
  nodes: FlowNode[];
  links: FlowLink[];
  totalIn: number;
}

export interface DestinationBucket {
  bucket: string;
  values: Record<string, number>;
}

interface Ctx {
  accountsById: Map<string, FlowAccount>;
  rowsById: Map<string, FlowRow>;
  groupBy: GroupBy;
  accounts: ReadonlySet<string>;
}

interface LinkPart {
  source: string;
  target: string;
  value: number;
  recycled: boolean;
  rowId: string | null;
}

const SOURCE_CATEGORIES = new Set(["payroll", "outsideBank", "interacIn", "business"]);

/** Shared with `FlowTiles`'s contribution-by-kind line, so the two name a kind the same way. */
export const KIND_LABELS: Readonly<Record<AccountKind, string>> = {
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

const PURPOSE_LABELS: Readonly<Record<Purpose, string>> = {
  retirement: "Retirement",
  house: "House",
  education: "Education",
  business: "Business",
  growth: "Growth",
  spending: "Spending",
  unassigned: "Unassigned",
};

const STATIC_LABELS: Readonly<Record<string, string>> = {
  "src:payroll": "Payroll deposited",
  "src:outsideBank": "Outside bank",
  "src:interacIn": "Interac received",
  "src:business": "Business",
  "src:grant": "Government grant (CESG)",
  "src:income": "Portfolio income",
  "src:saleProceeds": "Sale proceeds",
  "src:moved": "Moved from another account",
  "src:cash": "Drawn from cash",
  "src:costs": "Fee refunds",
  "src:fx": "Currency conversion",
  "now:fx": "Currency conversion",
  "src:unreconciled": "Unreconciled",
  "now:unreconciled": "Unreconciled",
  "land:chequing": "Chequing",
  "land:direct": "Straight into an account",
  "now:invested": "Invested",
  "now:cashEquivalent": "Cash equivalents",
  "now:cash": "Cash",
  "now:costs": "Fees and withholding",
  "now:left": "Left Wealthsimple",
  "now:moved": "Moved to another account",
  "now:holding:other": "Other holdings",
};

/**
 * The `holding` group by, on the real corpus, draws 411 distinct symbols as
 * their own column-3 node -- an 18,000-unit-tall chart no reader can scan.
 * `assetClass` never needs this: it has five classes, never hundreds.
 */
const HOLDING_CAP = 12;
const OTHER_HOLDING = "now:holding:other";

/**
 * Every `now:holding:<symbol>` part beyond the 12 largest by total absolute
 * value is retargeted to `now:holding:other` before aggregation, so the
 * rest of the pipeline -- `aggregate`, `finalizeLinks`, `assertBalanced` --
 * sees one merged link with every excluded row's id unioned into it, the
 * same way any other two links into one target already merge.
 */
function capHoldingParts(parts: readonly LinkPart[]): LinkPart[] {
  const totals = new Map<string, number>();
  for (const part of parts) {
    if (!part.target.startsWith("now:holding:")) continue;
    totals.set(part.target, (totals.get(part.target) ?? 0) + Math.abs(part.value));
  }
  if (totals.size <= HOLDING_CAP) return [...parts];
  const kept = new Set(
    [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, HOLDING_CAP)
      .map(([id]) => id),
  );
  return parts.map((part) =>
    part.target.startsWith("now:holding:") && !kept.has(part.target)
      ? { ...part, target: OTHER_HOLDING }
      : part,
  );
}

const COLUMN3_ORDER: readonly string[] = [
  "now:cashEquivalent",
  "now:cash",
  "now:costs",
  "now:left",
  "now:moved",
  "now:fx",
  "now:unreconciled",
];

/** `land:chequing` for a chequing account, else `grp:<key>` from the group by. */
function ownKey(account: FlowAccount, groupBy: GroupBy): string {
  if (account.kind === "Chequing") return "land:chequing";
  if (groupBy === "account") return `grp:${account.accountId}`;
  if (groupBy === "purpose") return `grp:${account.purpose}`;
  return `grp:${account.kind}`;
}

function partnerRowId(row: FlowRow): string | null {
  if (row.pairId === null) return null;
  const [outId, inId] = row.pairId.split(">");
  if (outId === undefined || inId === undefined) return null;
  return row.id === outId ? inId : outId;
}

function sourceChain(src: string, own: string, amountCad: number, rowId: string): LinkPart[] {
  if (own === "land:chequing") {
    return [{ source: src, target: "land:chequing", value: amountCad, recycled: false, rowId }];
  }
  return [
    { source: src, target: "land:direct", value: amountCad, recycled: false, rowId },
    { source: "land:direct", target: own, value: amountCad, recycled: false, rowId },
  ];
}

/** Rule 2 and 3: a paired leg whose partner lands on the same node, or a chequing-to-account pair. */
function pairedSameOrHubLinks(
  row: FlowRow,
  own: string,
  partnerOwn: string,
  partnerSelected: boolean,
): LinkPart[] | null {
  if (partnerSelected && partnerOwn === own) return [];
  const isDebit = row.amount < 0;
  const debitOwn = isDebit ? own : partnerOwn;
  const creditOwn = isDebit ? partnerOwn : own;
  const chequingToAccount =
    partnerSelected && debitOwn === "land:chequing" && creditOwn !== "land:chequing";
  if (!chequingToAccount) return null;
  if (!isDebit) return [];
  return [
    {
      source: "land:chequing",
      target: creditOwn,
      value: -row.amountCad,
      recycled: false,
      rowId: row.id,
    },
  ];
}

/** Rule 4: any other paired leg. */
function pairedOtherLinks(row: FlowRow, own: string): LinkPart[] {
  const isDebit = row.amount < 0;
  if (isDebit) {
    return [
      { source: own, target: "now:moved", value: -row.amountCad, recycled: false, rowId: row.id },
    ];
  }
  return sourceChain("src:moved", own, row.amountCad, row.id);
}

function pairedLinks(row: FlowRow, own: string, ctx: Ctx): LinkPart[] {
  const partnerId = partnerRowId(row);
  const partner = partnerId === null ? undefined : ctx.rowsById.get(partnerId);
  if (partner === undefined)
    throw new Error(`flow row ${row.id} pair ${row.pairId} has no partner row`);
  const partnerAccount = ctx.accountsById.get(partner.accountId);
  if (partnerAccount === undefined)
    throw new Error(`flow row ${partner.id} has no matching account`);
  const partnerSelected = ctx.accounts.has(partner.accountId);
  const partnerOwn = ownKey(partnerAccount, ctx.groupBy);

  const hub = pairedSameOrHubLinks(row, own, partnerOwn, partnerSelected);
  if (hub !== null) return hub;
  return pairedOtherLinks(row, own);
}

function buyTarget(row: FlowRow, groupBy: GroupBy): string {
  const cls = assetClassOf(row.symbol);
  if (cls === "cashEquivalent") return "now:cashEquivalent";
  if (groupBy === "assetClass") return `now:class:${cls}`;
  if (groupBy === "holding") return `now:holding:${row.symbol}`;
  return "now:invested";
}

/** One row's unpaired links: rules 5 through 11 of the spec. */
function unpairedLinks(row: FlowRow, own: string): LinkPart[] {
  if (SOURCE_CATEGORIES.has(row.category)) {
    return sourceChain(`src:${row.category}`, own, row.amountCad, row.id);
  }
  if (row.category === "grant") return sourceChain("src:grant", own, row.amountCad, row.id);
  if (row.category === "income" || row.category === "saleProceeds") {
    return [
      {
        source: `src:${row.category}`,
        target: own,
        value: row.amountCad,
        recycled: true,
        rowId: row.id,
      },
    ];
  }
  if (row.category === "leftWealthsimple") {
    return [
      { source: own, target: "now:left", value: -row.amountCad, recycled: false, rowId: row.id },
    ];
  }
  if (row.category === "fee" || row.category === "withholding") {
    return [
      { source: own, target: "now:costs", value: -row.amountCad, recycled: false, rowId: row.id },
    ];
  }
  if (row.category === "fxConversion") {
    return [
      { source: own, target: "now:fx", value: -row.amountCad, recycled: false, rowId: row.id },
    ];
  }
  throw new Error(`flow row ${row.id} has category ${row.category} with no graph rule`);
}

/** One row's link parts, unaggregated. The one place the eleven link rules live. */
function rowLinks(row: FlowRow, ctx: Ctx): LinkPart[] {
  if (row.category === "inKind") return [];
  const account = ctx.accountsById.get(row.accountId);
  if (account === undefined) throw new Error(`flow row ${row.id} has no matching account`);
  const own = ownKey(account, ctx.groupBy);

  if (row.pairId !== null) return pairedLinks(row, own, ctx);
  if (row.category === "buy") {
    return [
      {
        source: own,
        target: buyTarget(row, ctx.groupBy),
        value: -row.amountCad,
        recycled: false,
        rowId: row.id,
      },
    ];
  }
  return unpairedLinks(row, own);
}

interface CashTotals {
  cash: number;
  unrec: number;
}

/**
 * Per selected account, the period's stated cash change and residual,
 * converted to CAD. The cash link carries the raw `closing - opening`; the
 * unreconciled link carries `-residual`, so that once both land in the
 * graph -- the residual link's negative case flipping to a `src:` source
 * via the usual mirror rule -- the identity `rowsNet + residual =
 * closing - opening` (`buildCashBlocks`'s own definition) makes the two
 * links exactly close the gap the row-derived links leave open. A positive
 * residual (real cash grew more than the rows explain) flips to
 * `src:unreconciled -> own`, unexplained money arriving; a negative one
 * (real cash grew less) stays `own -> now:unreconciled`, unexplained money
 * leaving. Identical to summing `rowsNet` alone on the real corpus, where
 * every block's residual is 0.
 */
function cashTotalsByAccount(data: FlowsData, p: FlowPeriod, ctx: Ctx): Map<string, CashTotals> {
  const byAccount = new Map<string, CashTotals>();
  for (const b of data.blocks) {
    if (!ctx.accounts.has(b.accountId) || !inPeriod(b.period, p)) continue;
    const changed = Math.abs(b.closing - b.opening) > 1e-7 || Math.abs(b.residual) > 1e-7;
    const rate = b.currency === "USD" ? b.fxRate : 1;
    if (rate === null) {
      if (changed) {
        throw new Error(
          `flow graph: ${b.accountId} ${b.period} has a USD cash change with no fx rate`,
        );
      }
      continue;
    }
    const entry = byAccount.get(b.accountId) ?? { cash: 0, unrec: 0 };
    entry.cash += (b.closing - b.opening) * rate;
    entry.unrec += -b.residual * rate;
    byAccount.set(b.accountId, entry);
  }
  return byAccount;
}

function cashTotalsLinks(accountId: string, totals: CashTotals, ctx: Ctx): LinkPart[] {
  const account = ctx.accountsById.get(accountId);
  if (account === undefined) return [];
  const own = ownKey(account, ctx.groupBy);
  const parts: LinkPart[] = [];
  if (Math.abs(totals.cash) >= 0.005) {
    parts.push({
      source: own,
      target: "now:cash",
      value: totals.cash,
      recycled: false,
      rowId: null,
    });
  }
  if (Math.abs(totals.unrec) >= 0.005) {
    parts.push({
      source: own,
      target: "now:unreconciled",
      value: totals.unrec,
      recycled: false,
      rowId: null,
    });
  }
  return parts;
}

function cashLinks(data: FlowsData, p: FlowPeriod, ctx: Ctx): LinkPart[] {
  const byAccount = cashTotalsByAccount(data, p, ctx);
  return [...byAccount.entries()].flatMap(([accountId, totals]) =>
    cashTotalsLinks(accountId, totals, ctx),
  );
}

interface AggregatedLink {
  value: number;
  recycled: boolean;
  rowIds: Set<string>;
}

function aggregate(parts: readonly LinkPart[]): Map<string, AggregatedLink> {
  const map = new Map<string, AggregatedLink>();
  for (const part of parts) {
    const key = `${part.source}->${part.target}`;
    const entry = map.get(key) ?? { value: 0, recycled: false, rowIds: new Set<string>() };
    entry.value += part.value;
    if (part.recycled) entry.recycled = true;
    if (part.rowId !== null) entry.rowIds.add(part.rowId);
    map.set(key, entry);
  }
  return map;
}

function mirror(id: string): string {
  if (id.startsWith("now:")) return `src:${id.slice(4)}`;
  if (id.startsWith("src:")) return `now:${id.slice(4)}`;
  return id;
}

/** A link that nets negative flips to its mirror, source and target swapped. */
export function flipNegative(link: FlowLink): FlowLink {
  if (link.value >= 0) return link;
  return {
    source: mirror(link.target),
    target: mirror(link.source),
    value: -link.value,
    recycled: link.recycled,
    rowIds: link.rowIds,
  };
}

function columnOf(id: string): Column {
  if (id.startsWith("src:")) return 0;
  if (id.startsWith("land:")) return 1;
  if (id.startsWith("grp:")) return 2;
  if (id.startsWith("now:")) return 3;
  throw new Error(`node id ${id} has no column`);
}

function grpLabel(id: string, ctx: Ctx): string {
  const raw = id.slice(4);
  if (ctx.groupBy === "account") return ctx.accountsById.get(raw)?.label ?? raw;
  if (ctx.groupBy === "purpose") return PURPOSE_LABELS[raw as Purpose] ?? raw;
  return KIND_LABELS[raw as AccountKind] ?? raw;
}

function nodeLabel(id: string, ctx: Ctx): string {
  const stat = STATIC_LABELS[id];
  if (stat !== undefined) return stat;
  if (id.startsWith("now:class:"))
    return ASSET_CLASS_LABELS[id.slice("now:class:".length) as AssetClass];
  if (id.startsWith("now:holding:")) {
    const symbol = id.slice("now:holding:".length);
    return symbol === "" ? "Unnamed holding" : symbol;
  }
  if (id.startsWith("grp:")) return grpLabel(id, ctx);
  throw new Error(`no label for node ${id}`);
}

function column3Priority(id: string): number {
  if (id === "now:invested" || id.startsWith("now:class:") || id.startsWith("now:holding:"))
    return 0;
  const idx = COLUMN3_ORDER.indexOf(id);
  return idx === -1 ? COLUMN3_ORDER.length + 1 : idx + 1;
}

function sortNodes(nodes: FlowNode[]): FlowNode[] {
  const byColumn = new Map<Column, FlowNode[]>();
  for (const n of nodes) {
    const list = byColumn.get(n.column) ?? [];
    list.push(n);
    byColumn.set(n.column, list);
  }
  const result: FlowNode[] = [];
  for (const col of [0, 1, 2, 3] as const) {
    const list = byColumn.get(col) ?? [];
    if (col === 3)
      list.sort((a, b) => column3Priority(a.id) - column3Priority(b.id) || b.value - a.value);
    else list.sort((a, b) => b.value - a.value);
    result.push(...list);
  }
  return result;
}

function buildNodes(links: readonly FlowLink[], ctx: Ctx): FlowNode[] {
  const inTotal = new Map<string, number>();
  const outTotal = new Map<string, number>();
  for (const l of links) {
    outTotal.set(l.source, (outTotal.get(l.source) ?? 0) + l.value);
    inTotal.set(l.target, (inTotal.get(l.target) ?? 0) + l.value);
  }
  const ids = new Set([...inTotal.keys(), ...outTotal.keys()]);
  const nodes = [...ids].map((id) => ({
    id,
    column: columnOf(id),
    label: nodeLabel(id, ctx),
    value: Math.max(inTotal.get(id) ?? 0, outTotal.get(id) ?? 0),
  }));
  return sortNodes(nodes);
}

/**
 * A link narrower than a cent is dropped ("Links under a cent in absolute
 * value are dropped"), and the `account` group by has far more distinct
 * `(source, target)` keys than `accountType` does, so far more of these
 * sub-cent remainders get dropped in a single month -- on the real corpus
 * that adds up to a one-cent gap for a couple of single-month, `account`
 * group-by periods -- a rounding artifact of comparing sums that were
 * already truncated, not a real imbalance. Asserting on the unrounded
 * aggregate (`buildFlowGraph` does this before dropping sub-cent links,
 * never after) keeps the worst real gap on the corpus at floating-point
 * epsilon, so the tolerance stays one cent, tight enough to catch an
 * actual dropped rule or sign error.
 */
const BALANCE_TOLERANCE = 0.01;

/**
 * The sum out of column 0 equals the sum into column 3, and every column
 * 1/2 node balances. The unreconciled link fully participates: `own`'s
 * cash and unreconciled links are constructed (see `cashTotalsByAccount`)
 * so that `rowsNet + residual = closing - opening` makes every node close
 * exactly, so excluding it would only ever hide a genuine gap, never
 * explain a spurious one.
 */
export function assertBalanced(nodes: readonly FlowNode[], links: readonly FlowLink[]): void {
  const col0Out = links.filter((l) => columnOf(l.source) === 0).reduce((s, l) => s + l.value, 0);
  const col3In = links.filter((l) => columnOf(l.target) === 3).reduce((s, l) => s + l.value, 0);
  if (Math.abs(col0Out - col3In) > BALANCE_TOLERANCE) {
    throw new Error(
      `flow graph does not balance: sources ${col0Out.toFixed(2)} vs uses ${col3In.toFixed(2)}`,
    );
  }
  const inByNode = new Map<string, number>();
  const outByNode = new Map<string, number>();
  for (const l of links) {
    outByNode.set(l.source, (outByNode.get(l.source) ?? 0) + l.value);
    inByNode.set(l.target, (inByNode.get(l.target) ?? 0) + l.value);
  }
  for (const n of nodes) {
    if (n.column !== 1 && n.column !== 2) continue;
    const inV = inByNode.get(n.id) ?? 0;
    const outV = outByNode.get(n.id) ?? 0;
    if (Math.abs(inV - outV) > BALANCE_TOLERANCE) {
      throw new Error(
        `flow node ${n.id} does not balance: in ${inV.toFixed(2)} vs out ${outV.toFixed(2)}`,
      );
    }
  }
}

function buildContext(data: FlowsData, groupBy: GroupBy, accounts: ReadonlySet<string>): Ctx {
  return {
    accountsById: new Map(data.accounts.map((a) => [a.accountId, a])),
    rowsById: new Map(data.rows.map((r) => [r.id, r])),
    groupBy,
    accounts,
  };
}

/** Every aggregated `(source, target)` pair, flipped to its canonical direction, unrounded. */
function finalizeLinks(parts: readonly LinkPart[]): FlowLink[] {
  const links: FlowLink[] = [];
  for (const [key, entry] of aggregate(parts)) {
    const [source, target] = key.split("->") as [string, string];
    links.push(
      flipNegative({
        source,
        target,
        value: entry.value,
        recycled: entry.recycled,
        rowIds: [...entry.rowIds],
      }),
    );
  }
  return links;
}

/** Links under a cent in absolute value are dropped for display, after balance is already proven. */
function dropSubCent(links: readonly FlowLink[]): FlowLink[] {
  return links.filter((l) => Math.abs(l.value) >= 0.01);
}

/**
 * Nodes and links for a period, group by and account selection. Balance is
 * checked on the unrounded aggregate, before sub-cent links are dropped for
 * display -- checking it after would compare two sums that were each
 * independently truncated, which is where the spurious one-cent gaps came
 * from. Throws if the graph does not balance.
 */
export function buildFlowGraph(
  data: FlowsData,
  p: FlowPeriod,
  groupBy: GroupBy,
  accounts: ReadonlySet<string>,
): FlowGraph {
  const ctx = buildContext(data, groupBy, accounts);
  const selectedRows = data.rows.filter((r) => accounts.has(r.accountId) && inPeriod(r.period, p));
  const rowParts = selectedRows.flatMap((row) => rowLinks(row, ctx));
  const parts = groupBy === "holding" ? capHoldingParts(rowParts) : rowParts;
  parts.push(...cashLinks(data, p, ctx));

  const rawLinks = finalizeLinks(parts);
  assertBalanced(buildNodes(rawLinks, ctx), rawLinks);

  const links = dropSubCent(rawLinks);
  const nodes = buildNodes(links, ctx);
  const totalIn = links.filter((l) => columnOf(l.source) === 0).reduce((s, l) => s + l.value, 0);
  return { nodes, links, totalIn };
}

function monthSpan(p: FlowPeriod): number {
  const [fy = 0, fm = 0] = p.from.split("-").map(Number);
  const [ty = 0, tm = 0] = p.to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

function bucketKey(period: string, yearly: boolean): string {
  return yearly ? period.slice(0, 4) : period;
}

/** A genuine deposit into an account: money handed off from the chequing hub or landed straight in. */
function depositPartsOf(row: FlowRow, ctx: Ctx): LinkPart[] {
  const parts = rowLinks(row, ctx);
  // A row routed through `src:moved` is money that moved from another of
  // the owner's own accounts, not new money arriving -- excluded even
  // though its landing link's source still reads `land:direct`.
  if (parts.some((part) => part.source === "src:moved")) return [];
  return parts.filter(
    (part) =>
      part.target.startsWith("grp:") &&
      (part.source === "land:chequing" || part.source === "land:direct"),
  );
}

/**
 * Money arriving in accounts -- deposits landing from the chequing hub or
 * straight in, never recycled money (income, sale proceeds) or money moved
 * between the owner's own accounts -- bucketed by month, or by year past
 * 24 months, keyed by the destination's label. Built off the same
 * `rowLinks` the Sankey uses, so the two can never disagree about what a
 * link between column 1 and column 2 means.
 */
export function depositsByDestination(
  data: FlowsData,
  p: FlowPeriod,
  groupBy: GroupBy,
  accounts: ReadonlySet<string>,
): DestinationBucket[] {
  const ctx = buildContext(data, groupBy, accounts);
  const yearly = monthSpan(p) > 24;
  const buckets = new Map<string, Record<string, number>>();
  for (const row of data.rows) {
    if (!accounts.has(row.accountId) || !inPeriod(row.period, p)) continue;
    const parts = depositPartsOf(row, ctx);
    if (parts.length === 0) continue;
    const key = bucketKey(row.period, yearly);
    const values = buckets.get(key) ?? {};
    for (const part of parts) {
      const label = nodeLabel(part.target, ctx);
      values[label] = (values[label] ?? 0) + part.value;
    }
    buckets.set(key, values);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([bucket, values]) => ({ bucket, values }));
}
