import { describe, expect, test } from "bun:test";
import { GOLDENS } from "../goldens";
import { netFlowsByPeriod } from "../projection/fittedRate";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { loadAnalytics } from "../ui/data";
import { yearChange } from "../ui/scope";
import { monthReview, reviewPeriods } from "./monthReview";
import type { AccountSeries, MonthPoint } from "./types";

/**
 * An account is "returning after a gap" for `period` when its move has no
 * `start` (nothing comparable precedes it) yet it is not in `opened` (its
 * first-ever statement is older than `period`). Shared by every test below
 * that needs to skip a period the comparable-flows invariant does not cover.
 */
function hasReturningAccount(review: ReturnType<typeof monthReview>): boolean {
  return review.moves.some((m) => m.start === null && !review.opened.includes(m.label));
}

function month(overrides: Partial<MonthPoint> & { period: string }): MonthPoint {
  return {
    marketValue: null,
    bookCost: null,
    cashBalance: null,
    deposits: 0,
    withdrawals: 0,
    contributions: null,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: null,
    grants: 0,
    ...overrides,
  };
}

function account(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "TFSA 0001",
    kind: "TFSA" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned" as Purpose,
    inTotals: true,
    months: [],
    contributionsByYear: {},
    ...overrides,
  };
}

const REAL = loadAnalytics();

describe("monthReview, over the real corpus", () => {
  test("the latest period's end equals the portfolio golden, to the cent", () => {
    const [latest] = reviewPeriods(REAL);
    if (latest === undefined) throw new Error("expected at least one reviewable period");
    const review = monthReview(REAL, latest);
    expect(review.end).toBeCloseTo(GOLDENS.portfolio.total, 2);
  });

  test("netDeposits and growth match the month golden, computed by this same function", () => {
    const [latest] = reviewPeriods(REAL);
    if (latest === undefined) throw new Error("expected at least one reviewable period");
    const review = monthReview(REAL, latest);
    expect(review.period).toBe(GOLDENS.month.period);
    expect(review.netDeposits).toBeCloseTo(GOLDENS.month.netDeposits, 2);
    expect(review.growth).not.toBeNull();
    expect(review.growth ?? 0).toBeCloseTo(GOLDENS.month.growth, 2);
  });

  test("Corporate (self) (8297) opened in 2026-08", () => {
    const review = monthReview(REAL, "2026-08");
    expect(review.opened).toContain("Corporate (self)");
  });

  test("for every period with nothing missing and nothing returning, netDeposits matches netFlowsByPeriod and the equation balances", () => {
    const flows = netFlowsByPeriod(REAL.series);
    let checked = 0;
    for (const period of reviewPeriods(REAL)) {
      const review = monthReview(REAL, period);
      if (review.missing.length > 0 || hasReturningAccount(review)) continue;
      checked += 1;
      expect(review.netDeposits).toBeCloseTo(flows.get(period) ?? 0, 2);
      const reconstructed = (review.start ?? 0) + review.netDeposits + (review.growth ?? 0);
      expect(reconstructed).toBeCloseTo(review.end, 2);
    }
    // Non-vacuous: the real corpus has to actually exercise the qualifying path.
    expect(checked).toBeGreaterThan(0);
  });

  test("summed monthly netDeposits over 2026 matches yearChange's netDeposits, over the qualifying months", () => {
    const year = 2026;
    const periods = reviewPeriods(REAL).filter((p) => p.startsWith(`${year}-`));
    const qualifying = periods.filter((period) => {
      const review = monthReview(REAL, period);
      return review.missing.length === 0 && !hasReturningAccount(review);
    });
    const summedNetDeposits = qualifying.reduce(
      (sum, period) => sum + monthReview(REAL, period).netDeposits,
      0,
    );
    const change = yearChange(REAL.series, year);
    if (change === null) throw new Error(`expected a ${year} change`);

    if (qualifying.length === periods.length) {
      // Every month in the year is individually explainable, so the monthly
      // sum and the year's own net flows are the same figure read two ways.
      expect(summedNetDeposits).toBeCloseTo(change.netDeposits, 2);
    } else {
      // A disqualified month exists in the corpus today; the invariant this
      // asserts is only claimed over the months that qualify (see the test
      // above), never silently widened to the whole year.
      expect(qualifying.length).toBeGreaterThan(0);
    }
  });
});

