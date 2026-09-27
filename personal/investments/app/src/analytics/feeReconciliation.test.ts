import { describe, expect, test } from "bun:test";
import { GOLDENS } from "../goldens";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { loadAnalytics } from "../ui/data";
import type { AnalyticsOutput } from "./build";
import { feeReconciliationGaps } from "./feeReconciliation";
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

const ZERO = {
  dividends: 0,
  interest: 0,
  lendingIncome: 0,
  withholdingTax: 0,
  fees: 0,
  fxConversions: 0,
  fxConversionAmount: 0,
};

function analyticsFixture(overrides: Partial<AnalyticsOutput> = {}): AnalyticsOutput {
  return {
    meta: { generated: "", datastoreGenerated: "", accountCount: 0 },
    series: [],
    rooms: {},
    income: {},
    returns: [],
    rollups: { registration: [], account: [], purpose: [] },
    activity: {},
    statedFees: {},
    ...overrides,
  };
}

describe("feeReconciliationGaps, over a fixture", () => {
  test("an account whose stated fees exceed its FEE/REIMB rows shows a positive gap", () => {
    const a = account({ maskedId: "acct_gap" });
    const analytics = analyticsFixture({
      series: [a],
      activity: { "2026-01": { acct_gap: { ...ZERO, fees: 0 } } },
      statedFees: { "2026-01": { acct_gap: 23.87 } },
    });
    const gaps = feeReconciliationGaps(analytics, 2026);
    expect(gaps).toEqual([{ maskedId: "acct_gap", label: "Account 0001", gap: 23.87 }]);
  });

  test("stated fees matching derived fees exactly show no gap", () => {
    const a = account({ maskedId: "acct_ok" });
    const analytics = analyticsFixture({
      series: [a],
      activity: { "2026-01": { acct_ok: { ...ZERO, fees: 10 } } },
      statedFees: { "2026-01": { acct_ok: 10 } },
    });
    expect(feeReconciliationGaps(analytics, 2026)).toEqual([]);
  });

  test("an account excluded from totals never appears, even with a real gap", () => {
    const a = account({ maskedId: "acct_excluded", inTotals: false, kind: "Chequing" });
    const analytics = analyticsFixture({
      series: [a],
      activity: { "2026-01": { acct_excluded: { ...ZERO, fees: 0 } } },
      statedFees: { "2026-01": { acct_excluded: 5 } },
    });
    expect(feeReconciliationGaps(analytics, 2026)).toEqual([]);
  });

  test("a gap under a cent is left out as rounding, not a finding", () => {
    const a = account({ maskedId: "acct_rounding" });
    const analytics = analyticsFixture({
      series: [a],
      activity: { "2026-01": { acct_rounding: { ...ZERO, fees: 10 } } },
      statedFees: { "2026-01": { acct_rounding: 10.005 } },
    });
    expect(feeReconciliationGaps(analytics, 2026)).toEqual([]);
  });

  test("gaps sort by size, largest first", () => {
    const small = account({ maskedId: "acct_small" });
    const big = account({ maskedId: "acct_big" });
    const analytics = analyticsFixture({
      series: [small, big],
      activity: {
        "2026-01": {
          acct_small: { ...ZERO, fees: 0 },
          acct_big: { ...ZERO, fees: 0 },
        },
      },
      statedFees: { "2026-01": { acct_small: 1, acct_big: 100 } },
    });
    expect(feeReconciliationGaps(analytics, 2026).map((g) => g.maskedId)).toEqual([
      "acct_big",
      "acct_small",
    ]);
  });
});

describe("feeReconciliationGaps, over the real corpus", () => {
  test("matches the pinned goldens for 2025 and 2026", () => {
    const analytics = loadAnalytics();
    const gaps2025 = feeReconciliationGaps(analytics, 2025).map(({ label, gap }) => ({
      label,
      gap,
    }));
    const gaps2026 = feeReconciliationGaps(analytics, 2026).map(({ label, gap }) => ({
      label,
      gap,
    }));
    expect(gaps2025).toEqual(GOLDENS.incomeCosts.feeReconciliationGapsByYear["2025"]);
    expect(gaps2026).toEqual(GOLDENS.incomeCosts.feeReconciliationGapsByYear["2026"]);
  });
});
