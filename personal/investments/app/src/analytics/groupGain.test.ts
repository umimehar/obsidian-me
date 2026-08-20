import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { loadAnalytics } from "../ui/data";
import { latestGroupGain } from "./groupGain";
import { buildPortfolioSeries, seriesForAccounts } from "./portfolioSeries";
import type { AccountSeries, MonthPoint } from "./types";

function month(
  period: string,
  marketValue: number | null,
  bookCost: number | null = marketValue,
): MonthPoint {
  return {
    period,
    marketValue,
    bookCost,
    cashBalance: null,
    deposits: 0,
    withdrawals: 0,
    contributions: null,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: null,
    grants: 0,
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
    months: [month("2026-06", 1000)],
    contributionsByYear: {},
    ...overrides,
  };
}

describe("latestGroupGain", () => {
  test("reads market value, book cost and gain from the same last point", () => {
    const a = account({ maskedId: "a", months: [month("2026-01", 1000, 900)] });
    const b = account({ maskedId: "b", months: [month("2026-01", 500, 480)] });
    const result = latestGroupGain([a, b]);
    expect(result).toEqual({ marketValue: 1500, bookCost: 1380, gain: 120 });
  });

  test("takes the most recent period when accounts span several", () => {
    const a = account({
      maskedId: "a",
      months: [month("2026-01", 100, 100), month("2026-02", 200, 150)],
    });
    const result = latestGroupGain([a]);
    expect(result).toEqual({ marketValue: 200, bookCost: 150, gain: 50 });
  });

  test("is negative for a group whose book cost has overtaken market value", () => {
    const a = account({ maskedId: "a", months: [month("2026-01", 900, 1000)] });
    const result = latestGroupGain([a]);
    expect(result?.gain).toBe(-100);
  });

  test("is null for a group of only inTotals: false accounts", () => {
    const cash = account({
      maskedId: "cash",
      kind: "Chequing",
      inTotals: false,
      months: [month("2026-01", 5000, 5000)],
    });
    expect(latestGroupGain([cash])).toBeNull();
  });

  test("is null for an empty group", () => {
    expect(latestGroupGain([])).toBeNull();
  });

  test("never mixes bases: matches buildPortfolioSeries's own last point exactly", () => {
    // The trap this project names explicitly: group.total sums each
    // account's own latest stated market value, while a series' last point
    // sums only accounts reporting in that specific period. This test pins
    // latestGroupGain to the series basis, not to a rollup's total, by
    // checking it against buildPortfolioSeries directly rather than a
    // literal -- if the implementation ever read a different source for
    // marketValue than for bookCost, this equality would catch it.
    const a = account({
      maskedId: "a",
      months: [month("2026-01", 1000, 900), month("2026-02", 1100, 950)],
    });
    const b = account({ maskedId: "b", months: [month("2026-01", 500, 480)] });
    const points = buildPortfolioSeries([a, b]);
    const last = points[points.length - 1];
    if (last === undefined) throw new Error("expected a portfolio point");
    const result = latestGroupGain([a, b]);
    expect(result).toEqual({
      marketValue: last.marketValue,
      bookCost: last.bookCost,
      gain: last.marketValue - last.bookCost,
    });
  });
});

describe("latestGroupGain against the real committed analytics.json", () => {
  const analytics = loadAnalytics();

  function groupGainFor(maskedIds: readonly string[]) {
    return latestGroupGain(seriesForAccounts(analytics.series, maskedIds));
  }

  // Real corpus, registration lens (task instructions pinned these against
  // the committed artifact; reproduced here rather than trusted blind).
  test("TFSA: market $48,155.28, book $43,369.06, gain +$4,786.22", () => {
    const tfsa = analytics.rollups.registration.find((g) => g.key === "TFSA");
    if (tfsa === undefined) throw new Error("expected a TFSA registration group");
    const result = groupGainFor(tfsa.accounts.map((a) => a.maskedId));
    expect(result?.marketValue).toBeCloseTo(48155.28, 2);
    expect(result?.bookCost).toBeCloseTo(43369.06, 2);
    expect(result?.gain).toBeCloseTo(4786.22, 2);
  });

  test("Non-registered: market $60,798.32, book $55,759.88, gain +$5,038.44", () => {
    const nonReg = analytics.rollups.registration.find((g) => g.key === "NonRegistered");
    if (nonReg === undefined) throw new Error("expected a Non-registered registration group");
    const result = groupGainFor(nonReg.accounts.map((a) => a.maskedId));
    expect(result?.marketValue).toBeCloseTo(60798.32, 2);
    expect(result?.bookCost).toBeCloseTo(55759.88, 2);
    expect(result?.gain).toBeCloseTo(5038.44, 2);
  });

  test("Growth (purpose lens): market $108,953.60, book $99,128.94, gain +$9,824.66", () => {
    const growth = analytics.rollups.purpose.find((g) => g.key === "growth");
    if (growth === undefined) throw new Error("expected a Growth purpose group");
    const result = groupGainFor(growth.accounts.map((a) => a.maskedId));
    expect(result?.marketValue).toBeCloseTo(108953.6, 2);
    expect(result?.bookCost).toBeCloseTo(99128.94, 2);
    expect(result?.gain).toBeCloseTo(9824.66, 2);
  });

  test("Cash (registration lens) has no gain to state", () => {
    const cash = analytics.rollups.registration.find((g) => g.key === "Cash");
    if (cash === undefined) throw new Error("expected a Cash registration group");
    expect(groupGainFor(cash.accounts.map((a) => a.maskedId))).toBeNull();
  });

  test("Spending (purpose lens) has no gain to state", () => {
    const spending = analytics.rollups.purpose.find((g) => g.key === "spending");
    if (spending === undefined) throw new Error("expected a Spending purpose group");
    expect(groupGainFor(spending.accounts.map((a) => a.maskedId))).toBeNull();
  });

  test("the registration lens's per-group gains sum to the portfolio-level gap", () => {
    // Free cross-check: 18,064.59 = 241,739.67 (portfolio market) minus
    // 223,675.08 (portfolio book cost). If any one group's gain were taken
    // from a mixed basis, this sum would drift from the portfolio gap even
    // though each group's own figure might still look plausible in
    // isolation.
    const portfolioPoints = buildPortfolioSeries(analytics.series);
    const portfolioLast = portfolioPoints[portfolioPoints.length - 1];
    if (portfolioLast === undefined) throw new Error("expected a portfolio-level point");
    const portfolioGap = portfolioLast.marketValue - portfolioLast.bookCost;

    let summed = 0;
    for (const group of analytics.rollups.registration) {
      const result = groupGainFor(group.accounts.map((a) => a.maskedId));
      if (result !== null) summed += result.gain;
    }
    expect(summed).toBeCloseTo(portfolioGap, 2);
    expect(summed).toBeCloseTo(18064.59, 2);
  });

  test("a real per-account loss exists in the corpus (account lens), not only fixture-fabricated", () => {
    // RRSP (managed): market $20,498.54 against book $20,501.70, a real
    // -$3.16. The corresponding group card verifies this renders and passes
    // contrast; this pins the number itself so that test cannot be pinned
    // to a wrong figure.
    const managed = analytics.rollups.account.find((g) => g.label === "RRSP (managed)");
    if (managed === undefined) throw new Error("expected an RRSP (managed) account group");
    const result = groupGainFor(managed.accounts.map((a) => a.maskedId));
    expect(result?.gain).toBeCloseTo(-3.16, 2);
  });
});
