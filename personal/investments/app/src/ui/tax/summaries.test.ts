import { describe, expect, test } from "bun:test";
import type { AnalyticsOutput } from "../../analytics/build";
import type { HoldingSummary, HoldingsOutput } from "../../analytics/holdings";
import type { SaleDetail } from "../../analytics/income";
import type { SuperficialLossCandidate } from "../../analytics/superficialLoss";
import type { AccountKind } from "../../store/mask";
import { formatCurrency } from "../format";
import {
  attentionItems,
  capitalLossCarryforward,
  harvestCandidates,
  hideZeroRows,
  holdingsForAccount,
  isCashHolding,
  openSuperficialLossWindows,
  salesByAccount,
  salesByMonth,
  splitSuperficialLosses,
  unknownCostSummary,
} from "./summaries";

function sale(overrides: Partial<SaleDetail>): SaleDetail {
  return {
    date: "2026-03-10",
    symbol: "UNH",
    maskedId: "acct_1",
    proceeds: 100,
    acb: 80,
    gain: 20,
    costUnknown: false,
    ...overrides,
  };
}

function candidate(overrides: Partial<SuperficialLossCandidate>): SuperficialLossCandidate {
  return {
    sale: sale({ gain: -25.95 }),
    windowStart: "2026-02-08",
    windowEnd: "2026-04-09",
    status: "confirmed",
    matchedBuy: { date: "2026-03-15", maskedId: "acct_2" },
    ...overrides,
  };
}

function holding(overrides: Partial<HoldingSummary>): HoldingSummary {
  return {
    symbol: "AAPL",
    name: "Apple Inc",
    value: 100,
    share: 0.1,
    accounts: ["Direct indexing"],
    priceCurrency: "USD",
    assetClass: "Equity",
    pendingValuation: false,
    bookCost: 100,
    bookCostConverted: false,
    ...overrides,
  };
}

function holdingsOutput(holdings: HoldingSummary[]): HoldingsOutput {
  return {
    period: "2026-08",
    total: holdings.reduce((sum, h) => sum + h.value, 0),
    holdings,
    groups: [],
    currency: { CAD: 0, USD: 0 },
    assetClasses: [],
    behind: [],
    cashByAccount: {},
  };
}

describe("salesByAccount", () => {
  test("empty for no sales", () => {
    expect(salesByAccount([], new Map())).toEqual([]);
  });

  test("groups and sums across accounts", () => {
    const sales = [
      sale({ maskedId: "a", proceeds: 100, gain: 10 }),
      sale({ maskedId: "a", proceeds: 50, gain: -5 }),
      sale({ maskedId: "b", proceeds: 200, gain: 20 }),
    ];
    const labels = new Map([
      ["a", "Non-registered"],
      ["b", "Crypto"],
    ]);
    const rows = salesByAccount(sales, labels);
    expect(rows).toEqual([
      { maskedId: "b", label: "Crypto", count: 1, proceeds: 200, netGain: 20 },
      { maskedId: "a", label: "Non-registered", count: 2, proceeds: 150, netGain: 5 },
    ]);
  });

  test("falls back to the masked id when no label is known", () => {
    const rows = salesByAccount([sale({ maskedId: "acct_x" })], new Map());
    expect(rows[0]?.label).toBe("acct_x");
  });
});

describe("salesByMonth", () => {
  test("empty for no sales", () => {
    expect(salesByMonth([])).toEqual([]);
  });

  test("groups by YYYY-MM, oldest first, at most 12 rows for a year", () => {
    const sales = Array.from({ length: 12 }, (_, i) =>
      sale({ date: `2026-${String(i + 1).padStart(2, "0")}-01`, proceeds: 10, gain: 1 }),
    );
    const rows = salesByMonth(sales);
    expect(rows).toHaveLength(12);
    expect(rows[0]?.month).toBe("2026-01");
    expect(rows[11]?.month).toBe("2026-12");
  });
});

describe("unknownCostSummary", () => {
  test("zero for no sales", () => {
    expect(unknownCostSummary([])).toEqual({ count: 0, gain: 0 });
  });

  test("counts and sums unknown-cost sales only", () => {
    const sales = [
      sale({ costUnknown: true, gain: 0 }),
      sale({ costUnknown: false, gain: 50 }),
      sale({ costUnknown: true, gain: 0 }),
    ];
    expect(unknownCostSummary(sales)).toEqual({ count: 2, gain: 0 });
  });
});

function incomeYear(realizedGains: number): AnalyticsOutput["income"][string] {
  return {
    interest: 0,
    canadianDistributions: 0,
    foreignDividends: 0,
    foreignTaxWithheld: 0,
    realizedGains,
    costUnknownSales: 0,
    corporateActions: [],
    sales: [],
  };
}

