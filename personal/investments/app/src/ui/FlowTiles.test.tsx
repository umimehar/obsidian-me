import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { TileBreakdown, TileBreakdowns, TileKey } from "../analytics/flows/breakdown";
import type { FlowSummary } from "../analytics/flows/summary";
import { FlowTiles, type PartSelector } from "./FlowTiles";
import { formatCurrency, formatShare } from "./format";
import { expectNoCoarseForm } from "./testSupport/coarseForm";

function summary(overrides: Partial<FlowSummary> = {}): FlowSummary {
  return {
    paidIn: 134880.63,
    paidInBySource: { payroll: 46464.63, outsideBank: 20816, interacIn: 12600, business: 55000 },
    contributionsByKind: { TFSA: 7000.42, RESP: 4000.01 },
    grants: 600,
    income: 2035.255242999998,
    invested: 144508.81501500006,
    cashEquivalentNet: 0,
    cashChange: -18285.692294000008,
    leftInCash: -18285.692294000008,
    costs: 321.3459540000001,
    left: 10885.85,
    investedRate: 1.0493256806214761,
    unpairedLegs: 0,
    laggedPairs: 0,
    residual: 0,
    unlistedSymbols: [],
    ...overrides,
  };
}

function breakdown(
  tile: TileKey,
  total: number,
  parts: TileBreakdown["parts"] = [],
  sections: TileBreakdown["sections"] = [],
): TileBreakdown {
  return { tile, total, parts, sections };
}

function breakdowns(s: FlowSummary, overrides: Partial<TileBreakdowns> = {}): TileBreakdowns {
  return {
    paidIn: breakdown("paidIn", s.paidIn, [
      {
        key: "payroll",
        label: "Payroll deposited",
        amount: s.paidInBySource.payroll,
        rowIds: ["r1"],
      },
      {
        key: "outsideBank",
        label: "Outside bank",
        amount: s.paidInBySource.outsideBank,
        rowIds: ["r2"],
      },
      {
        key: "interacIn",
        label: "Interac received",
        amount: s.paidInBySource.interacIn,
        rowIds: [],
      },
      { key: "business", label: "Business", amount: s.paidInBySource.business, rowIds: [] },
    ]),
    invested: breakdown("invested", s.invested, [
      { key: "purchases", label: "Purchases", amount: s.invested + 100, rowIds: ["r3"] },
      { key: "sales", label: "Sales", amount: -100, rowIds: ["r4"] },
    ]),
    leftInCash: breakdown("leftInCash", s.leftInCash, [
      { key: "acct_a", label: "Chequing a", amount: s.leftInCash, rowIds: [] },
    ]),
    income: breakdown("income", s.income, [
      { key: "dividends", label: "Dividends", amount: s.income, rowIds: ["r5"] },
    ]),
    costs: breakdown("costs", s.costs, [
      { key: "managementFees", label: "Management fees", amount: s.costs, rowIds: ["r6"] },
    ]),
    left: breakdown("left", s.left, [
      { key: "withdrawals", label: "Withdrawals", amount: s.left, rowIds: ["r7"] },
    ]),
    investedRate: breakdown("investedRate", s.investedRate ?? 0, [
      { key: "invested", label: "Invested", amount: s.invested, rowIds: ["r3", "r4"] },
      { key: "paidIn", label: "Paid in from outside", amount: s.paidIn, rowIds: ["r1", "r2"] },
    ]),
    identity: {
      paidIn: s.paidIn,
      cesg: s.grants,
      income: s.income,
      movedIn: 0,
      costs: s.costs,
      left: s.left,
      movedOut: 0,
      currencyConversion: 285.57,
      invested: s.invested,
      leftInCash: s.leftInCash,
    },
    ...overrides,
  };
}

function tile(label: string): HTMLElement {
  const node = document.querySelector(`[data-flow-tile="${label}"]`);
  if (node === null) throw new Error(`expected a ${label} tile to render`);
  return node as HTMLElement;
}

