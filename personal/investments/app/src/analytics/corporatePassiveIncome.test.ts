import { describe, expect, test } from "bun:test";
import type { IncomeSummary } from "./income";
import type { CorporateTaxYear } from "../tax";
import { aaii, passiveIncomeYear, runningCapitalAccounts, sbdGrind } from "./corporatePassiveIncome";

function income(over: Partial<IncomeSummary> = {}): IncomeSummary {
  return {
    interest: 0,
    canadianDistributions: 0,
    foreignDividends: 0,
    foreignTaxWithheld: 0,
    realizedGains: 0,
    costUnknownSales: 0,
    corporateActions: [],
    sales: [],
    ...over,
  };
}

function rates(over: Partial<CorporateTaxYear> = {}): CorporateTaxYear {
  return {
    fiscalYearEnd: "12-31",
    passiveIncomeRate: { value: 0.5017, source: "t" },
    partIVRate: { value: 0.3833, source: "t" },
    aaiiThresholds: { lower: 50000, upper: 150000, gradePerDollar: 5, source: "t" },
    nerdtohRate: { value: 0.3067, source: "t" },
    dividendRefundRate: { value: 0.3833, source: "t" },
    ...over,
  };
}

describe("aaii", () => {
  test("sums interest, foreign dividends, taxable capital gains and eligible dividends", () => {
    const value = aaii(
      income({ interest: 1000, foreignDividends: 500, realizedGains: 2000, canadianDistributions: 300 }),
      0.5,
    );
    expect(value).toBe(1000 + 500 + 1000 + 300);
  });

  test("a net realized LOSS contributes zero taxable gains, never a negative", () => {
    const value = aaii(income({ realizedGains: -5000 }), 0.5);
    expect(value).toBe(0);
  });
});

describe("sbdGrind", () => {
  const thresholds = { lower: 50000, upper: 150000, gradePerDollar: 5, source: "t" };

  test("is zero at or below the lower threshold", () => {
    expect(sbdGrind(50000, thresholds)).toBe(0);
    expect(sbdGrind(10000, thresholds)).toBe(0);
  });

  test("grinds $5 per $1 of AAII over the lower threshold", () => {
    expect(sbdGrind(60000, thresholds)).toBe(50000);
  });

  test("reaches the full $500,000 limit at the upper threshold", () => {
    expect(sbdGrind(150000, thresholds)).toBe(500000);
  });
});

describe("passiveIncomeYear", () => {
  test("flags the SBD as eliminated once AAII reaches the upper threshold", () => {
    const year = passiveIncomeYear(2026, income({ interest: 200000 }), rates());
    expect(year.sbdEliminated).toBe(true);
  });

  test("CDA addition is half the net realized gain, matching the capital gains inclusion split", () => {
    const year = passiveIncomeYear(2026, income({ realizedGains: 1000 }), rates());
    expect(year.cdaAddition).toBe(500);
  });

  test("a net realized loss reduces the CDA addition for the year (negative)", () => {
    const year = passiveIncomeYear(2026, income({ realizedGains: -1000 }), rates());
    expect(year.cdaAddition).toBe(-500);
  });

  test("nERDTOH addition is 30.67% of AAII", () => {
    const year = passiveIncomeYear(2026, income({ interest: 10000 }), rates());
    expect(year.nerdtohAdded).toBeCloseTo(10000 * 0.3067, 6);
  });

  test("Part IV tax is 38.33% of Canadian eligible dividends received", () => {
    const year = passiveIncomeYear(2026, income({ canadianDistributions: 1000 }), rates());
    expect(year.partIVTax).toBeCloseTo(383.3, 6);
  });
});

describe("runningCapitalAccounts", () => {
  test("accumulates CDA and RDTOH across years, a loss year reducing the running CDA", () => {
    const years = [
      passiveIncomeYear(2025, income({ realizedGains: 2000, interest: 1000 }), rates()),
      passiveIncomeYear(2026, income({ realizedGains: -1000, interest: 500 }), rates()),
    ];
    const rows = runningCapitalAccounts(years);
    expect(rows[0]?.cdaBalance).toBe(1000);
    expect(rows[1]?.cdaBalance).toBe(500);
    expect(rows[1]?.nerdtohBalance).toBeGreaterThan(rows[0]?.nerdtohBalance ?? 0);
  });
});
