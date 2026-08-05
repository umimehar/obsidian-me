import { describe, expect, test } from "bun:test";
import type { Statement } from "../types";
import {
  checkArithmetic,
  checkContinuity,
  checkCoverage,
  checkCrossDocument,
  checkGroundTruth,
  checkKindConsistency,
  checkSupersession,
} from "./checks";

function src(period: string, template: "BROKERAGE" | "CASH" | "PERFORMANCE", version = 0) {
  return {
    file: `ACCT0001CAD_${period}_${template}.pdf`,
    accountNo: "ACCT0001CAD",
    period,
    template,
    version,
  };
}

function statement(over: Partial<Statement> = {}): Statement {
  return {
    source: src("2026-06", "BROKERAGE"),
    accountType: "Managed RRSP Account",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    portfolio: {
      cashMarketValue: 122.95,
      cashBookCost: 122.95,
      classes: [
        {
          name: "Canadian Equities and Alternatives",
          marketValue: 20375.59,
          bookCost: 20378.75,
        },
      ],
      totalMarketValue: 20498.54,
      totalBookCost: 20501.7,
    },
    cash: [
      {
        currency: "CAD",
        opening: 116.67,
        closing: 122.95,
        totalIn: 12430.95,
        totalOut: 12424.67,
        paidIn: {
          deposits: 0,
          proceedsFromSales: 12417.15,
          dividends: 13.8,
          interestEarned: 0,
          stockLendingIncome: 0,
          other: 0,
        },
        paidOut: {
          fees: 7.52,
          taxes: 0,
          interestPaid: 0,
          costOfInvestments: 12417.15,
          withdrawals: 0,
          other: 0,
        },
      },
    ],
    holdings: [
      {
        name: "Purpose High Interest Savings ETF",
        symbol: "PSA",
        quantity: 159.1371,
        segregatedQuantity: 159.1371,
        marketPrice: 50.01,
        priceCurrency: "CAD",
        marketValue: 7958.44,
        marketValueConverted: false,
        bookCost: 7961.6,
        assetClass: "Canadian Equities and Alternatives",
        pendingValuation: false,
        bookCostConverted: false,
      },
      {
        name: "WS PVT MKT I F",
        symbol: "WSE401",
        quantity: 1241.715,
        segregatedQuantity: 0,
        marketPrice: 10,
        priceCurrency: "CAD",
        marketValue: 12417.15,
        marketValueConverted: false,
        bookCost: 12417.15,
        assetClass: "Canadian Equities and Alternatives",
        pendingValuation: true,
        bookCostConverted: false,
      },
    ],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
    ...over,
  };
}

