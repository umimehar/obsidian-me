import { describe, expect, test } from "bun:test";
import { GOLDENS } from "../goldens";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { loadAnalytics } from "../ui/data";
import { monthReview, reviewPeriods } from "./monthReview";
import type { AccountSeries, MonthPoint } from "./types";

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

  test("start plus netDeposits plus growth equals end, to the cent", () => {
    const [latest] = reviewPeriods(REAL);
    if (latest === undefined) throw new Error("expected at least one reviewable period");
    const review = monthReview(REAL, latest);
    const reconstructed = (review.start ?? 0) + review.netDeposits + (review.growth ?? 0);
    expect(reconstructed).toBeCloseTo(review.end, 2);
  });

  test("Corporate (self) (8297) opened in 2026-08", () => {
    const review = monthReview(REAL, "2026-08");
    expect(review.opened).toContain("Corporate (self)");
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
      returns: [],
      rollups: { registration: [], account: [], purpose: [] },
      activity: {},
    };

    const review = monthReview(analytics, "2026-07");
    expect(review.missing).toEqual(["Behind"]);
    expect(review.moves.map((m) => m.label)).toEqual(["Present"]);
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
      returns: [],
      rollups: { registration: [], account: [], purpose: [] },
      activity: {},
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
      returns: [],
      rollups: { registration: [], account: [], purpose: [] },
      activity: {},
    };
    expect(reviewPeriods(analytics)).toEqual(["2026-07", "2026-06"]);
  });
});
