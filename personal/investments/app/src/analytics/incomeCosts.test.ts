import { describe, expect, test } from "bun:test";
import { GOLDENS } from "../goldens";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { loadAnalytics } from "../ui/data";
import { sumActivity } from "./activity";
import type { AnalyticsOutput } from "./build";
import {
  chequingInterestByAccount,
  incomeByAccountForYear,
  incomeByMonth,
  incomeByYear,
  withholdingByAccount,
  withholdingRecovery,
} from "./incomeCosts";
import type { AccountSeries } from "./types";

function account(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "Account 0001",
    kind: "NonRegistered" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned" as Purpose,
    inTotals: true,
    months: [],
    contributionsByYear: {},
    ...overrides,
  };
}

function analyticsFixture(overrides: Partial<AnalyticsOutput> = {}): AnalyticsOutput {
  return {
    meta: { generated: "", datastoreGenerated: "", accountCount: 0 },
    series: [],
    rooms: {},
    income: {},
    corporateIncome: {},
    returns: [],
    rollups: { registration: [], account: [], purpose: [] },
    activity: {},
    statedFees: {},
    holdings: {
      period: "",
      total: 0,
      holdings: [],
      groups: [],
      currency: { CAD: 0, USD: 0 },
      assetClasses: [],
      behind: [],
    },
    personalHoldings: {
      period: "",
      total: 0,
      holdings: [],
      groups: [],
      currency: { CAD: 0, USD: 0 },
      assetClasses: [],
      behind: [],
    },
    corporateHoldings: {
      period: "",
      total: 0,
      holdings: [],
      groups: [],
      currency: { CAD: 0, USD: 0 },
      assetClasses: [],
      behind: [],
    },
    ...overrides,
  };
}

const ZERO = {
  dividends: 0,
  interest: 0,
  lendingIncome: 0,
  withholdingTax: 0,
  fees: 0,
  fxConversions: 0,
  fxConversionAmount: 0,
};

describe("withholdingRecovery", () => {
  test.each([
    ["NonRegistered", "credit"],
    ["Corporate", "credit"],
    ["RRSP", "exempt for US listed funds"],
    ["SpousalRRSP", "exempt for US listed funds"],
    ["TFSA", "lost"],
    ["FHSA", "lost"],
    ["RESP", "lost"],
    ["Crypto", "lost"],
    ["Chequing", "lost"],
  ] as const)("%s recovers as %s", (kind, expected) => {
    expect(withholdingRecovery(kind as AccountKind)).toBe(expected);
  });
});

describe("incomeByYear, over a fixture", () => {
  test("sums two accounts' months into one year total, inTotals only", () => {
    const counted = account({ maskedId: "acct_counted", inTotals: true });
    const excluded = account({ maskedId: "acct_excluded", inTotals: false, kind: "Chequing" });
    const analytics = analyticsFixture({
      series: [counted, excluded],
      activity: {
        "2026-01": {
          acct_counted: { ...ZERO, dividends: 10 },
          acct_excluded: { ...ZERO, interest: 500 },
        },
        "2026-02": {
          acct_counted: { ...ZERO, dividends: 5 },
        },
      },
    });

    const years = incomeByYear(analytics);
    expect(years).toEqual([
      {
        year: 2026,
        totals: { ...ZERO, dividends: 15 },
        byAccount: { acct_counted: { ...ZERO, dividends: 15 } },
      },
    ]);
  });

  test("years come out oldest first", () => {
    const a = account();
    const analytics = analyticsFixture({
      series: [a],
      activity: {
        "2026-01": { acct_0001: { ...ZERO, dividends: 1 } },
        "2024-01": { acct_0001: { ...ZERO, dividends: 2 } },
        "2025-01": { acct_0001: { ...ZERO, dividends: 3 } },
      },
    });
    expect(incomeByYear(analytics).map((y) => y.year)).toEqual([2024, 2025, 2026]);
  });

  test("over the real corpus, each year's totals equal sumActivity over that year's months", () => {
    const analytics = loadAnalytics();
    for (const year of incomeByYear(analytics)) {
      const months = incomeByMonth(analytics, year.year);
      const expected = sumActivity(months.map((m) => m.totals));
      for (const key of Object.keys(ZERO) as (keyof typeof ZERO)[]) {
        expect(year.totals[key]).toBeCloseTo(expected[key], 6);
      }
    }
  });

  test("2025 and 2026 year totals match the goldens", () => {
    const analytics = loadAnalytics();
    const byYear = new Map(incomeByYear(analytics).map((y) => [y.year, y.totals]));
    expect(byYear.get(2025)).toEqual(GOLDENS.incomeCosts.byYear["2025"]);
    expect(byYear.get(2026)).toEqual(GOLDENS.incomeCosts.byYear["2026"]);
  });
});

