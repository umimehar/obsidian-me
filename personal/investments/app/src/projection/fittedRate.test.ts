import { describe, expect, test } from "bun:test";
import type { AccountSeries, MonthPoint } from "../analytics/types";
import { loadAnalytics } from "../ui/data";
import { fittedReturnRate } from "./fittedRate";

function month(
  period: string,
  marketValue: number | null,
  deposits = 0,
  withdrawals = 0,
): MonthPoint {
  return {
    period,
    marketValue,
    bookCost: marketValue,
    cashBalance: null,
    deposits,
    withdrawals,
    contributions: null,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: null,
    grants: 0,
  };
}

function account(months: MonthPoint[], inTotals = true): AccountSeries {
  return {
    maskedId: "acct_test",
    shortId: "test",
    label: "Test",
    kind: "TFSA",
    style: "self-directed",
    purpose: "growth",
    inTotals,
    months,
    contributionsByYear: {},
  };
}

/**
 * A three-point series whose arithmetic is checkable by eye, which the real
 * corpus cannot be. Nothing in 37 months of real balances lands on a round
 * factor, so this is the only place the netting formula itself is pinned to
 * a number worked by hand rather than to whatever the corpus happens to say.
 *
 *   2024-01  $1,000, no flow
 *   2024-02  $1,100, no flow      -> growth 100 on capital 1,000
 *   2024-03  $2,210, $1,000 in    -> growth 2,210 - 1,000 - 1,100 = 110
 *                                    on capital 1,100
 *
 * Capital-weighted monthly = (100 + 110) / (1,000 + 1,100) = 210 / 2,100
 *                          = 0.10 exactly
 * Annualized               = 1.1^12 - 1 = 2.138428376721...
 *
 * Drop the netting and 2024-03's growth becomes 1,110, so the monthly figure
 * is 1,210 / 2,100 = 0.576190..., annualizing to about 23,413% -- four
 * orders of magnitude out from a series that really grew 10% a month.
 */
const HAND_WORKED = [
  account([month("2024-01", 1000), month("2024-02", 1100), month("2024-03", 2210, 1000)]),
];

describe("fittedReturnRate, deposit netting", () => {
  test("matches the hand-worked netted figure on the synthetic series", () => {
    expect(fittedReturnRate(HAND_WORKED).rate).toBeCloseTo(1.1 ** 12 - 1, 10);
  });

  test("the netted figure is nowhere near the un-netted one it would be mistaken for", () => {
    const unNetted = (1 + 1210 / 2100) ** 12 - 1;
    expect(fittedReturnRate(HAND_WORKED).rate).toBeLessThan(unNetted / 100);
  });

  test("a withdrawal is netted back in, not read as a loss", () => {
    const withdrawn = [account([month("2024-01", 1000), month("2024-02", 100, 0, 1000)])];
    // 100 - (0 - 1000) - 1000 = 100 of growth on 1,000 of capital.
    expect(fittedReturnRate(withdrawn).rate).toBeCloseTo(1.1 ** 12 - 1, 10);
  });

  test("a month that is all deposit and no growth fits at exactly zero", () => {
    const funded = [account([month("2024-01", 1000), month("2024-02", 6000, 5000)])];
    expect(fittedReturnRate(funded).rate).toBe(0);
  });
});

describe("fittedReturnRate, guards", () => {
  test("a genuine zero opening balance yields a finite rate and is counted out", () => {
    const fromZero = [
      account([month("2024-01", 0), month("2024-02", 1000, 1000), month("2024-03", 1100)]),
    ];
    const fitted = fittedReturnRate(fromZero);
    expect(Number.isFinite(fitted.rate)).toBe(true);
    expect(fitted.rate).toBeCloseTo(1.1 ** 12 - 1, 10);
    expect(fitted.months).toBe(3);
    expect(fitted.monthsFitted).toBe(1);
  });

  test("the skipped zero-base month stays in the series length, so it is not silently dropped", () => {
    const fromZero = [account([month("2024-01", 0), month("2024-02", 1000, 1000)])];
    const fitted = fittedReturnRate(fromZero);
    expect(fitted.months).toBe(2);
    expect(fitted.monthsFitted).toBe(0);
    expect(fitted.rate).toBe(0);
  });

  test("an empty series is 0%, not NaN", () => {
    const fitted = fittedReturnRate([]);
    expect(fitted.rate).toBe(0);
    expect(fitted.months).toBe(0);
    expect(fitted.monthsFitted).toBe(0);
  });

  test("a total wipeout is -100%/yr", () => {
    const wiped = [account([month("2024-01", 1000), month("2024-02", 0)])];
    expect(fittedReturnRate(wiped).rate).toBe(-1);
  });

  test("losing more than the opening balance floors at -100%, never an even power back to positive", () => {
    // $1,000 opening, $5,000 deposited, nothing left: a monthly figure of
    // -6. Raised to the 12th unclamped that is +244,140,624, a catastrophe
    // rendered as the best return in history.
    const worse = [account([month("2024-01", 1000), month("2024-02", 0, 5000)])];
    expect(fittedReturnRate(worse).rate).toBe(-1);
  });

  test("excluded accounts contribute neither value nor flow", () => {
    const withChequing = [
      account([month("2024-01", 1000), month("2024-02", 1100)]),
      account([month("2024-01", null, 500), month("2024-02", null, 500)], false),
    ];
    expect(fittedReturnRate(withChequing).rate).toBeCloseTo(1.1 ** 12 - 1, 10);
  });
});

describe("fittedReturnRate against the real committed analytics.json", () => {
  const fitted = fittedReturnRate(loadAnalytics().series);

  test("reports its provenance: 37 months, 11 counted accounts, derived", () => {
    expect(fitted.months).toBe(37);
    expect(fitted.accounts).toBe(11);
    expect(fitted.source).toBe("derived");
  });

  test("fits 35 of the 36 links, the 36th being 2023-06's real $0 base", () => {
    expect(fitted.monthsFitted).toBe(35);
  });

  test("the netted rate is 24.84%/yr", () => {
    expect(fitted.rate).toBeCloseTo(0.2483925, 6);
  });

  test("it is not the un-netted reading, which is 486.85%/yr on this corpus", () => {
    // The corpus ends at $241,739.67 on roughly $214,000 of net deposits, so
    // market value alone reads almost entirely as return: 15.89%/month
    // un-netted against 1.87%/month netted. Dropping the netting turns 24.8%
    // into 486.9%, so it cannot pass as a small numeric drift.
    expect(fitted.rate).toBeLessThan(1);
  });
});
