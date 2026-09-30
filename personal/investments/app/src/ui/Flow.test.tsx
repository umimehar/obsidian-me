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
    expect(document.querySelector("[data-flow-missing]") === null).toBe(true);
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
      expect(document.querySelector("svg[role='group']") === null).toBe(true);
      expect(document.querySelector("[data-flow-narrow]") === null).toBe(false);
      expect(document.querySelector('[data-flow-ranked-list="Came from"]') === null).toBe(false);
      expect(document.querySelector('[data-flow-ranked-list="Where it is now"]') === null).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  test("at the default wide layout the Sankey renders and no ranked lists do", () => {
    renderFlow(loadFlows());
    expect(document.querySelector("svg[role='group']") === null).toBe(false);
    expect(document.querySelector("[data-flow-narrow]") === null).toBe(true);
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
    expect(picked.period === null).toBe(true);
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
    expect(heading === null).toBe(false);
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

/**
 * One payroll row per year, same part key ("payroll"), different rowIds --
 * the fixture the staleness tests need -- plus a TFSA contribution row
 * present only in 2026, whose whole "Of which contributions" section
 * therefore does not exist at all in 2024 or 2025.
 */
const TWO_YEAR_FLOWS: FlowsData = {
  generated: "2026-01-01",
  accounts: [CHEQUING, TFSA],
  rows: [
    row({
      id: "pay25",
      accountId: "acct_a",
      period: "2025-06",
      date: "2025-06-15",
      code: "AFT_IN",
      category: "payroll",
      movement: true,
      amountCad: 100,
      amount: 100,
    }),
    row({
      id: "pay26",
      accountId: "acct_a",
      period: "2026-06",
      date: "2026-06-15",
      code: "AFT_IN",
      category: "payroll",
      movement: true,
      amountCad: 200,
      amount: 200,
    }),
    row({
      id: "tfsaCont26",
      accountId: "acct_b",
      period: "2026-06",
      date: "2026-06-20",
      code: "CONT",
      category: "outsideBank",
      movement: true,
      amountCad: 50,
      amount: 50,
    }),
    // Present only in 2026, so the Costs tile's "Fee rebates" part has real
    // rows there and the always-present, always-$0 placeholder everywhere
    // else -- the fixture the stale-empty-part test needs.
    row({
      id: "feeRebate26",
      accountId: "acct_a",
      period: "2026-06",
      date: "2026-06-18",
      code: "REIMB",
      category: "fee",
      movement: false,
      amountCad: 10,
      amount: 10,
    }),
  ],
  blocks: [
    {
      accountId: "acct_a",
      period: "2024-06",
      currency: "CAD",
      opening: 0,
      closing: 0,
      fxRate: null,
      rowsNet: 0,
      residual: 0,
    },
    {
      accountId: "acct_a",
      period: "2025-06",
      currency: "CAD",
      opening: 0,
      closing: 100,
      fxRate: null,
      rowsNet: 100,
      residual: 0,
    },
    {
      accountId: "acct_a",
      period: "2026-06",
      currency: "CAD",
      opening: 0,
      closing: 210,
      fxRate: null,
      rowsNet: 210,
      residual: 0,
    },
    {
      accountId: "acct_b",
      period: "2026-06",
      currency: "CAD",
      opening: 0,
      closing: 50,
      fxRate: null,
      rowsNet: 50,
      residual: 0,
    },
  ],
  suspectSymbols: [],
};

async function openPaidInTile(): Promise<void> {
  const trigger = document.querySelector('[data-flow-tile="Paid in from outside"]');
  if (trigger === null) throw new Error("expected the paid-in tile");
  await act(async () => {
    fireEvent.click(trigger);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Opens the paid-in tile and clicks the payroll source part's own "Show rows". */
async function openPaidInShowRows(): Promise<void> {
  await openPaidInTile();
  const button = document.querySelector("[data-flow-tile-show-rows]");
  if (button === null) throw new Error("expected a Show rows button");
  await act(async () => {
    fireEvent.click(button);
  });
}

/**
 * Opens the paid-in tile and clicks the TFSA contribution part's own
 * "Show rows", inside the "Of which contributions" section -- the section
 * `TWO_YEAR_FLOWS` only ever populates for 2026, so choosing it there and
 * switching away is what genuinely exercises a part that stops existing.
 */
async function openPaidInTfsaContribShowRows(): Promise<void> {
  await openPaidInTile();
  const button = document.querySelector("[data-flow-tile-section] [data-flow-tile-show-rows]");
  if (button === null) throw new Error("expected the TFSA contribution's Show rows button");
  await act(async () => {
    fireEvent.click(button);
  });
}

/**
 * Opens the Costs tile and clicks the fee rebates part's own "Show rows" --
 * a part that, unlike a contributions-section entry, ALWAYS exists
 * (`COST_GROUPS` renders every group every period) but carries no rows in
 * a period with no fee rebate.
 */
async function openCostsFeeRebatesShowRows(): Promise<void> {
  const trigger = document.querySelector('[data-flow-tile="Costs"]');
  if (trigger === null) throw new Error("expected the Costs tile");
  await act(async () => {
    fireEvent.click(trigger);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const part = document.querySelector('[data-flow-tile-part="feeRebates"]');
  const button = part?.querySelector("[data-flow-tile-show-rows]");
  if (button === null || button === undefined) {
    throw new Error("expected the fee rebates part's Show rows button");
  }
  await act(async () => {
    fireEvent.click(button);
  });
}

describe("Flow, a tile part with $0 and no rows never opens a drill down", () => {
  test("choosing fee rebates in 2026, switching to 2025 clears the drill down rather than showing the cash explanation, and switching back does not revive it", async () => {
    const { rerender } = render(
      <Theme>
        <Flow
          flows={TWO_YEAR_FLOWS}
          series={MOVE_SERIES}
          period={{ from: "2026-01", to: "2026-12" }}
          onPeriodChange={() => {}}
        />
      </Theme>,
    );
    await openCostsFeeRebatesShowRows();
    expect(document.getElementById("flow-drilldown-heading")?.textContent).toBe(
      "Costs: Fee rebates",
    );
    expect(document.querySelector('[data-flow-row="feeRebate26"]') === null).toBe(false);

    rerender(
      <Theme>
        <Flow
          flows={TWO_YEAR_FLOWS}
          series={MOVE_SERIES}
          period={{ from: "2025-01", to: "2025-12" }}
          onPeriodChange={() => {}}
        />
      </Theme>,
    );
    // The false reading this guards against: "Costs: Fee rebates" still as
    // the heading, followed by CASH_EXPLANATION's cash-balance sentence --
    // a sentence that has nothing to do with a fee rebate.
    expect(document.querySelector("[data-flow-rows]") === null).toBe(true);

    rerender(
      <Theme>
        <Flow
          flows={TWO_YEAR_FLOWS}
          series={MOVE_SERIES}
          period={{ from: "2026-01", to: "2026-12" }}
          onPeriodChange={() => {}}
        />
      </Theme>,
    );
    expect(document.querySelector("[data-flow-rows]") === null).toBe(true);
  });
});

describe("Flow, the drill down survives a period change", () => {
  test("switching period after Show rows re-derives the rows instead of keeping the old period's", async () => {
    const { rerender } = render(
      <Theme>
        <Flow
          flows={TWO_YEAR_FLOWS}
          series={MOVE_SERIES}
          period={{ from: "2026-01", to: "2026-12" }}
          onPeriodChange={() => {}}
        />
      </Theme>,
    );
    await openPaidInShowRows();
    expect(document.querySelector('[data-flow-row="pay26"]') === null).toBe(false);
    expect(document.querySelector('[data-flow-row="pay25"]') === null).toBe(true);

    rerender(
      <Theme>
        <Flow
          flows={TWO_YEAR_FLOWS}
          series={MOVE_SERIES}
          period={{ from: "2025-01", to: "2025-12" }}
          onPeriodChange={() => {}}
        />
      </Theme>,
    );
    expect(document.querySelector('[data-flow-row="pay25"]') === null).toBe(false);
    expect(document.querySelector('[data-flow-row="pay26"]') === null).toBe(true);
  });

  test("switching to a period where the part no longer exists clears the drill down rather than showing stale rows", async () => {
    const { rerender } = render(
      <Theme>
        <Flow
          flows={TWO_YEAR_FLOWS}
          series={MOVE_SERIES}
          period={{ from: "2026-01", to: "2026-12" }}
          onPeriodChange={() => {}}
        />
      </Theme>,
    );
    await openPaidInTfsaContribShowRows();
    expect(document.querySelector('[data-flow-row="tfsaCont26"]') === null).toBe(false);

    rerender(
      <Theme>
        <Flow
          flows={TWO_YEAR_FLOWS}
          series={MOVE_SERIES}
          period={{ from: "2024-01", to: "2024-12" }}
          onPeriodChange={() => {}}
        />
      </Theme>,
    );
    expect(document.querySelector("[data-flow-rows]") === null).toBe(true);
  });
});

describe("Flow, choosing the same tile part twice", () => {
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

  test("re-choosing the same part scrolls and focuses again rather than leaving focus wherever it drifted", async () => {
    render(
      <Theme>
        <Flow
          flows={TWO_YEAR_FLOWS}
          series={MOVE_SERIES}
          period={{ from: "2026-01", to: "2026-12" }}
          onPeriodChange={() => {}}
        />
      </Theme>,
    );
    await openPaidInShowRows();
    expect(document.getElementById("flow-drilldown-heading") === null).toBe(false);

    stubScroll();
    // Move focus elsewhere first, so a second focus-to-heading is provable
    // rather than assumed to have "never left".
    (document.body as HTMLElement).focus();
    expect(document.activeElement).toBe(document.body);

    await openPaidInShowRows();
    // `FlowRows` remounts on every new selection (`key={activeKey}`), so the
    // heading fetched before this second choice is a DIFFERENT, now
    // disconnected DOM node from the one this choice actually scrolls and
    // focuses -- re-querying by id is what proves the SECOND choice, not
    // stale identity from the first.
    const heading = document.getElementById("flow-drilldown-heading");
    if (heading === null) throw new Error("expected the drill down heading");
    expect(scrolled).toContain(heading);
    expect(document.activeElement).toBe(heading);
  });
});