describe("incomeByMonth", () => {
  test("restricts to the requested year and sorts oldest first", () => {
    const a = account();
    const analytics = analyticsFixture({
      series: [a],
      activity: {
        "2026-02": { acct_0001: { ...ZERO, dividends: 2 } },
        "2026-01": { acct_0001: { ...ZERO, dividends: 1 } },
        "2025-12": { acct_0001: { ...ZERO, dividends: 9 } },
      },
    });
    const months = incomeByMonth(analytics, 2026);
    expect(months.map((m) => m.period)).toEqual(["2026-01", "2026-02"]);
    expect(months[0]?.totals.dividends).toBe(1);
  });

  test("a year with no activity returns an empty list", () => {
    const analytics = analyticsFixture({ series: [account()] });
    expect(incomeByMonth(analytics, 2026)).toEqual([]);
  });

  test("a period no inTotals account reported that month is left out, not drawn as a zero", () => {
    // Only a chequing account (inTotals: false) reported in 2026-02, so the
    // month must be absent from the chart's own points -- see DividendsChart's
    // absence-versus-zero rule.
    const counted = account({ maskedId: "acct_counted", inTotals: true });
    const chequing = account({ maskedId: "acct_chequing", inTotals: false, kind: "Chequing" });
    const analytics = analyticsFixture({
      series: [counted, chequing],
      activity: {
        "2026-01": { acct_counted: { ...ZERO, dividends: 5 } },
        "2026-02": { acct_chequing: { ...ZERO, interest: 12 } },
        "2026-03": { acct_counted: { ...ZERO, dividends: 3 } },
      },
    });
    const months = incomeByMonth(analytics, 2026);
    expect(months.map((m) => m.period)).toEqual(["2026-01", "2026-03"]);
  });

  test("a missing month in the middle of the year is absent, not a stated zero", () => {
    const a = account();
    const analytics = analyticsFixture({
      series: [a],
      activity: {
        "2026-01": { acct_0001: { ...ZERO, dividends: 5 } },
        // No 2026-02 entry at all: no statement covers it.
        "2026-03": { acct_0001: { ...ZERO, dividends: 3 } },
      },
    });
    const months = incomeByMonth(analytics, 2026);
    expect(months.map((m) => m.period)).toEqual(["2026-01", "2026-03"]);
    expect(months.some((m) => m.period === "2026-02")).toBe(false);
  });
});

describe("incomeByAccountForYear", () => {
  test("sorted by dividends + interest + lending, largest first", () => {
    const small = account({ maskedId: "acct_small", label: "Small" });
    const big = account({ maskedId: "acct_big", label: "Big" });
    const analytics = analyticsFixture({
      series: [small, big],
      activity: {
        "2026-01": {
          acct_small: { ...ZERO, dividends: 1 },
          acct_big: { ...ZERO, dividends: 5, interest: 5 },
        },
      },
    });
    expect(incomeByAccountForYear(analytics, 2026).map((a) => a.label)).toEqual(["Big", "Small"]);
  });

  test("withholding and fees do not count toward the sort, only income does", () => {
    const costly = account({ maskedId: "acct_costly", label: "Costly" });
    const earning = account({ maskedId: "acct_earning", label: "Earning" });
    const analytics = analyticsFixture({
      series: [costly, earning],
      activity: {
        "2026-01": {
          acct_costly: { ...ZERO, withholdingTax: 100, fees: 100 },
          acct_earning: { ...ZERO, dividends: 1 },
        },
      },
    });
    expect(incomeByAccountForYear(analytics, 2026).map((a) => a.label)).toEqual([
      "Earning",
      "Costly",
    ]);
  });

  test("an account with no activity that year is left out entirely", () => {
    const a = account();
    const analytics = analyticsFixture({ series: [a], activity: {} });
    expect(incomeByAccountForYear(analytics, 2026)).toEqual([]);
  });

  test("an account not in totals is left out", () => {
    const chequing = account({ kind: "Chequing", inTotals: false });
    const analytics = analyticsFixture({
      series: [chequing],
      activity: { "2026-01": { acct_0001: { ...ZERO, interest: 5 } } },
    });
    expect(incomeByAccountForYear(analytics, 2026)).toEqual([]);
  });
});

