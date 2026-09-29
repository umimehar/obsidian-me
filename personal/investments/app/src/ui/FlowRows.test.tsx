import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { FlowGraph, FlowLink, FlowNode } from "../analytics/flows/graph";
import type { FlowAccount, FlowRow, FlowsData } from "../analytics/flows/types";
import type { AccountKind } from "../store/mask";
import type { Purpose } from "../store/registry";
import type { Currency } from "../types";
import { FlowRows } from "./FlowRows";
import { linkKey } from "./charts/sankeyLayout";
import { formatCurrency } from "./format";

afterEach(cleanup);

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

function row(overrides: Partial<FlowRow> & { accountId: string; id: string }): FlowRow {
  return {
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

const CHEQUING = account({ accountId: "acct_a", kind: "Chequing" });
const TFSA = account({ accountId: "acct_b", kind: "TFSA" });

const PAYROLL = row({
  id: "r1",
  accountId: "acct_a",
  code: "AFT_IN",
  category: "payroll",
  amountCad: 2000,
  amount: 2000,
});

const OUT_LEG = row({
  id: "r2",
  accountId: "acct_a",
  code: "TRFOUT",
  category: "outsideBank",
  movement: true,
  amountCad: -500,
  amount: -500,
  pairId: "r2>r3",
});

const IN_LEG = row({
  id: "r3",
  accountId: "acct_b",
  code: "CONT",
  category: "outsideBank",
  movement: true,
  amountCad: 500,
  amount: 500,
  pairId: "r2>r3",
});

const USD_ROW = row({
  id: "r4",
  accountId: "acct_a",
  code: "DIV",
  category: "income",
  amountCad: 135.42,
  amount: 100,
  currency: "USD" as Currency,
  fxRate: 1.3542,
});

const PAYROLL2 = row({
  id: "r5",
  accountId: "acct_a",
  code: "AFT_IN",
  category: "payroll",
  date: "2026-06-15",
  period: "2026-06",
  amountCad: 2100,
  amount: 2100,
});

const USD_NEGATIVE_ROW = row({
  id: "r6",
  accountId: "acct_a",
  code: "BUY",
  category: "buy",
  symbol: "AAPL",
  amountCad: -1625.04,
  amount: -1200,
  currency: "USD" as Currency,
  fxRate: 1.3542,
});

const FLOWS: FlowsData = {
  generated: "2026-01-01",
  accounts: [CHEQUING, TFSA],
  rows: [PAYROLL, PAYROLL2, OUT_LEG, IN_LEG, USD_ROW, USD_NEGATIVE_ROW],
  blocks: [],
  suspectSymbols: [],
};

function node(id: string, column: 0 | 1 | 2 | 3, value: number, label: string): FlowNode {
  return { id, column, label, value };
}

function link(source: string, target: string, value: number, rowIds: string[]): FlowLink {
  return { source, target, value, recycled: false, rowIds };
}

const PAYROLL_KEY = linkKey({ source: "src:payroll", target: "land:chequing" });
const CASH_KEY = linkKey({ source: "grp:Chequing", target: "now:cash" });
const USD_KEY = linkKey({ source: "src:income", target: "grp:Chequing" });
const USD_BUY_KEY = linkKey({ source: "grp:Chequing", target: "now:invested" });
const TRANSFER_KEY = linkKey({ source: "land:chequing", target: "grp:TFSA" });

const GRAPH: FlowGraph = {
  nodes: [node("src:payroll", 0, 4100, "Payroll deposited")],
  links: [
    link("src:payroll", "land:chequing", 4100, ["r1", "r5"]),
    link("grp:Chequing", "now:cash", 100, []),
    link("src:income", "grp:Chequing", 135.42, ["r4"]),
    link("grp:Chequing", "now:invested", 1625.04, ["r6"]),
    link("land:chequing", "grp:TFSA", 500, ["r2"]),
  ],
  totalIn: 4100,
};

function renderRows(selected: string | null, narrow = false) {
  render(
    <Theme>
      <FlowRows flows={FLOWS} graph={GRAPH} selected={selected} narrow={narrow} />
    </Theme>,
  );
}

describe("FlowRows", () => {
  test("nothing renders with no selection", () => {
    renderRows(null);
    expect(document.querySelector("[data-flow-rows]")).toBeNull();
  });

  test("a payroll band lists every one of its rows, largest amount first, with no description anywhere", () => {
    renderRows(PAYROLL_KEY);
    const rows = document.querySelectorAll("[data-flow-row]");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.getAttribute("data-flow-row")).toBe("r5");
    expect(rows[1]?.getAttribute("data-flow-row")).toBe("r1");
    expect(rows[0]?.textContent).toContain(formatCurrency(2100));
    expect(rows[1]?.textContent).toContain("2026-05-15");
    expect(rows[1]?.textContent).toContain("acct_a");
    expect(rows[1]?.textContent).toContain("AFT_IN");
    expect(rows[1]?.textContent).toContain(formatCurrency(2000));
    expect(document.body.textContent).not.toContain("Direct deposit");
  });

  test("a link with no rows explains itself in one sentence", () => {
    renderRows(CASH_KEY);
    expect(document.querySelector("[data-flow-rows]")?.textContent).toContain(
      "Change in cash balances over the period, from each statement's opening and closing cash.",
    );
  });

  test("the drill down carries a focusable heading, the scroll and focus target for a new selection", () => {
    renderRows(PAYROLL_KEY);
    const heading = document.querySelector("[data-flow-rows-heading]");
    expect(heading).not.toBeNull();
    expect(heading?.getAttribute("tabindex")).toBe("-1");
  });

  test("a USD row shows the original amount and its statement's rate", () => {
    renderRows(USD_KEY);
    const row1 = document.querySelector('[data-flow-row="r4"]');
    expect(row1?.textContent).toContain(`US${formatCurrency(100)} at 1.3542`);
  });

  test("a negative USD row leads with the sign, before the US$ prefix", () => {
    renderRows(USD_BUY_KEY);
    const row1 = document.querySelector('[data-flow-row="r6"]');
    expect(row1?.textContent).toContain(`-US${formatCurrency(1200)} at 1.3542`);
    expect(row1?.textContent).not.toContain("US-$");
  });

  test("an unknown selection renders nothing rather than throwing", () => {
    expect(() => renderRows("not-a-real-key")).not.toThrow();
    expect(document.querySelector("[data-flow-rows]")).toBeNull();
  });
});

describe("FlowRows, narrow", () => {
  test("renders no table element at all, only rows", () => {
    renderRows(PAYROLL_KEY, true);
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelectorAll("[data-flow-row]")).toHaveLength(2);
  });

  test("each row is two lines: date · account · code, then amount with any USD aside and partner", () => {
    renderRows(USD_BUY_KEY, true);
    const row1 = document.querySelector('[data-flow-row="r6"]');
    expect(row1?.textContent).toContain("2026-05-15 · acct_a · BUY");
    expect(row1?.textContent).toContain(
      `${formatCurrency(-1625.04)} (-US${formatCurrency(1200)} at 1.3542)`,
    );
  });

  test("a paired row's partner account still shows, after the amount", () => {
    renderRows(TRANSFER_KEY, true);
    const row1 = document.querySelector('[data-flow-row="r2"]');
    expect(row1?.textContent).toContain(formatCurrency(-500));
    expect(row1?.textContent).toContain(TFSA.label);
  });

  test("the date and amount both keep white-space: nowrap", () => {
    renderRows(PAYROLL_KEY, true);
    const row1 = document.querySelector('[data-flow-row="r1"]');
    const nowrapSpans = [...(row1?.querySelectorAll("span") ?? [])].filter(
      (el) => (el as HTMLElement).style.whiteSpace === "nowrap",
    );
    expect(nowrapSpans.length).toBeGreaterThanOrEqual(2);
  });

  test("the cash explanation and the expand button both still render narrow", () => {
    renderRows(CASH_KEY, true);
    expect(document.querySelector("[data-flow-rows]")?.textContent).toContain(
      "Change in cash balances",
    );
  });
});

