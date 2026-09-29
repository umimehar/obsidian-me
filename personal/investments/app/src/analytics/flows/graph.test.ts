import { describe, expect, test } from "bun:test";
import type { AccountKind } from "../../store/mask";
import type { Purpose } from "../../store/registry";
import type { Currency } from "../../types";
import {
  type FlowLink,
  type FlowNode,
  type GroupBy,
  assertBalanced,
  buildFlowGraph,
  depositsByDestination,
} from "./graph";
import type { CashBlock, FlowAccount, FlowRow, FlowsData } from "./types";

function account(
  overrides: Partial<FlowAccount> & { accountId: string; kind: AccountKind },
): FlowAccount {
  return {
    shortId: overrides.accountId.slice(-4),
    label: overrides.accountId,
    purpose: "growth" as Purpose,
    inTotals: true,
    firstPeriod: "2026-01",
    lastPeriod: "2026-12",
    closed: false,
    ...overrides,
  };
}

function row(overrides: Partial<FlowRow> & { accountId: string }): FlowRow {
  return {
    id: `${overrides.accountId}:0`,
    period: "2026-05",
    date: "2026-05-15",
    code: "CONT",
    category: "outsideBank",
    movement: false,
    amountCad: 0,
    currency: "CAD" as Currency,
    amount: 0,
    fxRate: null,
    symbol: "",
    pairId: null,
    lagDays: null,
    ...overrides,
  };
}

