import { describe, expect, test } from "bun:test";
import { GOLDENS, groupGolden } from "../goldens";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { grandTotal, loadAnalytics } from "../ui/data";
import { latestGroupGain } from "./groupGain";
import { buildPortfolioSeries, seriesForAccounts } from "./portfolioSeries";
import type { Lens } from "./rollup";
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

  // Real corpus, against the committed goldens. Each of the three is a
  // different lens and a different arithmetic path into the same figures.
  function expectGroupMatchesGolden(lens: Lens, key: string, label: string) {
    const group = analytics.rollups[lens].find((g) => g.key === key);
    if (group === undefined) throw new Error(`expected a ${key} ${lens} group`);
    const result = groupGainFor(group.accounts.map((a) => a.maskedId));
    const golden = groupGolden(lens, label);
    expect(result?.marketValue).toBeCloseTo(golden.market, 2);
    expect(result?.bookCost).toBeCloseTo(golden.book, 2);
    expect(result?.gain).toBeCloseTo(golden.gain, 2);
    // The gain is the gap, not an independently stored third figure.
    expect(result?.gain).toBeCloseTo((result?.marketValue ?? 0) - (result?.bookCost ?? 0), 6);
  }

  test("TFSA (registration lens) matches its golden market, book and gain", () => {
    expectGroupMatchesGolden("registration", "TFSA", "TFSA");
  });

  test("Non-registered (registration lens) matches its golden market, book and gain", () => {
    expectGroupMatchesGolden("registration", "NonRegistered", "Non-registered");
  });

  test("Growth (purpose lens) matches its golden market, book and gain", () => {
    expectGroupMatchesGolden("purpose", "growth", "Growth");
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
    // Three legs of the same cross-check, not three separate assertions of
    // convenience: (1) the portfolio-level figure straight from
    // `latestGroupGain(analytics.series)` -- the call `App.tsx`'s headline
    // actually makes; (2) the same figure re-derived from
    // `buildPortfolioSeries` directly, one layer lower; (3) the sum of
    // every registration-lens group's own gain. If any one group's gain
    // were taken from a mixed basis, leg 3 would drift from legs 1 and 2
    // even though that one group's own figure might still look plausible
    // in isolation.
    const portfolioFigures = latestGroupGain(analytics.series);
    if (portfolioFigures === null) throw new Error("expected a portfolio-level gain");

    const portfolioPoints = buildPortfolioSeries(analytics.series);
    const portfolioLast = portfolioPoints[portfolioPoints.length - 1];
    if (portfolioLast === undefined) throw new Error("expected a portfolio-level point");
    const portfolioGap = portfolioLast.marketValue - portfolioLast.bookCost;
    expect(portfolioFigures.gain).toBeCloseTo(portfolioGap, 2);

    let summed = 0;
    for (const group of analytics.rollups.registration) {
      const result = groupGainFor(group.accounts.map((a) => a.maskedId));
      if (result !== null) summed += result.gain;
    }
    expect(summed).toBeCloseTo(portfolioFigures.gain, 2);
    expect(summed).toBeCloseTo(GOLDENS.portfolio.gain, 2);

    // Today's data has zero basis drift (every counted account's latest
    // statement is the same period), so the series-basis market value the headline
    // now renders from and `grandTotal` (each account's own latest stated
    // value, a different basis -- see `latestGroupGain`'s docstring) still
    // agree to the cent. This is the proof that switching App.tsx's
    // headline total onto `latestGroupGain` changed nothing observable
    // today; it is not a substitute for sourcing the total, book value and
    // gain from one call, which is what actually removes the risk of them
    // silently diverging once an account's statement lags.
    expect(portfolioFigures.marketValue).toBeCloseTo(grandTotal(analytics), 2);
    expect(portfolioFigures.marketValue).toBeCloseTo(GOLDENS.portfolio.total, 2);
    expect(portfolioFigures.bookCost).toBeCloseTo(GOLDENS.portfolio.bookCost, 2);
  });

  test("every account-lens loss the corpus holds is exactly the set the goldens record", () => {
    // Whether the corpus holds a loss AT ALL is a property of this month's
    // market, not of the code: Private Market Fund at -$3.16 and Crypto at
    // -$45.04 were the only two at 2026-06 and both turned positive at
    // 2026-07. Pinning either figure made this test unsatisfiable the month
    // the market moved, so what is asserted is the agreement between the
    // corpus and the goldens, in BOTH directions -- a loss appearing or
    // disappearing shows up as a goldens diff to read, not as a red test.
    //
    // The loss RENDERING is proven on a fixture in Overview.test.tsx, so it
    // stays covered in a month like this one where the corpus holds none.
    const losses = analytics.rollups.account
      .filter((g) => (groupGainFor(g.accounts.map((a) => a.maskedId))?.gain ?? 0) < 0)
      .map((g) => g.label)
      .sort();
    expect(losses).toEqual(GOLDENS.lossGroups);
  });
});