describe("FlowRows, the row cap", () => {
  const BIG_ROWS = Array.from({ length: 60 }, (_, i) =>
    row({
      id: `big:${i}`,
      accountId: "acct_a",
      code: "BUY",
      category: "buy",
      symbol: "AAA",
      amountCad: -(i + 1),
      amount: -(i + 1),
    }),
  );
  const BIG_FLOWS: FlowsData = {
    generated: "2026-01-01",
    accounts: [CHEQUING, TFSA],
    rows: BIG_ROWS,
    blocks: [],
    suspectSymbols: [],
  };
  const BIG_KEY = linkKey({ source: "grp:Chequing", target: "now:invested" });
  const BIG_GRAPH: FlowGraph = {
    nodes: [],
    links: [
      link(
        "grp:Chequing",
        "now:invested",
        1830,
        BIG_ROWS.map((r) => r.id),
      ),
    ],
    totalIn: 1830,
  };

  function renderBig() {
    render(
      <Theme>
        <FlowRows flows={BIG_FLOWS} graph={BIG_GRAPH} selected={BIG_KEY} />
      </Theme>,
    );
  }

  test("shows only the 50 largest rows, largest first, with a button naming the true count", () => {
    renderBig();
    const rows = document.querySelectorAll("[data-flow-row]");
    expect(rows).toHaveLength(50);
    expect(rows[0]?.getAttribute("data-flow-row")).toBe("big:59");
    expect(rows[49]?.getAttribute("data-flow-row")).toBe("big:10");
    const expand = document.querySelector("[data-flow-rows-expand]");
    expect(expand?.textContent).toBe("Show all 60 rows");
  });

  test("expanding shows every row and removes the button", () => {
    renderBig();
    const expand = document.querySelector("[data-flow-rows-expand]");
    if (expand === null) throw new Error("expected the expand button to render");
    fireEvent.click(expand);
    expect(document.querySelectorAll("[data-flow-row]")).toHaveLength(60);
    expect(document.querySelector("[data-flow-rows-expand]")).toBeNull();
  });

  test("a band with 50 rows or fewer never shows the expand button", () => {
    renderRows(PAYROLL_KEY);
    expect(document.querySelector("[data-flow-rows-expand]")).toBeNull();
  });

  test("the expanded 60-row table windows in a scrollable region with a pinned header", () => {
    renderBig();
    const expand = document.querySelector("[data-flow-rows-expand]");
    if (expand === null) throw new Error("expected the expand button to render");
    fireEvent.click(expand);
    expect(document.querySelectorAll("[data-flow-row]")).toHaveLength(60);
    // `Table.Root` gets a definite `height`, capped at the same 360px the
    // narrow variant's own region caps at -- see `wideTableHeight`'s own
    // comment for why that has to be a real height rather than a
    // `max-height` on a wrapper div for the sticky header below to work.
    const table = document.querySelector("[data-flow-rows-table]") as HTMLElement | null;
    expect(table?.style.height).toBe("360px");
    const headerCells = [...document.querySelectorAll("thead th")];
    expect(headerCells.length).toBeGreaterThan(0);
    for (const cell of headerCells) {
      expect((cell as HTMLElement).style.position).toBe("sticky");
    }
  });
});
