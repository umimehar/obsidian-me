import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FlowPeriod } from "../analytics/flows/period";
import type { FlowAccount, FlowRow, FlowsData } from "../analytics/flows/types";
import type { AccountSeries } from "../analytics/types";
import type { AccountKind } from "../store/mask";
import type { Purpose } from "../store/registry";
import type { Currency } from "../types";
import { Flow } from "./Flow";
import { loadAnalytics, loadFlows } from "./data";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function account(
  overrides: Partial<FlowAccount> & { accountId: string; kind: AccountKind },
): FlowAccount {
  return {
    shortId: overrides.accountId.slice(-4),
    label: overrides.accountId,
    purpose: "growth" as Purpose,
    inTotals: true,
    firstPeriod: "2026-01",
    lastPeriod: "2026-06",
    closed: false,
    ...overrides,
  };
}

/** Two accounts, both selected, one of which never reports at the period's end. */
const MISSING_FLOWS: FlowsData = {
  generated: "2026-01-01",
  accounts: [
    account({ accountId: "acct_a", kind: "Chequing", label: "Chequing" }),
    account({ accountId: "acct_b", kind: "TFSA", label: "TFSA" }),
  ],
  rows: [],
  blocks: [
    {
      accountId: "acct_a",
      period: "2026-06",
      currency: "CAD",
      opening: 0,
      closing: 0,
      fxRate: null,
      rowsNet: 0,
      residual: 0,
    },
  ],
  suspectSymbols: [],
};

const { series } = loadAnalytics();

function renderFlow(
  flows: FlowsData,
  accountSeries: readonly AccountSeries[] = series,
  period: FlowPeriod | "all" = { from: "2026-06", to: "2026-06" },
  onPeriodChange: (p: FlowPeriod | "all") => void = () => {},
) {
  render(
    <Theme>
      <Flow flows={flows} series={accountSeries} period={period} onPeriodChange={onPeriodChange} />
    </Theme>,
  );
}

describe("Flow", () => {
  test("the missing-accounts callout names the account with no statement at the period's end, never $0", () => {
    renderFlow(MISSING_FLOWS);
    const callout = document.querySelector("[data-flow-missing]");
    expect(callout?.textContent).toContain("No statement yet for 2026-06");
    expect(callout?.textContent).toContain("TFSA");
    expect(callout?.textContent).not.toContain("Chequing");
  });

  test("no callout renders once every selected account has reported", () => {
    renderFlow({ ...MISSING_FLOWS, accounts: [MISSING_FLOWS.accounts[0] as FlowAccount] });
    expect(document.querySelector("[data-flow-missing]")).toBeNull();
  });

  test("below 40rem the Sankey gives way to two ranked lists and draws no svg[role=group]", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      renderFlow(loadFlows());
      expect(document.querySelector("svg[role='group']")).toBeNull();
      expect(document.querySelector("[data-flow-narrow]")).not.toBeNull();
      expect(document.querySelector('[data-flow-ranked-list="Came from"]')).not.toBeNull();
      expect(document.querySelector('[data-flow-ranked-list="Where it is now"]')).not.toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });

  test("at the default wide layout the Sankey renders and no ranked lists do", () => {
    renderFlow(loadFlows());
    expect(document.querySelector("svg[role='group']")).not.toBeNull();
    expect(document.querySelector("[data-flow-narrow]")).toBeNull();
  });
});