describe("checkArithmetic", () => {
  test("passes a statement whose printed figures agree", () => {
    expect(checkArithmetic([statement()])).toEqual([]);
  });

  test("flags cash that does not reconcile", () => {
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad) throw new Error("fixture");
    cad.closing = 999;
    const f = checkArithmetic([bad]);
    expect(f).toHaveLength(1);
    expect(f[0]?.check).toBe("statement-arithmetic");
    expect(f[0]?.accountShortId).not.toContain("ACCT");
  });

  test("flags holdings that do not sum to the portfolio total", () => {
    const bad = statement();
    const h = bad.holdings[0];
    if (!h) throw new Error("fixture");
    h.marketValue = 1;
    expect(checkArithmetic([bad]).some((x) => x.message.includes("portfolio total"))).toBe(true);
  });

  test("treats a small market-value residual on converted holdings as fx rounding", () => {
    // The statement discloses its fx rate to only six decimals, so summing
    // several holdings converted at that rounded rate can drift a cent or
    // two from the printed total -- a real, expected residual, not a parser
    // defect. Both holdings converted here budgets 2 cents of drift.
    const bad = statement();
    const psa = bad.holdings[0];
    const wse = bad.holdings[1];
    if (!psa || !wse) throw new Error("fixture");
    psa.marketValueConverted = true;
    wse.marketValueConverted = true;
    psa.marketValue += 0.015; // over tolerance (0.011), under the 2-cent budget
    const f = checkArithmetic([bad]);
    const marketFinding = f.find((x) => x.message.includes("market value"));
    expect(marketFinding).toBeDefined();
    expect(marketFinding?.severity).toBe("warning");
    expect(marketFinding?.message).toMatch(/six decimals/);
  });

  test("still flags a market-value residual too large to be fx rounding as an error", () => {
    const bad = statement();
    const psa = bad.holdings[0];
    if (!psa) throw new Error("fixture");
    psa.marketValueConverted = true;
    psa.marketValue += 0.05; // 1 converted holding budgets only 1 cent
    const f = checkArithmetic([bad]);
    const marketFinding = f.find((x) => x.message.includes("portfolio total"));
    expect(marketFinding).toBeDefined();
    expect(marketFinding?.severity).toBe("error");
  });

  test("flags a book-cost mismatch with no converted holding as an error, at any magnitude", () => {
    // No conversion touched this class at all, so there is no excuse for any
    // size of mismatch -- unlike market value, book cost gets no budget: a
    // magnitude cap cannot tell a real column-read bug from an fx residual,
    // since the two overlap in size (a wrong-column read on these same
    // statements would be 0.16%-26.05%, the real fx residuals 0.02%-4.55%).
    const bad = statement();
    const h = bad.holdings[0];
    if (!h) throw new Error("fixture");
    h.bookCost = 1;
    const f = checkArithmetic([bad]);
    const classFinding = f.find((x) => x.message.includes("Canadian Equities"));
    expect(classFinding).toBeDefined();
    expect(classFinding?.severity).toBe("error");
    const wholeFinding = f.find(
      (x) => x.message === "holdings plus cash do not equal the portfolio book cost total",
    );
    expect(wholeFinding).toBeDefined();
    expect(wholeFinding?.severity).toBe("error");
  });

  test("flags a book-cost mismatch with a converted holding as a named warning, regardless of size", () => {
    // A USD holding's book cost is converted at the statement's own fx rate,
    // which its footnote discloses for market value only -- a real,
    // expected residual, not a parser bug, so it must not read as an error.
    // No magnitude cap here: the classification is structural (does this
    // class contain a converted holding), not a size threshold.
    const bad = statement();
    const h = bad.holdings[0];
    if (!h) throw new Error("fixture");
    h.bookCost += 1000;
    h.bookCostConverted = true;
    const f = checkArithmetic([bad]);
    const classFinding = f.find((x) => x.message.includes("Canadian Equities"));
    expect(classFinding).toBeDefined();
    expect(classFinding?.severity).toBe("warning");
    expect(classFinding?.message).toMatch(/disclosed rate applies to market value only/);
  });

  test("flags an all-CAD class mismatch as an error even when another class on the same statement holds converted USD holdings", () => {
    // This is the case the old whole-statement `hasConverted` flag let
    // through: a USD holding anywhere on the statement used to excuse a
    // mismatch everywhere on it. A real defect in the CAD class must not be
    // masked by an unrelated, correctly-reconciling converted class.
    const bad = statement({
      portfolio: {
        cashMarketValue: 0,
        cashBookCost: 0,
        classes: [
          { name: "Canadian Equities and Alternatives", marketValue: 100, bookCost: 100 },
          { name: "US Equities and Alternatives", marketValue: 200, bookCost: 200 },
        ],
        totalMarketValue: 300,
        totalBookCost: 300,
      },
      holdings: [
        {
          name: "CAD Fund",
          symbol: "CDF",
          quantity: 1,
          segregatedQuantity: 1,
          marketPrice: 100,
          priceCurrency: "CAD",
          marketValue: 100,
          marketValueConverted: false,
          bookCost: 50, // wrong: the class expects 100, and nothing here was converted
          assetClass: "Canadian Equities and Alternatives",
          pendingValuation: false,
          bookCostConverted: false,
        },
        {
          name: "US Fund",
          symbol: "USF",
          quantity: 1,
          segregatedQuantity: 1,
          marketPrice: 200,
          priceCurrency: "USD",
          marketValue: 200,
          marketValueConverted: true,
          bookCost: 200, // reconciles exactly
          assetClass: "US Equities and Alternatives",
          pendingValuation: false,
          bookCostConverted: true,
        },
      ],
    });
    const f = checkArithmetic([bad]);
    const cadFinding = f.find((x) => x.message.includes("Canadian Equities"));
    expect(cadFinding).toBeDefined();
    expect(cadFinding?.severity).toBe("error");
    expect(f.find((x) => x.message.includes("US Equities"))).toBeUndefined();
    const wholeFinding = f.find(
      (x) => x.message === "holdings plus cash do not equal the portfolio book cost total",
    );
    expect(wholeFinding).toBeDefined();
    expect(wholeFinding?.severity).toBe("error");
  });

  test("flags a paid-in breakdown that does not sum to its total", () => {
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad?.paidIn) throw new Error("fixture");
    cad.paidIn.dividends = 500;
    expect(checkArithmetic([bad]).some((x) => x.message.includes("paid in"))).toBe(true);
  });

  test("flags a BROKERAGE statement with no portfolio as a parser bug", () => {
    const bad = statement({ portfolio: null, holdings: [] });
    expect(checkArithmetic([bad]).some((x) => x.check === "missing-portfolio")).toBe(true);
  });

  test("skips the cash arithmetic when no totals are printed", () => {
    const cashOnly = statement({
      source: src("2026-06", "CASH"),
      portfolio: null,
      holdings: [],
      cash: [
        {
          currency: "CAD",
          opening: 195.59,
          closing: 155.62,
          totalIn: null,
          totalOut: null,
          paidIn: null,
          paidOut: null,
        },
      ],
    });
    expect(checkArithmetic([cashOnly])).toEqual([]);
  });
});