/** Opens a tile's popover, letting the Popper's own async position update settle before the assertions run. */
async function openTile(label: string): Promise<void> {
  await act(async () => {
    fireEvent.click(tile(label));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(cleanup);

function renderTiles(
  s: FlowSummary,
  onShowRows: (selector: PartSelector) => void = () => {},
  ov: Partial<TileBreakdowns> = {},
) {
  render(
    <Theme>
      <FlowTiles summary={s} breakdowns={breakdowns(s, ov)} onShowRows={onShowRows} />
    </Theme>,
  );
}

describe("FlowTiles", () => {
  test("every tile's visible text is exactly one formatCurrency/formatShare call", () => {
    const s = summary();
    renderTiles(s);
    expect(tile("Paid in from outside").textContent).toContain(formatCurrency(s.paidIn));
    expect(tile("Invested").textContent).toContain(formatCurrency(s.invested));
    expect(tile("Left in cash").textContent).toContain(formatCurrency(s.leftInCash));
    expect(tile("Income earned").textContent).toContain(formatCurrency(s.income));
    expect(tile("Costs").textContent).toContain(formatCurrency(s.costs));
    expect(tile("Left Wealthsimple").textContent).toContain(formatCurrency(s.left));
    expect(tile("Invested rate").textContent).toContain(formatShare(s.investedRate as number));
  });

  test("every tile's aria-label leads with its title, then the figure, then its one line explanation", () => {
    const s = summary();
    renderTiles(s);
    const cases: readonly [string, string, string][] = [
      [
        "Paid in from outside",
        formatCurrency(s.paidIn),
        "New money that arrived from outside Wealthsimple. Moves between your own accounts are not counted.",
      ],
      [
        "Invested",
        formatCurrency(s.invested),
        "What you bought, minus what you sold. Cash like funds are not counted.",
      ],
      [
        "Left in cash",
        formatCurrency(s.leftInCash),
        "The change in money not invested: cash balances plus cash like funds such as PSA.",
      ],
      [
        "Income earned",
        formatCurrency(s.income),
        "What your money earned inside Wealthsimple. Not salary, and not price gains.",
      ],
    ];
    for (const [label, value, explanation] of cases) {
      expect(tile(label).getAttribute("aria-label")).toBe(`${label}, ${value}, ${explanation}`);
      expect(tile(label).textContent).toContain(value);
      expect(tile(label).textContent).toContain(explanation);
    }
  });

  test("a null invested rate reads as 'Not enough money in', not a figure", () => {
    renderTiles(summary({ investedRate: null }));
    expect(tile("Invested rate").textContent).toContain("Not enough money in");
    expect(tile("Invested rate").getAttribute("aria-label")).toContain("Not enough money in");
  });

  test("no tile's text or aria-label ever states a coarser figure than its own", () => {
    const s = summary();
    renderTiles(s);
    for (const [label, amount] of [
      ["Paid in from outside", s.paidIn],
      ["Invested", s.invested],
      ["Left in cash", s.leftInCash],
      ["Income earned", s.income],
      ["Costs", s.costs],
      ["Left Wealthsimple", s.left],
    ] as const) {
      expectNoCoarseForm(tile(label).textContent ?? "", amount);
      expectNoCoarseForm(tile(label).getAttribute("aria-label") ?? "", amount);
    }
  });

  test("contributions by account type render beneath the paid-in tile, one kind and figure per line", () => {
    renderTiles(summary());
    const line = document.querySelector("[data-flow-contributions]");
    const terms = [...(line?.querySelectorAll("dt") ?? [])].map((n) => n.textContent);
    const figures = [...(line?.querySelectorAll("dd") ?? [])].map((n) => n.textContent);
    expect(terms).toEqual(["TFSA", "RESP"]);
    expect(figures).toEqual([formatCurrency(7000.42), formatCurrency(4000.01)]);

    cleanup();
    renderTiles(summary({ contributionsByKind: {} }));
    expect(document.querySelector("[data-flow-contributions]") === null).toBe(true);
  });

  test("the payroll/spending caveat sentence is always present", () => {
    renderTiles(summary());
    expect(document.body.textContent).toContain(
      "Payroll deposited here is only the part that reached Wealthsimple.",
    );
  });

  test("the how the tiles fit line states every identity term, from its own formatter call, when zero moved terms", () => {
    const s = summary();
    renderTiles(s);
    const line = document.querySelector("[data-flow-identity]");
    const text = line?.textContent ?? "";
    expect(text).toContain("How the tiles fit");
    expect(text).toContain(formatCurrency(s.paidIn));
    expect(text).toContain(formatCurrency(s.grants));
    expect(text).toContain(formatCurrency(s.income));
    expect(text).toContain(formatCurrency(s.costs));
    expect(text).toContain(formatCurrency(s.left));
    expect(text).toContain(formatCurrency(285.57));
    expect(text).toContain(formatCurrency(s.invested));
    expect(text).toContain(formatCurrency(s.leftInCash));
    expect(text).not.toContain("moved in");
    expect(text).not.toContain("moved out");
  });

  test("the how the tiles fit line adds the moved terms only when nonzero", () => {
    const s = summary();
    renderTiles(s, undefined, {
      identity: {
        paidIn: s.paidIn,
        cesg: s.grants,
        income: s.income,
        movedIn: 103278.98,
        costs: s.costs,
        left: s.left,
        movedOut: 47.5,
        currencyConversion: 285.57,
        invested: s.invested,
        leftInCash: s.leftInCash,
      },
    });
    const text = document.querySelector("[data-flow-identity]")?.textContent ?? "";
    expect(text).toContain(`${formatCurrency(103278.98)} moved in from other accounts`);
    expect(text).toContain(`${formatCurrency(47.5)} moved out to other accounts`);
    // The invested and left in cash terms have to stay each other's own
    // figure -- a term that silently folded `movedIn` (or `movedOut`) into
    // one of them would still pass the two assertions above while stating
    // a false equation, exactly the "equals X invested plus Y left in
    // cash" clause this ties down.
    expect(text).toContain(`equals ${formatCurrency(s.invested)} invested`);
    expect(text).toContain(`plus ${formatCurrency(s.leftInCash)} left in cash.`);
  });

  test("a nonzero residual sign is stated correctly in the currency conversion term", () => {
    const s = summary();
    renderTiles(s, undefined, {
      identity: {
        paidIn: s.paidIn,
        cesg: s.grants,
        income: s.income,
        movedIn: 0,
        costs: s.costs,
        left: s.left,
        movedOut: 0,
        currencyConversion: -44.7,
        invested: s.invested,
        leftInCash: s.leftInCash,
      },
    });
    const text = document.querySelector("[data-flow-identity]")?.textContent ?? "";
    // A substring check alone is not enough here: `formatCurrency(44.7)` is
    // itself a substring of `formatCurrency(-44.7)`, so a flipped sign would
    // still "contain" the positive figure. Anchoring on the surrounding
    // "minus <figure> currency conversion" phrase is what actually proves
    // which sign rendered.
    expect(text).toContain(`minus ${formatCurrency(-44.7)} currency conversion`);
    expect(text).not.toContain(`minus ${formatCurrency(44.7)} currency conversion`);
  });

  test("a tile's figure never wraps, even a long negative one in the single narrow column", () => {
    renderTiles(summary());
    const wrapped = [...tile("Left in cash").querySelectorAll("*")].some(
      (el) => (el as HTMLElement).style.whiteSpace === "nowrap",
    );
    expect(wrapped).toBe(true);
  });

  test("a tile keeps its card styling: no inline all:unset or padding override wiping Card's own CSS", () => {
    renderTiles(summary());
    const button = tile("Paid in from outside").querySelector("button");
    expect(button?.style.all).toBeFalsy();
    expect(button?.style.padding).toBeFalsy();
    expect(button?.style.borderRadius).toBeFalsy();
  });

  test("clicking a tile opens a popover listing its parts with label, amount and share", async () => {
    renderTiles(summary());
    await openTile("Paid in from outside");
    const popover = document.querySelector('[data-flow-tile-popover="Paid in from outside"]');
    expect(popover === null).toBe(false);
    const payrollPart = popover?.querySelector('[data-flow-tile-part="payroll"]');
    expect(payrollPart?.textContent).toContain(formatCurrency(46464.63));
    expect(payrollPart?.textContent).toContain(formatShare(46464.63 / 134880.63));
  });

  test("a part with rows offers Show rows, which closes the popover and reports the exact selector", async () => {
    const seen: PartSelector[] = [];
    renderTiles(summary(), (selector) => seen.push(selector));
    await openTile("Paid in from outside");
    const button = document.querySelector("[data-flow-tile-show-rows]");
    if (button === null) throw new Error("expected a Show rows button");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(seen).toEqual([{ tileKey: "paidIn", sectionTitle: null, partKey: "payroll" }]);
    expect(document.querySelector('[data-flow-tile-popover="Paid in from outside"]') === null).toBe(
      true,
    );
  });

  test("left in cash never shows a share, and says why", async () => {
    renderTiles(summary());
    await openTile("Left in cash");
    const popover = document.querySelector('[data-flow-tile-popover="Left in cash"]');
    expect(popover?.textContent).toContain("Shares are not shown");
    expect(popover?.textContent).not.toContain("%");
  });

  test("the invested rate popover shows the numerator and denominator terms, never a share", async () => {
    renderTiles(summary());
    await openTile("Invested rate");
    const popover = document.querySelector('[data-flow-tile-popover="Invested rate"]');
    expect(popover?.textContent).toContain("Invested");
    expect(popover?.textContent).toContain("Paid in from outside");
    expect(popover?.textContent).not.toContain("%");
  });
});