function row(overrides: Partial<FlowRow> & { accountId: string; id: string }): FlowRow {
  return {
    period: "2026-06",
    date: "2026-06-10",
    code: "CONT",
    category: "outsideBank",
    movement: true,
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

const CHEQUING = account({ accountId: "acct_a", kind: "Chequing", label: "Chequing" });
const TFSA = account({ accountId: "acct_b", kind: "TFSA", label: "TFSA" });

/** An `AccountSeries` shell for `AccountFilter`, matching one of this file's `FlowAccount` fixtures. */
function seriesAccount(a: FlowAccount): AccountSeries {
  return {
    maskedId: a.accountId,
    shortId: a.shortId,
    label: a.label,
    kind: a.kind,
    style: "self-directed",
    purpose: a.purpose,
    inTotals: a.inTotals,
    months: [],
    contributionsByYear: {},
  };
}
const MOVE_SERIES = [seriesAccount(CHEQUING), seriesAccount(TFSA)];

const PAYROLL = row({
  id: "p1",
  accountId: "acct_a",
  category: "payroll",
  code: "AFT_IN",
  movement: false,
  amountCad: 2000,
  amount: 2000,
});
const TRANSFER_OUT = row({
  id: "t1",
  accountId: "acct_a",
  amountCad: -500,
  amount: -500,
  pairId: "t1>t2",
});
const TRANSFER_IN = row({
  id: "t2",
  accountId: "acct_b",
  amountCad: 500,
  amount: 500,
  pairId: "t1>t2",
});

const MOVE_FLOWS: FlowsData = {
  generated: "2026-01-01",
  accounts: [CHEQUING, TFSA],
  rows: [PAYROLL, TRANSFER_OUT, TRANSFER_IN],
  blocks: [
    {
      accountId: "acct_a",
      period: "2026-06",
      currency: "CAD",
      opening: 0,
      closing: 1500,
      fxRate: null,
      rowsNet: 1500,
      residual: 0,
    },
    {
      accountId: "acct_b",
      period: "2026-06",
      currency: "CAD",
      opening: 0,
      closing: 500,
      fxRate: null,
      rowsNet: 500,
      residual: 0,
    },
  ],
  suspectSymbols: [],
};

function chequingCheckbox(): HTMLElement {
  return screen.getByRole("menuitemcheckbox", { name: /^Chequing/ });
}

async function openAccountFilter() {
  await act(async () => {
    fireEvent.keyDown(document.querySelector("[data-account-filter]") as HTMLElement, {
      key: "Enter",
    });
  });
}

/** Whether the Sankey drew a node for this id -- the sentence-level caveat mentions "Payroll deposited" too. */
function hasNode(id: string): boolean {
  return document.querySelector(`[data-flow-node="${id}"]`) !== null;
}

describe("Flow, account exclusion", () => {
  test("with every account selected, chequing forwards to TFSA and no money reads as moved from outside", () => {
    renderFlow(MOVE_FLOWS, MOVE_SERIES);
    expect(hasNode("src:payroll")).toBe(true);
    expect(hasNode("src:moved")).toBe(false);
  });

  test("unticking chequing turns the payroll band off and reads the TFSA credit as moved from another account", async () => {
    renderFlow(MOVE_FLOWS, MOVE_SERIES);
    await openAccountFilter();
    fireEvent.click(chequingCheckbox());
    expect(hasNode("src:payroll")).toBe(false);
    expect(hasNode("src:moved")).toBe(true);
    expect(document.querySelector("[data-flow-table]")?.textContent).toContain(
      "Moved from another account",
    );
  });
});

describe("Flow, an out-of-corpus period", () => {
  test("a year the corpus has not reached falls back to all time and rewrites the hash", () => {
    const picked: { period: FlowPeriod | "all" | null } = { period: null };
    renderFlow(MOVE_FLOWS, MOVE_SERIES, { from: "2030-01", to: "2030-12" }, (p) => {
      picked.period = p;
    });
    expect(picked.period).toBe("all");
    // Rendered from the corpus's own full span, not five $0.00 tiles.
    expect(
      document.querySelector('[data-flow-tile="Paid in from outside"]')?.textContent,
    ).toContain("$2,000.00");
  });

  test("a period the corpus does cover is left alone", () => {
    const picked: { period: FlowPeriod | "all" | null } = { period: null };
    renderFlow(MOVE_FLOWS, MOVE_SERIES, { from: "2026-06", to: "2026-06" }, (p) => {
      picked.period = p;
    });
    expect(picked.period).toBeNull();
  });
});

describe("Flow, the drill down's scroll and focus", () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  let scrolled: Element[] = [];

  function stubScroll() {
    scrolled = [];
    Element.prototype.scrollIntoView = function scrollIntoViewStub(this: Element) {
      scrolled.push(this);
    };
  }

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  test("selecting a band scrolls the drill down's heading into view and focuses it", () => {
    renderFlow(loadFlows());
    stubScroll();
    const band = document.querySelector("[data-flow-link]");
    if (band === null) throw new Error("expected at least one Sankey band");
    fireEvent.click(band);
    const heading = document.getElementById("flow-drilldown-heading");
    expect(heading).not.toBeNull();
    expect(scrolled).toContain(heading as Element);
    expect(document.activeElement).toBe(heading);
  });

  test("selecting a flows-table row does the same", () => {
    renderFlow(loadFlows());
    stubScroll();
    const row = document.querySelector("[data-flow-table-row]");
    if (row === null) throw new Error("expected at least one flows table row");
    fireEvent.click(row);
    const heading = document.getElementById("flow-drilldown-heading");
    expect(scrolled).toContain(heading as Element);
    expect(document.activeElement).toBe(heading);
  });
});
