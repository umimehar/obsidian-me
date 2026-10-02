import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { ActivityRow, Holding, Statement } from "../types";
import type { SaleDetail } from "./income";
import { latestStatementDate, superficialLossWatch } from "./superficialLoss";
import type { AccountSeries } from "./types";

function series(over: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_nr",
    shortId: "0001",
    label: "Non-registered",
    kind: "NonRegistered" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "growth",
    inTotals: true,
    months: [],
    contributionsByYear: {},
    ...over,
  };
}

function src(accountNo: string, period: string) {
  return {
    file: `${accountNo}_${period}.pdf`,
    accountNo,
    period,
    template: "BROKERAGE" as const,
    version: 0,
  };
}

function activityRow(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    date: "2026-01-15",
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

function holding(over: Partial<Holding> = {}): Holding {
  return {
    name: "Test Holding",
    symbol: "TST",
    quantity: 0,
    segregatedQuantity: 0,
    marketPrice: 10,
    priceCurrency: "CAD",
    marketValue: 0,
    marketValueConverted: false,
    bookCost: 0,
    assetClass: "Canadian Equities",
    pendingValuation: false,
    bookCostConverted: false,
    ...over,
  };
}

function statement(over: Partial<Statement> = {}): Statement {
  return {
    source: src("acct_nr", "2026-01"),
    accountType: "Non-Registered Cash Account",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    portfolio: null,
    cash: [],
    holdings: [],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
    ...over,
  };
}

function sale(over: Partial<SaleDetail> = {}): SaleDetail {
  return {
    date: "2026-01-10",
    symbol: "GOLD",
    maskedId: "acct_nr",
    proceeds: 500,
    acb: 958,
    gain: -458,
    costUnknown: false,
    ...over,
  };
}

/** A month's BROKERAGE statement for `acct_nr` carrying a single `GOLD` holding of `quantity`, with no later months reported. */
function monthWithGold(period: string, periodEnd: string, quantity: number): Statement {
  return statement({
    source: src("acct_nr", period),
    periodEnd,
    holdings: quantity > 0 ? [holding({ symbol: "GOLD", quantity })] : [],
    activity: [activityRow({ date: `${period}-10` })],
  });
}

describe("latestStatementDate", () => {
  test("is the latest activity row date across every statement", () => {
    const statements = [
      statement({ activity: [activityRow({ date: "2026-01-05" })] }),
      statement({ activity: [activityRow({ date: "2026-03-20" })] }),
    ];
    expect(latestStatementDate(statements)).toBe("2026-03-20");
  });
});

describe("superficialLossWatch", () => {
  test("flags a personal non-registered loss sale with its 30-day window", () => {
    const statements = [statement({ activity: [activityRow({ date: "2026-01-10" })] })];
    const [candidate] = superficialLossWatch(statements, [series()], [sale()]);
    expect(candidate?.windowStart).toBe("2025-12-11");
    expect(candidate?.windowEnd).toBe("2026-02-09");
  });

  test("a gain is never flagged", () => {
    const statements = [statement({ activity: [activityRow({ date: "2026-01-10" })] })];
    const candidates = superficialLossWatch(
      statements,
      [series()],
      [sale({ gain: 120, acb: 380 })],
    );
    expect(candidates).toHaveLength(0);
  });

  test("a sale not from a personal non-registered or Crypto account is never flagged", () => {
    const corp = series({ maskedId: "acct_corp", kind: "Corporate" as AccountKind });
    const statements = [statement({ activity: [activityRow({ date: "2026-01-10" })] })];
    const candidates = superficialLossWatch(statements, [corp], [sale({ maskedId: "acct_corp" })]);
    expect(candidates).toHaveLength(0);
  });

  test("is pending when the window has not elapsed as of the latest statement, even with no buy yet", () => {
    const statements = [statement({ activity: [activityRow({ date: "2026-01-20" })] })];
    const [candidate] = superficialLossWatch(
      statements,
      [series()],
      [sale({ date: "2026-01-10" })],
    );
    expect(candidate?.status).toBe("pending");
    expect(candidate?.matchedBuy).toBeNull();
  });

  test("a buy of a different symbol inside the window is never matched, and the sale clears once the window elapses", () => {
    const statements = [
      monthWithGold("2026-01", "2026-01-31", 0),
      statement({
        source: src("acct_nr", "2026-02"),
        periodEnd: "2026-02-28",
        activity: [
          activityRow({
            date: "2026-01-20",
            code: "BUY",
            description:
              "SLV - iShares Silver Trust: Bought 5.0000 shares (executed at 2026-01-20)",
          }),
        ],
      }),
      monthWithGold("2026-03", "2026-03-31", 0),
    ];
    const [candidate] = superficialLossWatch(statements, [series()], [sale()]);
    expect(candidate?.matchedBuy).toBeNull();
    expect(candidate?.status).toBe("clear");
  });

  /**
   * The ADP scenario from the coordinator's review: a sale at a loss,
   * matched to a buy BEFORE it in the same account -- but the whole
   * position was sold (closing holdings at the sale's own statement are
   * zero), so that earlier buy was part of what got sold, never a
   * replacement. Condition one fails, and the sale clears even though a
   * same-symbol buy sits inside the window.
   */
  test("a buy before the sale in the same account does not count when the whole position was sold", () => {
    const statements = [
      statement({
        source: src("acct_nr", "2025-10"),
        periodEnd: "2025-10-31",
        activity: [
          activityRow({
            date: "2025-10-24",
            code: "BUY",
            description:
              "ADP - Automatic Data Processing: Bought 10.0000 shares (executed at 2025-10-24)",
          }),
        ],
      }),
      statement({
        source: src("acct_nr", "2025-11"),
        periodEnd: "2025-11-30",
        holdings: [], // the whole ADP position closed out this month
        activity: [
          activityRow({
            date: "2025-11-03",
            code: "SELL",
            description:
              "ADP - Automatic Data Processing: Sold 10.0000 shares (executed at 2025-11-03)",
          }),
        ],
      }),
      statement({
        source: src("acct_nr", "2025-12"),
        periodEnd: "2025-12-31",
        holdings: [],
        activity: [activityRow({ date: "2025-12-15" })],
      }),
    ];
    const adpSale = sale({
      date: "2025-11-03",
      symbol: "ADP",
      acb: 1000,
      proceeds: 600,
      gain: -400,
    });
    const [candidate] = superficialLossWatch(statements, [series()], [adpSale]);
    expect(candidate?.matchedBuy).toBeNull();
    expect(candidate?.status).toBe("clear");
  });

  /**
   * The real-corpus shape: the Oct 24 buy's entire lot (0.0312 shares) is
   * fully consumed by the Nov 3 sale, so it does not count on its own --
   * but a SECOND buy lands the very next day, a fresh acquisition that
   * unambiguously counts regardless of the entangled one. The reported
   * `matchedBuy` must be the unambiguous Nov 4 buy, not the entangled Oct
   * 24 one a contaminated month-end snapshot could otherwise validate.
   */
  test("an unambiguous later buy is reported over an entangled earlier one, even when both would pass", () => {
    const statements = [
      statement({
        source: src("acct_nr", "2025-10"),
        periodEnd: "2025-10-31",
        holdings: [holding({ symbol: "ADP", quantity: 0.0312 })],
        activity: [
          activityRow({
            date: "2025-10-24",
            code: "BUY",
            description:
              "ADP - Automatic Data Processing: Bought 0.0312 shares (executed at 2025-10-24)",
          }),
        ],
      }),
      statement({
        source: src("acct_nr", "2025-11"),
        periodEnd: "2025-11-30",
        // Month-end quantity is nonzero only because of the Nov 4 buy --
        // the Oct 24 lot itself was fully sold on Nov 3.
        holdings: [holding({ symbol: "ADP", quantity: 0.0547 })],
        activity: [
          activityRow({
            date: "2025-11-03",
            code: "SELL",
            description:
              "ADP - Automatic Data Processing: Sold 0.0312 shares (executed at 2025-11-03)",
          }),
          activityRow({
            date: "2025-11-04",
            code: "BUY",
            description:
              "ADP - Automatic Data Processing: Bought 0.0933 shares (executed at 2025-11-04)",
          }),
          activityRow({
            date: "2025-11-17",
            code: "SELL",
            description:
              "ADP - Automatic Data Processing: Sold 0.0386 shares (executed at 2025-11-17)",
          }),
        ],
      }),
      statement({
        source: src("acct_nr", "2025-12"),
        periodEnd: "2025-12-31",
        holdings: [holding({ symbol: "ADP", quantity: 0.0547 })],
        activity: [activityRow({ date: "2025-12-15" })],
      }),
    ];
    const adpSale = sale({
      date: "2025-11-03",
      symbol: "ADP",
      acb: 12.36,
      proceeds: 11.44,
      gain: -0.92,
    });
    const [candidate] = superficialLossWatch(statements, [series()], [adpSale]);
    expect(candidate?.matchedBuy).toEqual({ date: "2025-11-04", maskedId: "acct_nr" });
    expect(candidate?.status).toBe("confirmed");
  });

  test("a buy before the sale in the same account DOES count when some of the position survived the sale", () => {
    const statements = [
      statement({
        source: src("acct_nr", "2025-10"),
        periodEnd: "2025-10-31",
        activity: [
          activityRow({
            date: "2025-10-24",
            code: "BUY",
            description:
              "ADP - Automatic Data Processing: Bought 10.0000 shares (executed at 2025-10-24)",
          }),
        ],
      }),
      statement({
        source: src("acct_nr", "2025-11"),
        periodEnd: "2025-11-30",
        // Only part of the position was sold -- 4 shares remain.
        holdings: [holding({ symbol: "ADP", quantity: 4 })],
        activity: [
          activityRow({
            date: "2025-11-03",
            code: "SELL",
            description:
              "ADP - Automatic Data Processing: Sold 6.0000 shares (executed at 2025-11-03)",
          }),
        ],
      }),
      statement({
        source: src("acct_nr", "2025-12"),
        periodEnd: "2025-12-31",
        holdings: [holding({ symbol: "ADP", quantity: 4 })],
        activity: [activityRow({ date: "2025-12-15" })],
      }),
    ];
    const adpSale = sale({
      date: "2025-11-03",
      symbol: "ADP",
      acb: 600,
      proceeds: 360,
      gain: -240,
    });
    const [candidate] = superficialLossWatch(statements, [series()], [adpSale]);
    expect(candidate?.matchedBuy).toEqual({ date: "2025-10-24", maskedId: "acct_nr" });
    expect(candidate?.status).toBe("confirmed");
  });

  test("confirmed: a replacement buy after the sale, still held at the window's end", () => {
    const statements = [
      statement({
        source: src("acct_nr", "2026-01"),
        periodEnd: "2026-01-31",
        holdings: [],
        activity: [activityRow({ date: "2026-01-10", code: "SELL" })],
      }),
      statement({
        source: src("acct_nr", "2026-01"),
        periodEnd: "2026-01-31",
        activity: [
          activityRow({
            date: "2026-01-20",
            code: "BUY",
            description: "GOLD - SPDR Gold Shares: Bought 5.0000 shares (executed at 2026-01-20)",
          }),
        ],
      }),
      monthWithGold("2026-02", "2026-02-28", 5),
    ];
    const [candidate] = superficialLossWatch(statements, [series()], [sale()]);
    expect(candidate?.matchedBuy).toEqual({ date: "2026-01-20", maskedId: "acct_nr" });
    expect(candidate?.status).toBe("confirmed");
  });

  test("clear: a replacement buy was found, but nothing is held by the window's end", () => {
    const statements = [
      statement({
        source: src("acct_nr", "2026-01"),
        periodEnd: "2026-01-31",
        holdings: [],
        activity: [
          activityRow({ date: "2026-01-10", code: "SELL" }),
          activityRow({
            date: "2026-01-20",
            code: "BUY",
            description: "GOLD - SPDR Gold Shares: Bought 5.0000 shares (executed at 2026-01-20)",
          }),
          activityRow({
            date: "2026-01-25",
            code: "SELL",
            description: "GOLD - SPDR Gold Shares: Sold 5.0000 shares (executed at 2026-01-25)",
          }),
        ],
      }),
      monthWithGold("2026-02", "2026-02-28", 0),
    ];
    const [candidate] = superficialLossWatch(statements, [series()], [sale()]);
    expect(candidate?.matchedBuy).toEqual({ date: "2026-01-20", maskedId: "acct_nr" });
    expect(candidate?.status).toBe("clear");
  });

  test("pending: a replacement buy was found but the window-end statement is not in the corpus yet", () => {
    const statements = [
      statement({
        source: src("acct_nr", "2026-01"),
        periodEnd: "2026-01-31",
        holdings: [holding({ symbol: "GOLD", quantity: 5 })],
        activity: [
          activityRow({ date: "2026-01-10", code: "SELL" }),
          activityRow({
            date: "2026-01-20",
            code: "BUY",
            description: "GOLD - SPDR Gold Shares: Bought 5.0000 shares (executed at 2026-01-20)",
          }),
        ],
      }),
      // A later, unrelated account's statement pushes `asOf` far enough
      // that the window reads as elapsed, but acct_nr itself has not
      // reported a statement reaching the window's end.
      statement({
        source: src("acct_other", "2026-06"),
        periodEnd: "2026-06-30",
        activity: [activityRow({ date: "2026-06-15" })],
      }),
    ];
    const [candidate] = superficialLossWatch(statements, [series()], [sale()]);
    expect(candidate?.matchedBuy).toEqual({ date: "2026-01-20", maskedId: "acct_nr" });
    expect(candidate?.status).toBe("pending");
  });

  test("finds a replacement buy of the identical symbol in a registered account inside the window, checking that account's own holdings at the window's end", () => {
    const tfsa = series({ maskedId: "acct_tfsa", kind: "TFSA" as AccountKind });
    const statements = [
      statement({
        source: src("acct_nr", "2026-01"),
        periodEnd: "2026-01-31",
        holdings: [],
        activity: [activityRow({ date: "2026-01-10", code: "SELL" })],
      }),
      statement({
        source: src("acct_tfsa", "2026-01"),
        periodEnd: "2026-01-31",
        holdings: [holding({ symbol: "GOLD", quantity: 5 })],
        activity: [
          activityRow({
            date: "2026-01-20",
            code: "BUY",
            description: "GOLD - SPDR Gold Shares: Bought 5.0000 shares (executed at 2026-01-20)",
          }),
        ],
      }),
      statement({
        source: src("acct_tfsa", "2026-02"),
        periodEnd: "2026-02-28",
        holdings: [holding({ symbol: "GOLD", quantity: 5 })],
        activity: [activityRow({ date: "2026-02-10" })],
      }),
    ];
    const [candidate] = superficialLossWatch(statements, [series(), tfsa], [sale()]);
    expect(candidate?.matchedBuy).toEqual({ date: "2026-01-20", maskedId: "acct_tfsa" });
    expect(candidate?.status).toBe("confirmed");
  });
});
