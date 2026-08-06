import { describe, expect, test } from "bun:test";
import type { ActivityRow, CashSummary, Statement } from "../types";
import {
  checkArithmetic,
  checkBalanceChain,
  checkContinuity,
  checkCoverage,
  checkCrossDocument,
  checkGroundTruth,
  checkKindConsistency,
  checkReturnDirection,
  checkStyleConsistency,
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
    activity: [
      {
        date: "2026-06-01",
        postedDate: null,
        code: "SELL",
        description: "Sold WSE300",
        debit: 0,
        credit: 12417.15,
        balance: 12417.15,
        currency: "CAD",
      },
      {
        date: "2026-06-02",
        postedDate: null,
        code: "DIV",
        description: "Cash dividend distribution",
        debit: 0,
        credit: 13.8,
        balance: 12430.95,
        currency: "CAD",
      },
      {
        date: "2026-06-01",
        postedDate: null,
        code: "BUY",
        description: "Bought WSE401",
        debit: 12417.15,
        credit: 0,
        balance: 13.8,
        currency: "CAD",
      },
      {
        date: "2026-06-30",
        postedDate: null,
        code: "FEE",
        description: "Management fees",
        debit: 7.52,
        credit: 0,
        balance: 6.28,
        currency: "CAD",
      },
    ],
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

  test("flags a real market-value defect in one class even when another converted class reconciles fine", () => {
    // The whole-statement magnitude budget this replaced could not tell a
    // real defect in one class from an unrelated converted class -- a USD
    // holding anywhere on the statement used to excuse a mismatch anywhere
    // on it. reconcileClassMarketValue is per class, so it cannot.
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
          marketPrice: 50,
          priceCurrency: "CAD",
          marketValue: 50, // wrong: the class expects 100, and nothing here was converted
          marketValueConverted: false,
          bookCost: 100,
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
          marketValue: 200, // reconciles exactly
          marketValueConverted: true,
          bookCost: 200,
          assetClass: "US Equities and Alternatives",
          pendingValuation: false,
          bookCostConverted: true,
        },
      ],
    });
    const f = checkArithmetic([bad]);
    const cadFinding = f.find(
      (x) => x.message.includes("Canadian Equities") && x.message.includes("market value"),
    );
    expect(cadFinding).toBeDefined();
    expect(cadFinding?.severity).toBe("error");
    expect(
      f.find((x) => x.message.includes("US Equities") && x.message.includes("market value")),
    ).toBeUndefined();
    const wholeFinding = f.find(
      (x) => x.message === "holdings plus cash do not equal the portfolio total",
    );
    expect(wholeFinding).toBeDefined();
    expect(wholeFinding?.severity).toBe("error");
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

  test("flags a holding with no asset class as an error, even though it still counts toward the whole-statement sum", () => {
    // reconcileClassBookCost matches holdings by exact assetClass name, so an
    // empty class silently drops the holding from every per-class check
    // while it still counts in the whole-statement sum below -- this is the
    // gap that needs its own, independent check.
    const bad = statement();
    const wse = bad.holdings[1];
    if (!wse) throw new Error("fixture");
    wse.assetClass = "";
    const f = checkArithmetic([bad]);
    const orphan = f.find((x) => x.message.includes("no asset class"));
    expect(orphan).toBeDefined();
    expect(orphan?.severity).toBe("error");
    expect(orphan?.message).toContain("WSE401");
  });

  test("flags a holding whose asset class matches no stated class as an error", () => {
    const bad = statement();
    const wse = bad.holdings[1];
    if (!wse) throw new Error("fixture");
    wse.assetClass = "Crypto Assets"; // never appears in this fixture's portfolio.classes
    const f = checkArithmetic([bad]);
    const orphan = f.find((x) => x.message.includes("never states"));
    expect(orphan).toBeDefined();
    expect(orphan?.severity).toBe("error");
    expect(orphan?.message).toContain("Crypto Assets");
  });

  test("flags a column swap inside a converted class as an error, not the usual fx-rounding warning", () => {
    // A wrong-column read (book cost misread as market value) leaves the
    // class's holdings summing to the *same* figure for both fields, while
    // the statement's own stated class totals for the two are genuinely
    // different -- a shape no amount of fx rounding produces.
    const bad = statement({
      portfolio: {
        cashMarketValue: 0,
        cashBookCost: 0,
        classes: [{ name: "US Equities and Alternatives", marketValue: 200, bookCost: 150 }],
        totalMarketValue: 200,
        totalBookCost: 150,
      },
      holdings: [
        {
          name: "US Fund",
          symbol: "USF",
          quantity: 1,
          segregatedQuantity: 1,
          marketPrice: 200,
          priceCurrency: "USD",
          marketValue: 200,
          marketValueConverted: true,
          bookCost: 200, // swapped: reads the market value column, not book cost
          assetClass: "US Equities and Alternatives",
          pendingValuation: false,
          bookCostConverted: true,
        },
      ],
    });
    const f = checkArithmetic([bad]);
    const classFinding = f.find((x) => x.message.includes("US Equities"));
    expect(classFinding).toBeDefined();
    expect(classFinding?.severity).toBe("error");
    expect(classFinding?.message).toMatch(/misread from the market value column/);
  });

  test("does not suspect a column swap when a holding legitimately has book cost equal to market value", () => {
    // Bought this period, at cost -- book cost and market value are the same
    // number for a real, correct holding. The statement's own stated class
    // totals for the two also agree here, which is what keeps this out of
    // the swap check (only a genuine difference in the *stated* totals,
    // paired with an exact tie in the holdings, is suspicious).
    const bad = statement({
      portfolio: {
        cashMarketValue: 0,
        cashBookCost: 0,
        classes: [{ name: "Canadian Equities and Alternatives", marketValue: 100, bookCost: 100 }],
        totalMarketValue: 100,
        totalBookCost: 100,
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
          bookCost: 100,
          assetClass: "Canadian Equities and Alternatives",
          pendingValuation: false,
          bookCostConverted: false,
        },
      ],
    });
    expect(checkArithmetic([bad])).toEqual([]);
  });

  test("flags a paid-in breakdown that does not sum to its total", () => {
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad?.paidIn) throw new Error("fixture");
    cad.paidIn.dividends = 500;
    expect(checkArithmetic([bad]).some((x) => x.message.includes("paid in"))).toBe(true);
  });

  test("flags activity credits/debits that plainly do not sum to the printed totals as an error", () => {
    const bad = statement();
    const sell = bad.activity.find((r) => r.code === "SELL");
    if (!sell) throw new Error("fixture");
    sell.credit = 1; // no matching FEE rebate or reversal explains this
    const f = checkArithmetic([bad]);
    const activityFindings = f.filter((x) => x.message.includes("activity credits"));
    expect(activityFindings).toHaveLength(1);
    expect(activityFindings[0]?.severity).toBe("error");
    expect(activityFindings[0]?.expected).toBe(12430.95);
  });

  test("classifies an ETF-rebate credit netted against fees as a named warning", () => {
    // A FEE-coded credit (the rebate) inflates the credit sum above totalIn
    // and the debit sum stays untouched -- so add a plain FEE debit too and
    // shrink totalOut to match, keeping the "same residual on both sides"
    // signature this check requires before naming a cause.
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad || cad.totalOut === null) throw new Error("fixture");
    bad.activity.push({
      date: "2026-06-23",
      postedDate: null,
      code: "FEE",
      description: "ETF Rebate",
      debit: 0,
      credit: 0.15,
      balance: 6.43,
      currency: "CAD",
    });
    cad.totalOut -= 0.15; // the rebate reduced Fees paid out instead of adding to paid in
    const f = checkArithmetic([bad]);
    const activityFindings = f.filter((x) => x.message.includes("activity"));
    expect(activityFindings).toHaveLength(2);
    for (const finding of activityFindings) {
      expect(finding.severity).toBe("warning");
      expect(finding.message).toMatch(/rebate/);
    }
  });

  test("classifies a reversed entry on an amended statement as a named warning", () => {
    // A second DIV credit for 40.90, reversed same-day by a same-coded debit
    // for the same amount -- the printed totals exclude both sides of the
    // correction, leaving a matching residual in the ledger's own sums. Both
    // real reversals found in the corpus post the correction the same day.
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad || cad.totalIn === null) throw new Error("fixture");
    bad.activity.push(
      {
        date: "2026-06-15",
        postedDate: null,
        code: "DIV",
        description: "Cash dividend distribution (later reversed)",
        debit: 0,
        credit: 40.9,
        balance: 47.18,
        currency: "CAD",
      },
      {
        date: "2026-06-15",
        postedDate: null,
        code: "DIV",
        description: "Reversal of the above",
        debit: 40.9,
        credit: 0,
        balance: 6.28,
        currency: "CAD",
      },
    );
    cad.totalIn += 40.9 - 40.9; // both sides of the reversal are already outside the printed totals
    const f = checkArithmetic([bad]);
    const activityFindings = f.filter((x) => x.message.includes("activity"));
    expect(activityFindings).toHaveLength(2);
    for (const finding of activityFindings) {
      expect(finding.severity).toBe("warning");
      expect(finding.message).toMatch(/reversed the same day/);
    }
  });

  test("does not classify a same-coded, same-amount pair on different days as a reversal", () => {
    // The pairing requires the reversal to post the same day as the entry
    // it corrects -- without that, an unrelated same-coded, same-amount row
    // elsewhere in the statement (a coincidence more likely on a long
    // statement with many small same-coded rows) must not launder a real
    // mismatch into this warning.
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad || cad.totalIn === null) throw new Error("fixture");
    bad.activity.push(
      {
        date: "2026-06-15",
        postedDate: null,
        code: "DIV",
        description: "Cash dividend distribution",
        debit: 0,
        credit: 40.9,
        balance: 47.18,
        currency: "CAD",
      },
      {
        date: "2026-06-20",
        postedDate: null,
        code: "DIV",
        description: "An unrelated same-amount debit on a different day",
        debit: 40.9,
        credit: 0,
        balance: 6.28,
        currency: "CAD",
      },
    );
    const f = checkArithmetic([bad]);
    const activityFindings = f.filter((x) => x.message.includes("activity"));
    expect(activityFindings.length).toBeGreaterThan(0);
    for (const finding of activityFindings) {
      expect(finding.severity).toBe("error");
    }
  });

  test("does not launder an extra one-cent defect behind an existing reversal explanation", () => {
    // A genuine reversal pair (credit and same-day debit, both 40.90) already
    // explains part of the mismatch. If an unrelated row is also missing,
    // shifting only the debit side by another cent, the two sides' residuals
    // stop matching each other exactly -- the outer check's cent-of-slack
    // tolerance would still call that "close enough" and re-use the
    // pre-existing reversal explanation, hiding the second defect. The
    // tighter EXPLANATION_TOLERANCE inside the classifier itself must not.
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad || cad.totalOut === null) throw new Error("fixture");
    bad.activity.push(
      {
        date: "2026-06-15",
        postedDate: null,
        code: "DIV",
        description: "Cash dividend distribution (later reversed)",
        debit: 0,
        credit: 40.9,
        balance: 47.18,
        currency: "CAD",
      },
      {
        date: "2026-06-15",
        postedDate: null,
        code: "DIV",
        description: "Reversal of the above",
        debit: 40.9,
        credit: 0,
        balance: 6.28,
        currency: "CAD",
      },
    );
    cad.totalOut -= 0.01; // an unrelated debit row is also missing
    const f = checkArithmetic([bad]);
    const activityFindings = f.filter((x) => x.message.includes("activity"));
    expect(activityFindings.some((x) => x.severity === "error")).toBe(true);
  });

  test("skips the activity check when no totals are printed", () => {
    const cashOnly = statement({
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
      activity: [
        {
          date: "2026-06-01",
          postedDate: null,
          code: "TRFOUTTF",
          description: "Tax-free money transfer out",
          debit: 39.97,
          credit: 0,
          balance: 155.62,
          currency: "CAD",
        },
      ],
    });
    expect(checkArithmetic([cashOnly]).some((x) => x.message.includes("activity"))).toBe(false);
  });

  test("flags a BROKERAGE statement with no portfolio as a parser bug", () => {
    const bad = statement({ portfolio: null, holdings: [] });
    expect(checkArithmetic([bad]).some((x) => x.check === "missing-portfolio")).toBe(true);
  });

  test("does not flag a zero-activity CASH statement -- nothing to sum against a static balance", () => {
    const cashOnly = statement({
      source: src("2026-06", "CASH"),
      portfolio: null,
      holdings: [],
      cash: [
        {
          currency: "CAD",
          opening: 195.59,
          closing: 195.59,
          totalIn: null,
          totalOut: null,
          paidIn: null,
          paidOut: null,
        },
      ],
      activity: [],
    });
    expect(checkArithmetic([cashOnly])).toEqual([]);
  });

  test("reconciles a CASH statement's activity against opening and closing, with no printed totals", () => {
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
      activity: [
        {
          date: "2026-06-01",
          postedDate: null,
          code: "TRFOUTTF",
          description: "Tax-free money transfer out",
          debit: 39.97,
          credit: 0,
          balance: 155.62,
          currency: "CAD",
        },
      ],
    });
    expect(checkArithmetic([cashOnly])).toEqual([]);
  });

  test("flags a CASH statement whose activity does not reach the printed closing balance", () => {
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
      activity: [
        {
          date: "2026-06-01",
          postedDate: null,
          code: "TRFOUTTF",
          description: "Tax-free money transfer out",
          debit: 10, // should be 39.97 to reach the printed closing balance
          credit: 0,
          balance: 155.62,
          currency: "CAD",
        },
      ],
    });
    const f = checkArithmetic([cashOnly]);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/opening \+ activity credits - debits != closing/);
    expect(f[0]?.expected).toBeCloseTo(185.59, 2);
    expect(f[0]?.actual).toBe(155.62);
  });
});

