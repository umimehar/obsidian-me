import { describe, expect, test } from "bun:test";
import type { Statement } from "../types";
import {
  checkArithmetic,
  checkContinuity,
  checkCoverage,
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
      classes: [],
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
        bookCost: 7961.6,
        assetClass: "Canadian Equities and Alternatives",
        pendingValuation: false,
      },
      {
        name: "WS PVT MKT I F",
        symbol: "WSE401",
        quantity: 1241.715,
        segregatedQuantity: 0,
        marketPrice: 10,
        priceCurrency: "CAD",
        marketValue: 12417.15,
        bookCost: 12417.15,
        assetClass: "Canadian Equities and Alternatives",
        pendingValuation: true,
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
    const f = checkContinuity([june(), july(500)]);
    expect(f).toHaveLength(1);
    expect(f[0]?.delta).toBeCloseTo(122.95 - 500, 2);
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
