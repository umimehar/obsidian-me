import { describe, expect, test } from "bun:test";
import type { AnalyticsOutput } from "./build";
import { claimableYear } from "./claimable";

function analytics(over: Partial<AnalyticsOutput> = {}): AnalyticsOutput {
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
    ...over,
  } as AnalyticsOutput;
}

function nrAccount() {
  return {
    maskedId: "acct_nr",
    shortId: "0001",
    label: "Non-registered",
    kind: "NonRegistered" as const,
    style: "self-directed" as const,
    purpose: "growth" as const,
    inTotals: true,
    months: [],
    contributionsByYear: {},
  };
}

function tfsaAccount() {
  return { ...nrAccount(), maskedId: "acct_tfsa", shortId: "0002", kind: "TFSA" as const };
}

describe("claimableYear", () => {
  test("a non-registered fee is a carrying charge with its tax-effect estimate", () => {
    const data = analytics({
      series: [nrAccount()],
      statedFees: { "2026-01": { acct_nr: 120 } },
    });
    const result = claimableYear(data, 2026, new Set(["acct_nr"]), 0.4826, false, new Map());
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.treatment).toBe("carrying-charge");
    expect(result.deductionsTotal).toBe(120);
    expect(result.deductionsTaxEffectEstimate).toBeCloseTo(120 * 0.4826, 6);
  });

  test("a registered account's fee is excluded, never a deduction, but still listed", () => {
    const data = analytics({
      series: [tfsaAccount()],
      statedFees: { "2026-01": { acct_tfsa: 50 } },
    });
    const result = claimableYear(data, 2026, new Set(["acct_tfsa"]), 0.4826, false, new Map());
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.treatment).toBe("excluded-registered");
    expect(result.deductionsTotal).toBe(0);
  });

  test("foreign tax withheld is a credit at its own amount, never scaled by the marginal rate", () => {
    const data = analytics({ series: [nrAccount()] });
    const result = claimableYear(
      data,
      2026,
      new Set(["acct_nr"]),
      0.4826,
      false,
      new Map([["acct_nr", 27.95]]),
    );
    expect(result.creditsTotal).toBe(27.95);
    expect(result.lines[0]?.taxEffectEstimate).toBe(27.95);
  });

  test("a USD fee is already converted to CAD by statedFees before this function sees it", () => {
    const data = analytics({ series: [nrAccount()], statedFees: { "2026-01": { acct_nr: 42.5 } } });
    const result = claimableYear(data, 2026, new Set(["acct_nr"]), 0.4826, false, new Map());
    expect(result.lines[0]?.amount).toBe(42.5);
  });

  test("a year with no fees, no withholding and no FX conversions produces no lines", () => {
    const data = analytics({ series: [nrAccount()] });
    const result = claimableYear(data, 2026, new Set(["acct_nr"]), 0.4826, false, new Map());
    expect(result.lines).toHaveLength(0);
    expect(result.deductionsTotal).toBe(0);
    expect(result.creditsTotal).toBe(0);
  });

  test("FX conversion spread is flagged not-deductible, already inside realized gains", () => {
    const data = analytics({
      series: [nrAccount()],
      activity: {
        "2026-01": {
          acct_nr: {
            dividends: 0,
            interest: 0,
            lendingIncome: 0,
            withholdingTax: 0,
            fees: 0,
            fxConversions: 1,
            fxConversionAmount: 15,
          },
        },
      },
    });
    const result = claimableYear(data, 2026, new Set(["acct_nr"]), 0.4826, false, new Map());
    const row = result.lines.find((l) => l.treatment === "not-deductible");
    expect(row?.amount).toBe(15);
  });
});