function chainRow(over: Partial<ActivityRow>): ActivityRow {
  return {
    date: "2026-06-01",
    postedDate: null,
    code: "",
    description: "",
    debit: 0,
    credit: 0,
    balance: 0,
    currency: "CAD",
    ...over,
  };
}

function chainCash(over: Partial<CashSummary> = {}): CashSummary {
  return {
    currency: "CAD",
    opening: 100,
    closing: 100,
    totalIn: null,
    totalOut: null,
    paidIn: null,
    paidOut: null,
    ...over,
  };
}

describe("checkBalanceChain", () => {
  test("passes one row per date chained from the opening balance", () => {
    const s = statement({
      cash: [chainCash({ opening: 100, closing: 80 })],
      activity: [
        chainRow({ date: "2026-06-01", credit: 50, balance: 150 }),
        chainRow({ date: "2026-06-02", debit: 70, balance: 80 }),
      ],
    });
    expect(checkBalanceChain([s])).toEqual([]);
  });

  test("passes several rows sharing a date, all printing that date's closing balance", () => {
    // Two transactions on the same day: the printed balance on BOTH rows is
    // the day's closing figure, not a running per-row balance. Naive
    // row-by-row chaining would flag the first row here as a break.
    const s = statement({
      cash: [chainCash({ opening: 100, closing: 130 })],
      activity: [
        chainRow({ date: "2026-06-01", credit: 50, balance: 130 }),
        chainRow({ date: "2026-06-01", debit: 20, balance: 130 }),
      ],
    });
    expect(checkBalanceChain([s])).toEqual([]);
  });

  test("flags a date group whose credits and debits do not reach the printed balance", () => {
    const s = statement({
      cash: [chainCash({ opening: 100, closing: 200 })],
      activity: [chainRow({ date: "2026-06-01", credit: 50, balance: 200 })],
    });
    const f = checkBalanceChain([s]);
    expect(f).toHaveLength(1);
    expect(f[0]?.check).toBe("balance-chain");
    expect(f[0]?.expected).toBe(150);
    expect(f[0]?.actual).toBe(200);
  });

  test("resyncs to the printed balance so one break does not cascade into every later date", () => {
    const s = statement({
      cash: [chainCash({ opening: 100, closing: 250 })],
      activity: [
        // This date's printed balance is wrong by 20 -- a real break.
        chainRow({ date: "2026-06-01", credit: 50, balance: 170 }),
        // Chained from the CORRECT prior balance (150) this would also
        // break; chained from the printed 170 it reconciles, proving the
        // check resyncs on the printed figure rather than compounding.
        chainRow({ date: "2026-06-02", credit: 80, balance: 250 }),
      ],
    });
    const f = checkBalanceChain([s]);
    expect(f).toHaveLength(1);
    expect(f[0]?.period).toBe(s.source.period);
  });

  test("chains CAD and USD independently on a dual-currency statement", () => {
    const s = statement({
      cash: [
        chainCash({ currency: "CAD", opening: 100, closing: 150 }),
        chainCash({ currency: "USD", opening: 10, closing: 25 }),
      ],
      activity: [
        chainRow({ date: "2026-06-01", credit: 50, balance: 150, currency: "CAD" }),
        chainRow({ date: "2026-06-01", credit: 15, balance: 25, currency: "USD" }),
      ],
    });
    expect(checkBalanceChain([s])).toEqual([]);
  });

  test("passes a statement with no activity rows", () => {
    const s = statement({ cash: [chainCash({ opening: 100, closing: 100 })], activity: [] });
    expect(checkBalanceChain([s])).toEqual([]);
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
    // "is used" was false: nothing in checkSupersession itself selects a
    // version. Dropping the others is dedupeToLatestVersion's job.
    expect(f[0]?.message).toMatch(/version 2 supersedes 1 earlier one/);
    expect(f[0]?.message).not.toMatch(/is used/);
  });

  test("says nothing when there is one version", () => {
    expect(checkSupersession([statement()])).toEqual([]);
  });

  test("counts every earlier version when there are more than two", () => {
    const f = checkSupersession([
      statement({ source: src("2026-06", "BROKERAGE", 0) }),
      statement({ source: src("2026-06", "BROKERAGE", 1) }),
      statement({ source: src("2026-06", "BROKERAGE", 2) }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/3 versions of this statement; version 2 supersedes 2 earlier/);
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

describe("checkStyleConsistency", () => {
  test("passes when an account's management style is stable across a renamed wording", () => {
    const rows = [
      statement({ source: src("2023-06", "BROKERAGE"), accountType: "Tax-Free Savings Account" }),
      statement({ source: src("2026-01", "BROKERAGE"), accountType: "Self-directed TFSA Account" }),
      statement({
        source: src("2026-06", "BROKERAGE"),
        accountType: "Order Execution Only TFSA Account",
      }),
    ];
    expect(checkStyleConsistency(rows)).toEqual([]);
  });

  test("flags an account whose management style changes, even though its kind does not", () => {
    // Account 9710's real history: Tax-Free Savings Account -> Tax-Free
    // Savings Managed Cash Account -> Managed TFSA Account. Kind stays TFSA
    // throughout, so checkKindConsistency alone never catches this.
    const rows = [
      statement({ source: src("2023-06", "BROKERAGE"), accountType: "Tax-Free Savings Account" }),
      statement({
        source: src("2025-06", "BROKERAGE"),
        accountType: "Tax-Free Savings Managed Cash Account",
      }),
      statement({ source: src("2026-06", "BROKERAGE"), accountType: "Managed TFSA Account" }),
    ];
    expect(checkKindConsistency(rows)).toEqual([]);
    const f = checkStyleConsistency(rows);
    expect(f).toHaveLength(1);
    expect(f[0]?.check).toBe("style-drift");
    expect(f[0]?.message).toMatch(/managed, self-directed|self-directed, managed/);
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

describe("checkReturnDirection", () => {
  interface PerfOver {
    end: number;
    sinceInception: number | null;
    oneYear?: number | null;
    deposits?: number;
    withdrawals?: number;
  }

  /** A PERFORMANCE statement carrying just the fields this check reads. */
  function perf(period: string, over: PerfOver): Statement {
    return statement({
      source: src(period, "PERFORMANCE"),
      returns: {
        currentPeriod: null,
        oneYear: over.oneYear ?? null,
        threeYears: null,
        fiveYears: null,
        tenYears: null,
        sinceInception: over.sinceInception,
      },
      balances: {
        start: 0,
        deposits: over.deposits ?? 0,
        withdrawals: over.withdrawals ?? 0,
        changeInMarketValue: 0,
        end: over.end,
      },
    });
  }

  test("flags a stated return falling while market value rises with no flows", () => {
    const f = checkReturnDirection([
      perf("2026-01", { end: 11902.63, sinceInception: -0.12 }),
      perf("2026-02", { end: 11977.14, sinceInception: -3.05 }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.check).toBe("return-direction");
    expect(f[0]?.severity).toBe("error");
    expect(f[0]?.period).toBe("2026-02");
    expect(f[0]?.expected).toBe(-0.12);
    expect(f[0]?.actual).toBe(-3.05);
    expect(f[0]?.message).toContain("market value rose");
  });

  test("flags a stated return rising while market value falls with no flows", () => {
    const f = checkReturnDirection([
      perf("2026-03", { end: 12531.01, sinceInception: -0.52 }),
      perf("2026-04", { end: 12370.86, sinceInception: 10.31 }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.period).toBe("2026-04");
    expect(f[0]?.message).toContain("market value fell");
  });

  test("passes when the stated return moves the same way as market value", () => {
    const f = checkReturnDirection([
      perf("2026-01", { end: 100, sinceInception: 1 }),
      perf("2026-02", { end: 110, sinceInception: 2 }),
    ]);
    expect(f).toHaveLength(0);
  });

  test("ignores a period carrying a deposit, where a flow explains the move", () => {
    const f = checkReturnDirection([
      perf("2026-01", { end: 100, sinceInception: 5 }),
      perf("2026-02", { end: 160, sinceInception: 2, deposits: 50 }),
    ]);
    expect(f).toHaveLength(0);
  });

  test("ignores a period carrying a withdrawal", () => {
    const f = checkReturnDirection([
      perf("2026-01", { end: 100, sinceInception: 5 }),
      perf("2026-02", { end: 110, sinceInception: 2, withdrawals: 50 }),
    ]);
    expect(f).toHaveLength(0);
  });

  test("ignores a gap in the series, where the missing month's flows are unobserved", () => {
    const f = checkReturnDirection([
      perf("2026-01", { end: 100, sinceInception: 5 }),
      perf("2026-03", { end: 110, sinceInception: 2 }),
    ]);
    expect(f).toHaveLength(0);
  });

  test("ignores an annualized rate, which a printed one-year horizon declares", () => {
    // The real 9710 pair: market value rose 5974.61 -> 6036.31 with no flows
    // while since-inception fell 17.32% -> 17.01%. Correct, not a defect: a
    // month gaining less than the standing run-rate lowers an annualized rate.
    const f = checkReturnDirection([
      perf("2025-10", { end: 5974.61, sinceInception: 17.32, oneYear: 20.93 }),
      perf("2025-11", { end: 6036.31, sinceInception: 17.01, oneYear: 19.1 }),
    ]);
    expect(f).toHaveLength(0);
  });

  test("ignores a pair whose earlier statement has no stated since-inception", () => {
    const f = checkReturnDirection([
      perf("2026-01", { end: 100, sinceInception: null }),
      perf("2026-02", { end: 110, sinceInception: 2 }),
    ]);
    expect(f).toHaveLength(0);
  });

  test("ignores a rate move smaller than the printed precision", () => {
    const f = checkReturnDirection([
      perf("2026-01", { end: 110, sinceInception: 2.0 }),
      perf("2026-02", { end: 100, sinceInception: 2.004 }),
    ]);
    expect(f).toHaveLength(0);
  });

  test("ignores a market value move smaller than a cent, which has no real direction", () => {
    const f = checkReturnDirection([
      perf("2026-01", { end: 100, sinceInception: 5 }),
      perf("2026-02", { end: 100.005, sinceInception: 2 }),
    ]);
    expect(f).toHaveLength(0);
  });

  test("keeps two accounts' series apart", () => {
    const other = perf("2026-02", { end: 11977.14, sinceInception: -3.05 });
    const foreign: Statement = {
      ...other,
      source: { ...other.source, accountNo: "ACCT0002CAD" },
    };
    const f = checkReturnDirection([
      perf("2026-01", { end: 11902.63, sinceInception: -0.12 }),
      foreign,
    ]);
    expect(f).toHaveLength(0);
  });
});
