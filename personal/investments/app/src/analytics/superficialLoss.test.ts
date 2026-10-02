import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { ActivityRow, Statement } from "../types";
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

  test("is still open when the window has not elapsed as of the latest statement", () => {
    const statements = [statement({ activity: [activityRow({ date: "2026-01-20" })] })];
    const [candidate] = superficialLossWatch(
      statements,
      [series()],
      [sale({ date: "2026-01-10" })],
    );
    expect(candidate?.stillOpen).toBe(true);
    expect(candidate?.matchedBuy).toBeNull();
  });

  test("finds a replacement buy of the identical symbol in a registered account inside the window", () => {
    const tfsa = series({ maskedId: "acct_tfsa", kind: "TFSA" as AccountKind });
    const statements = [
      statement({
        source: src("acct_nr", "2026-01"),
        activity: [activityRow({ date: "2026-01-10", code: "SELL" })],
      }),
      statement({
        source: src("acct_tfsa", "2026-01"),
        activity: [
          activityRow({
            date: "2026-01-20",
            code: "BUY",
            description: "GOLD - SPDR Gold Shares: Bought 5.0000 shares (executed at 2026-01-20)",
          }),
        ],
      }),
    ];
    const [candidate] = superficialLossWatch(statements, [series(), tfsa], [sale()]);
    expect(candidate?.matchedBuy).toEqual({ date: "2026-01-20", maskedId: "acct_tfsa" });
  });

  test("a buy of a different symbol inside the window is never matched", () => {
    const statements = [
      statement({
        activity: [
          activityRow({ date: "2026-01-10", code: "SELL" }),
          activityRow({
            date: "2026-01-20",
            code: "BUY",
            description:
              "SLV - iShares Silver Trust: Bought 5.0000 shares (executed at 2026-01-20)",
          }),
        ],
      }),
    ];
    const [candidate] = superficialLossWatch(statements, [series()], [sale()]);
    expect(candidate?.matchedBuy).toBeNull();
  });
});