describe("capitalLossCarryforward", () => {
  test("no years produces no rows", () => {
    expect(capitalLossCarryforward({}, 0.5)).toEqual([]);
  });

  test("a net-loss year adds to the running balance, oldest year first", () => {
    const income = {
      "2025": incomeYear(2000),
      "2026": incomeYear(-1000),
    };
    const rows = capitalLossCarryforward(income, 0.5);
    expect(rows).toEqual([
      { year: 2025, yearLoss: 0, running: 0 },
      { year: 2026, yearLoss: 500, running: 500 },
    ]);
  });

  test("the running balance carries forward unchanged through a later gain year, never reduced by it", () => {
    const income = {
      "2025": incomeYear(-1000),
      "2026": incomeYear(2000),
    };
    const rows = capitalLossCarryforward(income, 0.5);
    expect(rows).toEqual([
      { year: 2025, yearLoss: 500, running: 500 },
      { year: 2026, yearLoss: 0, running: 500 },
    ]);
  });

  test("two consecutive loss years accumulate", () => {
    const income = {
      "2025": incomeYear(-1000),
      "2026": incomeYear(-200),
    };
    const rows = capitalLossCarryforward(income, 0.5);
    expect(rows[1]).toEqual({ year: 2026, yearLoss: 100, running: 600 });
  });
});

describe("splitSuperficialLosses", () => {
  test("empty candidates produce no cross-account lines and no summary", () => {
    expect(splitSuperficialLosses([])).toEqual({ crossAccount: [], sameAccount: null });
  });

  test("no losses: no confirmed cases yields null sameAccount and empty crossAccount", () => {
    const candidates = [candidate({ status: "pending", matchedBuy: null })];
    expect(splitSuperficialLosses(candidates)).toEqual({ crossAccount: [], sameAccount: null });
  });

  test("cross-account confirmed loss is listed", () => {
    const c = candidate({
      sale: sale({ maskedId: "acct_1", gain: -25.95 }),
      matchedBuy: { date: "2026-03-12", maskedId: "acct_2" },
    });
    const split = splitSuperficialLosses([c]);
    expect(split.crossAccount).toHaveLength(1);
    expect(split.sameAccount).toBeNull();
  });

  test("same-account confirmed losses are summarized, not listed", () => {
    const candidates = [
      candidate({
        sale: sale({ maskedId: "acct_1", gain: -10 }),
        matchedBuy: { date: "2026-03-12", maskedId: "acct_1" },
      }),
      candidate({
        sale: sale({ maskedId: "acct_1", gain: -12.5 }),
        matchedBuy: { date: "2026-04-01", maskedId: "acct_1" },
      }),
    ];
    const split = splitSuperficialLosses(candidates);
    expect(split.crossAccount).toEqual([]);
    expect(split.sameAccount).toEqual({ count: 2, total: 22.5 });
  });
});

describe("openSuperficialLossWindows", () => {
  test("empty for no candidates", () => {
    expect(openSuperficialLossWindows([])).toEqual([]);
  });

  test("only pending status is returned", () => {
    const candidates = [
      candidate({ status: "pending", matchedBuy: null }),
      candidate({ status: "confirmed" }),
      candidate({ status: "clear", matchedBuy: null }),
    ];
    expect(openSuperficialLossWindows(candidates)).toHaveLength(1);
  });
});

describe("harvestCandidates", () => {
  const rates = { inclusion: 0.5, rate: 0.4826 };

  test("empty holdings yields no candidates", () => {
    expect(harvestCandidates(holdingsOutput([]), rates)).toEqual([]);
  });

  test("null rates (year without entered tax rates) yields no candidates", () => {
    const holdings = holdingsOutput([holding({ value: 50, bookCost: 500 })]);
    expect(harvestCandidates(holdings, null)).toEqual([]);
  });

  test("only losses over the $100 threshold qualify", () => {
    const holdings = holdingsOutput([
      holding({ symbol: "A", value: 950, bookCost: 1000 }), // -$50, below threshold
      holding({ symbol: "B", value: 700, bookCost: 1000 }), // -$300
      holding({ symbol: "C", value: 1100, bookCost: 1000 }), // gain, excluded
    ]);
    const rows = harvestCandidates(holdings, rates);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbol).toBe("B");
    expect(rows[0]?.taxValue).toBeCloseTo(300 * 0.5 * 0.4826, 6);
  });
});

describe("isCashHolding / holdingsForAccount", () => {
  const cash = holding({ symbol: "", name: "Cash (CAD)", bookCost: 0, accounts: ["Corporate"] });
  const stock = holding({ symbol: "VOO", name: "Vanguard S&P 500", accounts: ["Corporate"] });
  const pooled = holding({
    symbol: "XEQT",
    name: "iShares Core Equity",
    accounts: ["Corporate", "Corporate (self)"],
  });
  const out = holdingsOutput([cash, stock, pooled]);

  test("isCashHolding identifies only the synthetic cash row", () => {
    expect(isCashHolding(cash)).toBe(true);
    expect(isCashHolding(stock)).toBe(false);
  });

  test("holdingsForAccount excludes cash and includes pooled holdings", () => {
    const rows = holdingsForAccount(out, "Corporate");
    expect(rows.map((h) => h.symbol).sort()).toEqual(["VOO", "XEQT"]);
  });

  test("a pooled holding appears for every account it is pooled across", () => {
    expect(holdingsForAccount(out, "Corporate (self)").map((h) => h.symbol)).toEqual(["XEQT"]);
  });
});