describe("chequingInterestByAccount", () => {
  test("only chequing accounts with a nonzero interest figure appear", () => {
    const chequing = account({ maskedId: "acct_chequing", kind: "Chequing", inTotals: false });
    const nonRegistered = account({ maskedId: "acct_nonreg" });
    const analytics = analyticsFixture({
      series: [chequing, nonRegistered],
      activity: {
        "2026-01": {
          acct_chequing: { ...ZERO, interest: 57.38 },
          acct_nonreg: { ...ZERO, interest: 5 },
        },
      },
    });
    const rows = chequingInterestByAccount(analytics, 2026);
    expect(rows).toEqual([{ maskedId: "acct_chequing", label: "Account 0001", interest: 57.38 }]);
  });

  test("a chequing account with no interest that year is left out", () => {
    const chequing = account({ kind: "Chequing", inTotals: false });
    const analytics = analyticsFixture({ series: [chequing], activity: {} });
    expect(chequingInterestByAccount(analytics, 2026)).toEqual([]);
  });

  test("2025 and 2026 totals match the goldens", () => {
    const analytics = loadAnalytics();
    const total2025 = chequingInterestByAccount(analytics, 2025).reduce(
      (sum, a) => sum + a.interest,
      0,
    );
    const total2026 = chequingInterestByAccount(analytics, 2026).reduce(
      (sum, a) => sum + a.interest,
      0,
    );
    expect(total2025).toBeCloseTo(GOLDENS.incomeCosts.chequingInterestByYear["2025"], 6);
    expect(total2026).toBeCloseTo(GOLDENS.incomeCosts.chequingInterestByYear["2026"], 6);
  });
});

describe("withholdingByAccount", () => {
  test("only accounts with a nonzero withholding figure appear", () => {
    const withheld = account({ maskedId: "acct_withheld", kind: "NonRegistered" });
    const clean = account({ maskedId: "acct_clean", kind: "TFSA" });
    const analytics = analyticsFixture({
      series: [withheld, clean],
      activity: {
        "2026-01": {
          acct_withheld: { ...ZERO, withholdingTax: 12.34 },
          acct_clean: { ...ZERO, withholdingTax: 0 },
        },
      },
    });
    const rows = withholdingByAccount(analytics, 2026);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.maskedId).toBe("acct_withheld");
    expect(rows[0]?.withholdingTax).toBe(12.34);
    expect(rows[0]?.recovery).toBe("credit");
  });

  test("the spousal RRSP shows on its own line even though it is not inTotals", () => {
    const spousal = account({
      maskedId: "acct_spousal",
      kind: "SpousalRRSP",
      inTotals: false,
    });
    const analytics = analyticsFixture({
      series: [spousal],
      activity: { "2026-01": { acct_spousal: { ...ZERO, withholdingTax: 3.5 } } },
    });
    const rows = withholdingByAccount(analytics, 2026);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recovery).toBe("exempt for US listed funds");
  });

  test("a non-spousal account excluded from totals never appears", () => {
    const chequing = account({ maskedId: "acct_chequing", kind: "Chequing", inTotals: false });
    const analytics = analyticsFixture({
      series: [chequing],
      activity: { "2026-01": { acct_chequing: { ...ZERO, withholdingTax: 1 } } },
    });
    expect(withholdingByAccount(analytics, 2026)).toEqual([]);
  });

  test("rows sort by withholding amount, largest first", () => {
    const small = account({ maskedId: "acct_small" });
    const big = account({ maskedId: "acct_big" });
    const analytics = analyticsFixture({
      series: [small, big],
      activity: {
        "2026-01": {
          acct_small: { ...ZERO, withholdingTax: 1 },
          acct_big: { ...ZERO, withholdingTax: 100 },
        },
      },
    });
    expect(withholdingByAccount(analytics, 2026).map((r) => r.maskedId)).toEqual([
      "acct_big",
      "acct_small",
    ]);
  });
});
