import { describe, expect, test } from "bun:test";
import {
  CORPORATE_CREDIT_FORM,
  CORPORATE_DEDUCTION_FORM,
  type ClaimableYear,
} from "../../analytics/claimable";
import { corporateTaxTiles, estimatedPersonalTax, personalTaxTiles } from "./tiles";

const EMPTY_INCOME = {
  interest: 0,
  canadianDistributions: 0,
  foreignDividends: 0,
  foreignTaxWithheld: 0,
  realizedGains: 0,
  costUnknownSales: 0,
  corporateActions: [],
  sales: [],
};

const NO_CLAIMABLE: ClaimableYear = {
  lines: [],
  deductionsTotal: 0,
  deductionsTaxEffectEstimate: 0,
  creditsTotal: 0,
};

describe("personalTaxTiles", () => {
  test("a year with zero income yields zeroed tiles, tagged jade for a non-negative gain", () => {
    const tiles = personalTaxTiles(EMPTY_INCOME, 0.5, NO_CLAIMABLE);
    expect(tiles.every((t) => t.amount === 0)).toBe(true);
    expect(tiles.find((t) => t.key === "net-capital-gain")?.tone).toBe("jade");
  });

  test("a net loss year tones the net capital gain tile red", () => {
    const tiles = personalTaxTiles({ ...EMPTY_INCOME, realizedGains: -500 }, 0.5, NO_CLAIMABLE);
    expect(tiles.find((t) => t.key === "net-capital-gain")?.tone).toBe("red");
  });

  test("null claimable (year without rates) leaves deduction/credit tiles at zero", () => {
    const tiles = personalTaxTiles(EMPTY_INCOME, 0.5, null);
    expect(tiles.find((t) => t.key === "deductions")?.amount).toBe(0);
    expect(tiles.find((t) => t.key === "foreign-tax-credit")?.amount).toBe(0);
  });
});

describe("estimatedPersonalTax", () => {
  const rates = {
    province: "ON",
    marginalRate: { value: 0.4826, source: "test" },
    capitalGainsInclusion: { value: 0.5, source: "test" },
    eligibleDividendGrossUp: { value: 0.38, source: "test" },
    federalEligibleDtcRate: { value: 0.150198, source: "test" },
    ontarioEligibleDtcRate: { value: 0.1, source: "test" },
  };

  test("zero income produces zero estimated tax", () => {
    expect(estimatedPersonalTax(EMPTY_INCOME, rates)).toBe(0);
  });

  test("foreign tax withheld directly reduces the estimate", () => {
    const base = estimatedPersonalTax({ ...EMPTY_INCOME, interest: 1000 }, rates);
    const withCredit = estimatedPersonalTax(
      { ...EMPTY_INCOME, interest: 1000, foreignTaxWithheld: 50 },
      rates,
    );
    expect(base - withCredit).toBeCloseTo(50, 6);
  });
});

describe("corporateTaxTiles", () => {
  const passive = {
    year: 2026,
    aaii: 494.77,
    grind: 0,
    sbdEliminated: false,
    nerdtohAdded: 151.75,
    partIVTax: 47.26,
    cdaAddition: 51.36,
    interestAndForeignTaxable: 320.1,
  };

  test("carries the passive-income figures through to their tiles", () => {
    const tiles = corporateTaxTiles(passive, NO_CLAIMABLE);
    expect(tiles.find((t) => t.key === "passive-income")?.amount).toBe(494.77);
    expect(tiles.find((t) => t.key === "capital-dividend-account")?.amount).toBe(51.36);
  });

  test("null claimable leaves deduction/credit tiles at zero", () => {
    const tiles = corporateTaxTiles(passive, null);
    expect(tiles.find((t) => t.key === "deductions")?.amount).toBe(0);
  });

  test("the deduction and credit tiles read the same form/line words the Claimable table reads, so they cannot disagree", () => {
    const tiles = corporateTaxTiles(passive, NO_CLAIMABLE);
    expect(tiles.find((t) => t.key === "deductions")?.note).toBe(CORPORATE_DEDUCTION_FORM);
    expect(tiles.find((t) => t.key === "foreign-tax-credit")?.note).toBe(CORPORATE_CREDIT_FORM);
  });
});