describe("checkContinuity", () => {
  const june = () => statement();
  const july = (opening: number) =>
    statement({
      source: src("2026-07", "BROKERAGE"),
      cash: [
        {
          currency: "CAD",
          opening,
          closing: opening,
          totalIn: 0,
          totalOut: 0,
          paidIn: null,
          paidOut: null,
        },
      ],
    });

  test("passes when one month closes where the next opens", () => {
    expect(checkContinuity([june(), july(122.95)])).toEqual([]);
  });

  test("flags a broken opening balance", () => {
    // delta follows the actual-minus-expected convention every other check
    // uses: the printed opening (actual) is 500, the prior close it should
    // have equaled (expected) is 122.95.
    const f = checkContinuity([june(), july(500)]);
    expect(f).toHaveLength(1);
    expect(f[0]?.delta).toBeCloseTo(500 - 122.95, 2);
  });

  test("does not compare a CASH statement against a BROKERAGE one", () => {
    // The three chequing accounts have both for the same month. Comparing
    // across templates produces guaranteed false findings.
    const brokerage = june();
    const cash = statement({
      source: src("2026-06", "CASH"),
      cash: [
        {
          currency: "CAD",
          opening: 195.59,
          closing: 155.62,
          totalIn: null,
          totalOut: null,
          paidIn: null,
          paidOut: null,
        },
      ],
    });
    const nextCash = statement({
      source: src("2026-07", "CASH"),
      cash: [
        {
          currency: "CAD",
          opening: 155.62,
          closing: 155.62,
          totalIn: null,
          totalOut: null,
          paidIn: null,
          paidOut: null,
        },
      ],
    });
    expect(checkContinuity([brokerage, cash, nextCash])).toEqual([]);
  });

  test("keys the series on template, not just account and period order", () => {
    // BROKERAGE runs June -> July with matching balances. CASH exists only in
    // June with unrelated balances. If the series were keyed on account alone,
    // sorting by period would place CASH-June directly before BROKERAGE-July
    // in the merged list, and their unrelated balances would be compared.
    const brokerageJune = june();
    const cashJune = statement({
      source: src("2026-06", "CASH"),
      cash: [
        {
          currency: "CAD",
          opening: 100,
          closing: 500,
          totalIn: null,
          totalOut: null,
          paidIn: null,
          paidOut: null,
        },
      ],
    });
    const brokerageJuly = july(122.95);
    expect(checkContinuity([brokerageJune, cashJune, brokerageJuly])).toEqual([]);
  });
});

describe("checkCoverage", () => {
  test("passes a contiguous run", () => {
    const run = ["2026-04", "2026-05", "2026-06"].map((p) =>
      statement({ source: src(p, "BROKERAGE") }),
    );
    expect(checkCoverage(run)).toEqual([]);
  });

  test("flags a missing month across a year boundary", () => {
    const run = ["2025-11", "2026-01"].map((p) => statement({ source: src(p, "BROKERAGE") }));
    const f = checkCoverage(run);
    expect(f).toHaveLength(1);
    expect(f[0]?.period).toBe("2025-12");
  });

  test("does not report a gap because one template starts later", () => {
    const rows = [
      statement({ source: src("2026-05", "BROKERAGE") }),
      statement({ source: src("2026-06", "BROKERAGE") }),
      statement({ source: src("2026-06", "CASH") }),
    ];
    expect(checkCoverage(rows)).toEqual([]);
  });

  test("terminates and reports a stuck scan instead of looping forever", () => {
    // "1" has no dash, so nextPeriod cannot parse a month out of it and
    // returns it unchanged -- the scan would never reach "2026-01" without a
    // hard bound. parseSourceFilename would reject this in practice; the
    // check must not depend on that for its own termination.
    const rows = [
      statement({ source: src("1", "BROKERAGE") }),
      statement({ source: src("2026-01", "BROKERAGE") }),
    ];
    const f = checkCoverage(rows);
    expect(f.some((x) => x.severity === "error" && x.message.includes("stuck"))).toBe(true);
  });
});