describe("monthReview, over a fixture", () => {
  test("an account with no statement this period is missing, not a zero mover", () => {
    const present = account({
      maskedId: "acct_present",
      label: "Present",
      months: [
        month({ period: "2026-06", marketValue: 1000, bookCost: 900 }),
        month({ period: "2026-07", marketValue: 1100, bookCost: 900, deposits: 50 }),
      ],
    });
    const behind = account({
      maskedId: "acct_behind",
      label: "Behind",
      months: [month({ period: "2026-06", marketValue: 500, bookCost: 500 })],
    });
    const analytics = {
      meta: { generated: "", datastoreGenerated: "", accountCount: 2 },
      series: [present, behind],
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
    };

    const review = monthReview(analytics, "2026-07");
    expect(review.missing).toEqual(["Behind"]);
    expect(review.moves.map((m) => m.label)).toEqual(["Present"]);
    // Behind's own $500 balance must never leak into growth as a swing:
    // netDeposits/growth come only from Present, the sole comparable account.
    expect(review.netDeposits).toBe(50);
    expect(review.growth).toBe(50);
    expect(review.missingValue).toBe(500);
  });

  test("a funded newly opened account counts as comparable with a real $0 start", () => {
    const opened = account({
      maskedId: "acct_opened",
      label: "Opened",
      months: [month({ period: "2026-07", marketValue: 200, bookCost: 200, deposits: 200 })],
    });
    const steady = account({
      maskedId: "acct_steady",
      label: "Steady",
      months: [
        month({ period: "2026-06", marketValue: 1000, bookCost: 1000 }),
        month({ period: "2026-07", marketValue: 1020, bookCost: 1000, deposits: 10 }),
      ],
    });
    const analytics = {
      meta: { generated: "", datastoreGenerated: "", accountCount: 2 },
      series: [opened, steady],
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
    };

    const review = monthReview(analytics, "2026-07");
    // Opened's $200 deposit must count as a deposit, not vanish: 200 (Opened)
    // plus 10 (Steady).
    expect(review.netDeposits).toBe(210);
    // Opened's own growth is 200 - 0 - 200 = 0; only Steady's $10 is real growth.
    expect(review.growth).toBe(10);
    expect(hasReturningAccount(review)).toBe(false);
    expect(review.missing).toEqual([]);
    // Nothing missing and nothing returning: the full change decomposes
    // exactly into deposits plus growth, with no unexplained remainder.
    const change = review.end - (review.start ?? 0);
    expect(change).toBe(review.netDeposits + (review.growth ?? 0));
  });

  test("an account that skipped a month and then reported again contributes no growth", () => {
    const returning = account({
      maskedId: "acct_returning",
      label: "Returning",
      months: [
        month({ period: "2026-05", marketValue: 100, bookCost: 100 }),
        // No 2026-06 statement at all: a genuine gap, not a missing-this-period case.
        month({ period: "2026-07", marketValue: 500, bookCost: 100 }),
      ],
    });
    const steady = account({
      maskedId: "acct_steady",
      label: "Steady",
      months: [
        month({ period: "2026-06", marketValue: 1000, bookCost: 1000 }),
        month({ period: "2026-07", marketValue: 1020, bookCost: 1000, deposits: 10 }),
      ],
    });
    const analytics = {
      meta: { generated: "", datastoreGenerated: "", accountCount: 2 },
      series: [returning, steady],
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
    };

    const review = monthReview(analytics, "2026-07");
    // Returning's 100 -> 500 jump must not show up as $390 of growth: it had
    // no priced statement at 2026-06, the immediately preceding month.
    expect(review.netDeposits).toBe(10);
    expect(review.growth).toBe(10);
    const returningMove = review.moves.find((m) => m.label === "Returning");
    expect(returningMove?.start).toBeNull();
    expect(returningMove?.growth).toBeNull();
    expect(returningMove?.change).toBeNull();
  });

  test("moves are sorted by |change| descending, an unopened-before account's null change last", () => {
    const small = account({
      maskedId: "acct_small",
      label: "Small",
      months: [
        month({ period: "2026-06", marketValue: 100, bookCost: 100 }),
        month({ period: "2026-07", marketValue: 105, bookCost: 100 }),
      ],
    });
    const big = account({
      maskedId: "acct_big",
      label: "Big",
      months: [
        month({ period: "2026-06", marketValue: 1000, bookCost: 1000 }),
        month({ period: "2026-07", marketValue: 1500, bookCost: 1000 }),
      ],
    });
    const opened = account({
      maskedId: "acct_opened",
      label: "Opened",
      months: [month({ period: "2026-07", marketValue: 200, bookCost: 200 })],
    });
    const analytics = {
      meta: { generated: "", datastoreGenerated: "", accountCount: 3 },
      series: [small, big, opened],
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
    };

    const review = monthReview(analytics, "2026-07");
    expect(review.moves.map((m) => m.label)).toEqual(["Big", "Small", "Opened"]);
    expect(review.opened).toEqual(["Opened"]);
  });

  test("reviewPeriods lists the corpus's portfolio periods, newest first", () => {
    const solo = account({
      months: [
        month({ period: "2026-06", marketValue: 100, bookCost: 100 }),
        month({ period: "2026-07", marketValue: 105, bookCost: 100 }),
      ],
    });
    const analytics = {
      meta: { generated: "", datastoreGenerated: "", accountCount: 1 },
      series: [solo],
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
    };
    expect(reviewPeriods(analytics)).toEqual(["2026-07", "2026-06"]);
  });
});