describe("hideZeroRows", () => {
  test("empty input yields empty output", () => {
    expect(hideZeroRows([], () => true)).toEqual([]);
  });

  test("drops rows the predicate flags as zero, preserving order", () => {
    const rows = [
      { year: 2023, total: 0 },
      { year: 2024, total: 0 },
      { year: 2025, total: 10 },
      { year: 2026, total: 51.36 },
    ];
    expect(hideZeroRows(rows, (r) => r.total === 0)).toEqual([
      { year: 2025, total: 10 },
      { year: 2026, total: 51.36 },
    ]);
  });
});

describe("attentionItems", () => {
  const labelById = new Map([
    ["acct_sale", "Non-registered 2c62"],
    ["acct_rrsp", "RRSP (self-directed)"],
    ["acct_nr", "Non-registered 1f9a"],
  ]);
  const kindById: ReadonlyMap<string, AccountKind> = new Map([
    ["acct_sale", "NonRegistered"],
    ["acct_rrsp", "RRSP"],
    ["acct_nr", "NonRegistered"],
  ]);

  test("nothing flagged yields an empty list", () => {
    const items = attentionItems({
      superficialLoss: [],
      harvest: [],
      t1135MaxCost: 1000,
      t1135FilingThreshold: 100000,
      labelById,
      kindById,
      formatCurrency,
    });
    expect(items).toEqual([]);
  });

  test("a cross-account confirmed loss names the BUYING account, not the selling one, and is 'gone permanently' when the buyer is registered", () => {
    const crossAccountLoss = candidate({
      sale: sale({ maskedId: "acct_sale", symbol: "UNH", gain: -25.95 }),
      matchedBuy: { date: "2026-03-12", maskedId: "acct_rrsp" },
    });
    const items = attentionItems({
      superficialLoss: [crossAccountLoss],
      harvest: [],
      t1135MaxCost: null,
      t1135FilingThreshold: null,
      labelById,
      kindById,
      formatCurrency,
    });
    const item = items.find((i) => i.key === "cross:acct_sale:UNH:2026-03-10");
    expect(item?.text).toBe(
      "UNH: $25.95 of loss denied because you bought UNH in your RRSP (self-directed) within 30 " +
        "days. Gone permanently (registered account).",
    );
  });

  test("a cross-account confirmed loss is 'deferred' when the buying account is non-registered", () => {
    const crossAccountLoss = candidate({
      sale: sale({ maskedId: "acct_sale", symbol: "ORCL", gain: -14.82 }),
      matchedBuy: { date: "2026-04-13", maskedId: "acct_nr" },
    });
    const items = attentionItems({
      superficialLoss: [crossAccountLoss],
      harvest: [],
      t1135MaxCost: null,
      t1135FilingThreshold: null,
      labelById,
      kindById,
      formatCurrency,
    });
    const item = items.find((i) => i.key === "cross:acct_sale:ORCL:2026-03-10");
    expect(item?.text).toBe(
      "ORCL: $14.82 of loss denied because you bought ORCL in your Non-registered 1f9a within 30 " +
        "days. Deferred: added to the cost of the shares bought.",
    );
  });

  test("an open window, a harvest candidate and a T1135 flag each produce one item", () => {
    const openWindow = candidate({
      status: "pending",
      matchedBuy: null,
      sale: sale({ symbol: "XYZ", gain: -40 }),
      windowEnd: "2026-05-01",
    });
    const items = attentionItems({
      superficialLoss: [openWindow],
      harvest: [{ symbol: "ABC", name: "ABC Corp", loss: -300, taxValue: 72.39 }],
      t1135MaxCost: 85000,
      t1135FilingThreshold: 100000,
      labelById,
      kindById,
      formatCurrency,
    });
    const keys = items.map((i) => i.key);
    expect(keys.some((k) => k.startsWith("open:"))).toBe(true);
    expect(keys).toContain("harvest:ABC");
    expect(keys).toContain("t1135-threshold");
  });

  test("T1135 flags only once the max cost exceeds 80% of the filing threshold", () => {
    const below = attentionItems({
      superficialLoss: [],
      harvest: [],
      t1135MaxCost: 79000,
      t1135FilingThreshold: 100000,
      labelById,
      kindById,
      formatCurrency,
    });
    expect(below.find((i) => i.key === "t1135-threshold")).toBeUndefined();
  });

  test("a year with no rates (null t1135 figures) never flags T1135", () => {
    const items = attentionItems({
      superficialLoss: [],
      harvest: [],
      t1135MaxCost: null,
      t1135FilingThreshold: null,
      labelById,
      kindById,
      formatCurrency,
    });
    expect(items).toEqual([]);
  });
});