/** Derives one balanced CashBlock per account, period, currency from the rows' own amounts -- residual 0. */
function autoBlocks(rows: readonly FlowRow[]): CashBlock[] {
  const net = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.accountId}|${r.period}|${r.currency}`;
    net.set(key, (net.get(key) ?? 0) + r.amount);
  }
  return [...net.entries()].map(([key, amount]) => {
    const [accountId = "", period = "", currency = "CAD"] = key.split("|");
    return {
      accountId,
      period,
      currency: currency as Currency,
      opening: 0,
      closing: amount,
      fxRate: currency === "USD" ? 1.4 : null,
      rowsNet: amount,
      residual: 0,
    };
  });
}

function data(rows: FlowRow[], accounts: FlowAccount[], blocks?: CashBlock[]): FlowsData {
  return { generated: "2026-09-29", accounts, rows, blocks: blocks ?? autoBlocks(rows) };
}

const ALL_PERIOD = { from: "2026-01", to: "2026-12" };

function pair(
  outRow: Partial<FlowRow> & { accountId: string },
  inRow: Partial<FlowRow> & { accountId: string },
) {
  const o = row({
    ...outRow,
    id: "o",
    movement: true,
    code: "TRFOUT",
    category: "leftWealthsimple",
  });
  const i = row({ ...inRow, id: "i", movement: true, code: "CONT", category: "outsideBank" });
  return [
    { ...o, pairId: "o>i" },
    { ...i, pairId: "o>i" },
  ];
}

function linkLike(
  links: readonly FlowLink[],
  source: string,
  target: string,
): FlowLink | undefined {
  return links.find((l) => l.source === source && l.target === target);
}

describe("buildFlowGraph", () => {
  test("payroll into chequing, part of it paired onward to an RRSP: the RRSP link comes off the debit leg only", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const payroll = row({
      accountId: "acct_cheq",
      code: "AFT_IN",
      category: "payroll",
      movement: true,
      amountCad: 3101.5,
      amount: 3101.5,
    });
    const [out, inn] = pair(
      { accountId: "acct_cheq", amountCad: -800, amount: -800 },
      { accountId: "acct_rrsp", amountCad: 800, amount: 800 },
    );
    const d = data([payroll, out as FlowRow, inn as FlowRow], [cheq, rrsp]);
    const accounts = new Set(["acct_cheq", "acct_rrsp"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "accountType", accounts);

    expect(linkLike(graph.links, "src:payroll", "land:chequing")?.value).toBeCloseTo(3101.5, 6);
    expect(linkLike(graph.links, "land:chequing", "grp:RRSP")?.value).toBeCloseTo(800, 6);
    expect(linkLike(graph.links, "land:chequing", "grp:RRSP")?.rowIds).toEqual(["o"]);
  });

  test("an account filter excluding chequing turns the paired credit into money moved from another account", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const [out, inn] = pair(
      { accountId: "acct_cheq", amountCad: -800, amount: -800 },
      { accountId: "acct_rrsp", amountCad: 800, amount: 800 },
    );
    const d = data([out as FlowRow, inn as FlowRow], [cheq, rrsp]);
    const accounts = new Set(["acct_rrsp"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "accountType", accounts);

    expect(linkLike(graph.links, "src:moved", "land:direct")?.value).toBeCloseTo(800, 6);
    expect(linkLike(graph.links, "land:direct", "grp:RRSP")?.value).toBeCloseTo(800, 6);
    expect(linkLike(graph.links, "src:outsideBank", "land:direct")).toBeUndefined();
  });

  test("two TFSAs pairing under accountType produce no link at all", () => {
    const a = account({ accountId: "acct_a", kind: "TFSA" });
    const b = account({ accountId: "acct_b", kind: "TFSA" });
    const [out, inn] = pair(
      { accountId: "acct_a", amountCad: -500, amount: -500 },
      { accountId: "acct_b", amountCad: 500, amount: 500 },
    );
    const d = data([out as FlowRow, inn as FlowRow], [a, b]);
    const accounts = new Set(["acct_a", "acct_b"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "accountType", accounts);

    expect(graph.links).toEqual([]);
  });

  test("two TFSAs pairing under account grouping produce moved-out and moved-in links", () => {
    const a = account({ accountId: "acct_a", kind: "TFSA" });
    const b = account({ accountId: "acct_b", kind: "TFSA" });
    const [out, inn] = pair(
      { accountId: "acct_a", amountCad: -500, amount: -500 },
      { accountId: "acct_b", amountCad: 500, amount: 500 },
    );
    const d = data([out as FlowRow, inn as FlowRow], [a, b]);
    const accounts = new Set(["acct_a", "acct_b"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "account", accounts);

    expect(linkLike(graph.links, "grp:acct_a", "now:moved")?.value).toBeCloseTo(500, 6);
    expect(linkLike(graph.links, "src:moved", "land:direct")?.value).toBeCloseTo(500, 6);
    expect(linkLike(graph.links, "land:direct", "grp:acct_b")?.value).toBeCloseTo(500, 6);
  });

  test("cash falling to fund a buy: the buy is drawn from cash", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const buy = row({
      accountId: "acct_tfsa",
      code: "BUY",
      category: "buy",
      symbol: "VFV",
      amountCad: -100,
      amount: -100,
    });
    const d = data([buy], [tfsa]);
    const accounts = new Set(["acct_tfsa"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "accountType", accounts);

    expect(linkLike(graph.links, "src:cash", "grp:TFSA")?.value).toBeCloseTo(100, 6);
    expect(linkLike(graph.links, "grp:TFSA", "now:invested")?.value).toBeCloseTo(100, 6);
  });

  test("a buy of a cash equivalent symbol lands under now:cashEquivalent", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const buy = row({
      accountId: "acct_tfsa",
      code: "BUY",
      category: "buy",
      symbol: "PSA",
      amountCad: -500,
      amount: -500,
    });
    const d = data([buy], [tfsa]);
    const accounts = new Set(["acct_tfsa"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "accountType", accounts);

    expect(linkLike(graph.links, "grp:TFSA", "now:cashEquivalent")?.value).toBeCloseTo(500, 6);
  });

  test("group by purpose labels nodes by the account's purpose, sentence-cased", () => {
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP", purpose: "retirement" });
    const house = account({ accountId: "acct_house", kind: "NonRegistered", purpose: "house" });
    const contribution = row({
      accountId: "acct_rrsp",
      code: "CONT",
      category: "outsideBank",
      movement: true,
      amountCad: 500,
      amount: 500,
    });
    const deposit = row({
      accountId: "acct_house",
      id: "acct_house:0",
      code: "CONT",
      category: "outsideBank",
      movement: true,
      amountCad: 300,
      amount: 300,
    });
    const d = data([contribution, deposit], [rrsp, house]);
    const accounts = new Set(["acct_rrsp", "acct_house"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "purpose", accounts);

    const retirement = graph.nodes.find((n: FlowNode) => n.id === "grp:retirement");
    const houseNode = graph.nodes.find((n: FlowNode) => n.id === "grp:house");
    expect(retirement?.label).toBe("Retirement");
    expect(houseNode?.label).toBe("House");
    expect(linkLike(graph.links, "land:direct", "grp:retirement")?.value).toBeCloseTo(500, 6);
    expect(linkLike(graph.links, "land:direct", "grp:house")?.value).toBeCloseTo(300, 6);
  });

  test("group by holding: a buy with an empty symbol lands under Unnamed holding", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const buy = row({
      accountId: "acct_tfsa",
      code: "BUY",
      category: "buy",
      symbol: "",
      amountCad: -200,
      amount: -200,
    });
    const d = data([buy], [tfsa]);
    const accounts = new Set(["acct_tfsa"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "holding", accounts);

    const node = graph.nodes.find((n: FlowNode) => n.id === "now:holding:");
    expect(node?.label).toBe("Unnamed holding");
    expect(linkLike(graph.links, "grp:TFSA", "now:holding:")?.value).toBeCloseTo(200, 6);
  });

  test("group by holding caps at the 12 largest, rolling the rest into Other holdings", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    // 15 symbols, SYM0 the largest at $1,000 down to SYM14 the smallest at
    // $986: the top 12 (SYM0..SYM11) keep their own node, the smallest 3
    // (SYM12..SYM14, $988 + $987 + $986 = $2,961) roll into one.
    const rows = Array.from({ length: 15 }, (_, i) =>
      row({
        id: `buy${i}`,
        accountId: "acct_tfsa",
        code: "BUY",
        category: "buy",
        symbol: `SYM${i}`,
        amountCad: -(1000 - i),
        amount: -(1000 - i),
      }),
    );
    const d = data(rows, [tfsa]);
    const accounts = new Set(["acct_tfsa"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "holding", accounts);

    const holdingNodes = graph.nodes.filter((n: FlowNode) => n.id.startsWith("now:holding:"));
    expect(holdingNodes).toHaveLength(13);
    expect(graph.nodes.find((n: FlowNode) => n.id === "now:holding:SYM0")?.value).toBeCloseTo(
      1000,
      6,
    );
    const other = graph.nodes.find((n: FlowNode) => n.id === "now:holding:other");
    expect(other?.label).toBe("Other holdings");
    expect(other?.value).toBeCloseTo(988 + 987 + 986, 6);
    const otherLink = linkLike(graph.links, "grp:TFSA", "now:holding:other");
    expect(otherLink?.value).toBeCloseTo(988 + 987 + 986, 6);
    expect([...(otherLink?.rowIds ?? [])].sort()).toEqual(["buy12", "buy13", "buy14"]);
    // The kept 12 are untouched, still their own symbol.
    expect(linkLike(graph.links, "grp:TFSA", "now:holding:SYM11")?.value).toBeCloseTo(989, 6);
  });

  test("a positive residual (real cash grew more than the rows explain) flips to money arriving from nowhere", () => {
    // opening 0, closing 105, one +100 CONT row: rowsNet 100, residual
    // closing - opening - rowsNet = 5. The cash link is the raw
    // closing - opening (105); the unreconciled link is -residual (-5),
    // which nets negative and flips to src:unreconciled -> own.
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const contribution = row({
      accountId: "acct_tfsa",
      code: "CONT",
      category: "outsideBank",
      movement: true,
      amountCad: 100,
      amount: 100,
    });
    const block: CashBlock = {
      accountId: "acct_tfsa",
      period: "2026-05",
      currency: "CAD" as Currency,
      opening: 0,
      closing: 105,
      fxRate: null,
      rowsNet: 100,
      residual: 5,
    };
    const d = data([contribution], [tfsa], [block]);
    const accounts = new Set(["acct_tfsa"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "accountType", accounts);

    expect(linkLike(graph.links, "src:unreconciled", "grp:TFSA")?.value).toBeCloseTo(5, 6);
    expect(linkLike(graph.links, "grp:TFSA", "now:unreconciled")).toBeUndefined();
    expect(linkLike(graph.links, "grp:TFSA", "now:cash")?.value).toBeCloseTo(105, 6);
  });

  test("a negative residual (real cash grew less than the rows explain) stays money leaving unexplained", () => {
    // opening 0, closing 95, the same +100 CONT row: rowsNet 100, residual
    // 95 - 0 - 100 = -5. The unreconciled link -residual is +5, positive,
    // so it stays own -> now:unreconciled with no flip.
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const contribution = row({
      accountId: "acct_tfsa",
      code: "CONT",
      category: "outsideBank",
      movement: true,
      amountCad: 100,
      amount: 100,
    });
    const block: CashBlock = {
      accountId: "acct_tfsa",
      period: "2026-05",
      currency: "CAD" as Currency,
      opening: 0,
      closing: 95,
      fxRate: null,
      rowsNet: 100,
      residual: -5,
    };
    const d = data([contribution], [tfsa], [block]);
    const accounts = new Set(["acct_tfsa"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "accountType", accounts);

    expect(linkLike(graph.links, "grp:TFSA", "now:unreconciled")?.value).toBeCloseTo(5, 6);
    expect(linkLike(graph.links, "src:unreconciled", "grp:TFSA")).toBeUndefined();
    expect(linkLike(graph.links, "grp:TFSA", "now:cash")?.value).toBeCloseTo(95, 6);
  });

  test("a USD block with no fx rate and a nonzero change throws, naming account and period", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const block: CashBlock = {
      accountId: "acct_tfsa",
      period: "2026-05",
      currency: "USD" as Currency,
      opening: 0,
      closing: 10,
      fxRate: null,
      rowsNet: 10,
      residual: 0,
    };
    const d = data([], [tfsa], [block]);
    const accounts = new Set(["acct_tfsa"]);

    expect(() => buildFlowGraph(d, ALL_PERIOD, "accountType", accounts)).toThrow(/acct_tfsa/);
    expect(() => buildFlowGraph(d, ALL_PERIOD, "accountType", accounts)).toThrow(/2026-05/);
  });

  test("a dividend and its reversal net to the smaller figure, marked recycled", () => {
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const div = row({
      accountId: "acct_rrsp",
      code: "DIV",
      category: "income",
      amountCad: 81.8,
      amount: 81.8,
    });
    const reversal = row({
      accountId: "acct_rrsp",
      id: "acct_rrsp:1",
      code: "DIV",
      category: "income",
      amountCad: -40.9,
      amount: -40.9,
    });
    const d = data([div, reversal], [rrsp]);
    const accounts = new Set(["acct_rrsp"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "accountType", accounts);

    const link = linkLike(graph.links, "src:income", "grp:RRSP");
    expect(link?.value).toBeCloseTo(40.9, 6);
    expect(link?.recycled).toBe(true);
  });

  test("an unpaired business contribution lands straight into the corporate account", () => {
    const corp = account({ accountId: "acct_corp", kind: "Corporate" });
    const contribution = row({
      accountId: "acct_corp",
      code: "CONT",
      category: "business",
      movement: true,
      amountCad: 5000,
      amount: 5000,
    });
    const d = data([contribution], [corp]);
    const accounts = new Set(["acct_corp"]);

    const graph = buildFlowGraph(d, ALL_PERIOD, "accountType", accounts);

    expect(linkLike(graph.links, "src:business", "land:direct")?.value).toBeCloseTo(5000, 6);
    expect(linkLike(graph.links, "land:direct", "grp:Corporate")?.value).toBeCloseTo(5000, 6);
  });

  test("the balance assertion throws naming the unbalanced node", () => {
    // Globally balanced (col 0 out 100 == col 3 in 100, via now:invested 90
    // and a second, unrelated now:cash 10 from grp:Y), but grp:TFSA itself
    // took in 100 and only passed 90 on -- the node-level check must catch
    // that even though the graph-wide total hides it.
    const nodes: FlowNode[] = [{ id: "grp:TFSA", column: 2, label: "TFSA", value: 100 }];
    const links: FlowLink[] = [
      { source: "src:payroll", target: "grp:TFSA", value: 100, recycled: false, rowIds: [] },
      { source: "grp:TFSA", target: "now:invested", value: 90, recycled: false, rowIds: [] },
      { source: "grp:Y", target: "now:cash", value: 10, recycled: false, rowIds: [] },
    ];
    expect(() => assertBalanced(nodes, links)).toThrow(/grp:TFSA/);
  });

  test("five sub-cent deposits from different sources still balance, because balance is checked before dropping them", () => {
    // Each of the five categories contributes its own tiny (0.006) link
    // into land:direct, individually under the one-cent drop threshold, but
    // they all share the SAME land:direct -> grp:TFSA landing link, which
    // sums to 0.03 and survives the drop. Checking balance on the raw,
    // unrounded aggregate (before any link is dropped) sees all five small
    // sources and the landing link and finds them exactly equal. Checking
    // balance AFTER dropping -- the bug this guards against -- would see
    // land:direct with nothing in and 0.03 out, and wrongly throw.
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const categories = ["payroll", "outsideBank", "interacIn", "business", "grant"] as const;
    const rows = categories.map((category, i) =>
      row({
        accountId: "acct_tfsa",
        id: `acct_tfsa:${i}`,
        code: category === "grant" ? "GRANT" : "CONT",
        category,
        movement: category !== "grant",
        amountCad: 0.006,
        amount: 0.006,
      }),
    );
    const d = data(rows, [tfsa]);
    const accounts = new Set(["acct_tfsa"]);

    expect(() => buildFlowGraph(d, ALL_PERIOD, "accountType", accounts)).not.toThrow();
  });

  test("the graph balances every group by for a small corpus without throwing", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const payroll = row({
      accountId: "acct_cheq",
      code: "AFT_IN",
      category: "payroll",
      movement: true,
      amountCad: 1000,
      amount: 1000,
    });
    const d = data([payroll], [cheq, rrsp]);
    const accounts = new Set(["acct_cheq", "acct_rrsp"]);
    const groupBys: readonly GroupBy[] = [
      "accountType",
      "account",
      "purpose",
      "assetClass",
      "holding",
    ];
    for (const groupBy of groupBys) {
      expect(() => buildFlowGraph(d, ALL_PERIOD, groupBy, accounts)).not.toThrow();
    }
  });
});

describe("depositsByDestination", () => {
  test("a paired chequing-to-account transfer counts as a deposit landing from the hub", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const [out, inn] = pair(
      { accountId: "acct_cheq", amountCad: -800, amount: -800 },
      { accountId: "acct_rrsp", amountCad: 800, amount: 800 },
    );
    const d = data([out as FlowRow, inn as FlowRow], [cheq, rrsp]);
    const buckets = depositsByDestination(
      d,
      ALL_PERIOD,
      "accountType",
      new Set(["acct_cheq", "acct_rrsp"]),
    );

    expect(buckets).toEqual([{ bucket: "2026-05", values: { RRSP: 800 } }]);
  });

  test("an unpaired outside contribution counts, landing straight in", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const contribution = row({
      accountId: "acct_tfsa",
      code: "CONT",
      category: "outsideBank",
      movement: true,
      amountCad: 300,
      amount: 300,
    });
    const d = data([contribution], [tfsa]);
    const buckets = depositsByDestination(d, ALL_PERIOD, "accountType", new Set(["acct_tfsa"]));

    expect(buckets).toEqual([{ bucket: "2026-05", values: { TFSA: 300 } }]);
  });

  test("income and sale proceeds never count as a deposit", () => {
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const div = row({
      accountId: "acct_rrsp",
      code: "DIV",
      category: "income",
      amountCad: 50,
      amount: 50,
    });
    const d = data([div], [rrsp]);
    const buckets = depositsByDestination(d, ALL_PERIOD, "accountType", new Set(["acct_rrsp"]));

    expect(buckets).toEqual([]);
  });

  test("money moved from another (unselected) account never counts as a deposit", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const [out, inn] = pair(
      { accountId: "acct_cheq", amountCad: -800, amount: -800 },
      { accountId: "acct_rrsp", amountCad: 800, amount: 800 },
    );
    // Both legs stay in `rows` (the real corpus always carries both), but
    // only the RRSP account is selected -- the chequing leg is filtered
    // out of the graph, not out of the pairing lookup.
    const d = data([out as FlowRow, inn as FlowRow], [cheq, rrsp]);
    const buckets = depositsByDestination(d, ALL_PERIOD, "accountType", new Set(["acct_rrsp"]));

    expect(buckets).toEqual([]);
  });

  test("buckets by year once the period spans more than 24 months", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const a = row({
      accountId: "acct_tfsa",
      id: "acct_tfsa:0",
      period: "2023-01",
      code: "CONT",
      category: "outsideBank",
      movement: true,
      amountCad: 100,
      amount: 100,
    });
    const b = row({
      accountId: "acct_tfsa",
      id: "acct_tfsa:1",
      period: "2026-06",
      code: "CONT",
      category: "outsideBank",
      movement: true,
      amountCad: 200,
      amount: 200,
    });
    const d = data([a, b], [tfsa]);
    const p = { from: "2023-01", to: "2026-06" };
    const buckets = depositsByDestination(d, p, "accountType", new Set(["acct_tfsa"]));

    expect(buckets).toEqual([
      { bucket: "2023", values: { TFSA: 100 } },
      { bucket: "2026", values: { TFSA: 200 } },
    ]);
  });
});