describe("checkCrossDocument", () => {
  test("flags disagreement between performance and brokerage portfolio totals", () => {
    const brokerage = statement();
    const brokeragePortfolio = brokerage.portfolio;
    if (!brokeragePortfolio) throw new Error("fixture");
    const performance = statement({
      source: src("2026-06", "PERFORMANCE"),
      portfolio: { ...brokeragePortfolio, totalMarketValue: 99999 },
      balances: { start: 0, deposits: 0, withdrawals: 0, changeInMarketValue: 99999, end: 99999 },
    });
    const f = checkCrossDocument([brokerage, performance]);
    expect(f.some((x) => x.check === "cross-document" && x.message.includes("disagree"))).toBe(
      true,
    );
  });

  test("flags a performance balance summary that does not reconcile", () => {
    const performance = statement({
      source: src("2026-06", "PERFORMANCE"),
      portfolio: null,
      holdings: [],
      balances: { start: 100, deposits: 50, withdrawals: 10, changeInMarketValue: 5, end: 999 },
    });
    const f = checkCrossDocument([performance]);
    expect(f.some((x) => x.message.includes("does not reconcile"))).toBe(true);
  });

  test("flags a balance summary end that does not match the portfolio total", () => {
    // Reconciles internally (0 + 0 - 0 + 100 = 100) but disagrees with the
    // portfolio total the default fixture carries (20498.54).
    const performance = statement({
      source: src("2026-06", "PERFORMANCE"),
      balances: { start: 0, deposits: 0, withdrawals: 0, changeInMarketValue: 100, end: 100 },
    });
    const f = checkCrossDocument([performance]);
    expect(f.some((x) => x.message.includes("does not match the portfolio total"))).toBe(true);
  });

  test("flags a missing balance summary as a warning, not a silent pass", () => {
    const performance = statement({ source: src("2026-06", "PERFORMANCE"), balances: null });
    const f = checkCrossDocument([performance]);
    const missing = f.find((x) => x.severity === "warning");
    expect(missing).toBeDefined();
    expect(missing?.message.toLowerCase()).toContain("balance");
  });
});

describe("checkSupersession", () => {
  test("reports an amended statement replacing an earlier version", () => {
    const f = checkSupersession([
      statement({ source: src("2026-06", "BROKERAGE", 0) }),
      statement({ source: src("2026-06", "BROKERAGE", 2) }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.check).toBe("superseded");
    expect(f[0]?.severity).toBe("warning");
  });

  test("says nothing when there is one version", () => {
    expect(checkSupersession([statement()])).toEqual([]);
  });
});

describe("checkKindConsistency", () => {
  test("passes when a renamed wording still maps to the same kind", () => {
    // The same TFSA reads three different ways across the corpus.
    const rows = [
      statement({ source: src("2023-06", "BROKERAGE"), accountType: "Tax-Free Savings Account" }),
      statement({ source: src("2026-01", "BROKERAGE"), accountType: "Self-directed TFSA Account" }),
      statement({
        source: src("2026-06", "BROKERAGE"),
        accountType: "Order Execution Only TFSA Account",
      }),
    ];
    expect(checkKindConsistency(rows)).toEqual([]);
  });

  test("flags an account whose kind changes", () => {
    const rows = [
      statement({ source: src("2026-01", "BROKERAGE"), accountType: "Managed TFSA Account" }),
      statement({ source: src("2026-06", "BROKERAGE"), accountType: "Managed RRSP Account" }),
    ];
    expect(checkKindConsistency(rows).some((f) => f.check === "kind-drift")).toBe(true);
  });
});

describe("checkGroundTruth", () => {
  const obs = [
    { observed: "2026-06-30", period: "2026-06", accountValue: 20000, netDeposits: null },
  ];

  test("reports the delta against the observed app figure", () => {
    const f = checkGroundTruth([statement()], obs, new Set<string>());
    expect(f).toHaveLength(1);
    expect(f[0]?.actual).toBeCloseTo(20498.54, 2);
    expect(f[0]?.delta).toBeCloseTo(498.54, 2);
  });

  test("counts only the accounts it is told to count", () => {
    const f = checkGroundTruth([statement()], obs, new Set(["SOMETHING-ELSE"]));
    expect(f[0]?.actual).toBe(0);
  });

  test("names a pending valuation as a known reason for the delta", () => {
    // The $279.94 residual is one unpriced private-markets holding.
    const f = checkGroundTruth([statement()], obs, new Set<string>());
    expect(f[0]?.message).toMatch(/pending valuation/i);
  });

  test("does not double count a PERFORMANCE statement beside its BROKERAGE twin", () => {
    const both = [statement(), statement({ source: src("2026-06", "PERFORMANCE") })];
    const f = checkGroundTruth(both, obs, new Set<string>());
    expect(f[0]?.actual).toBeCloseTo(20498.54, 2);
  });
});
