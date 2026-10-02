import { describe, expect, test } from "bun:test";
import { loadTaxTable, parseTaxTable, taxYear } from "./tax";

function validYear() {
  return {
    personal: {
      province: "ON",
      marginalRate: { value: 0.4826, source: "test" },
      capitalGainsInclusion: { value: 0.5, source: "test" },
      eligibleDividendGrossUp: { value: 0.38, source: "test" },
      federalEligibleDtcRate: { value: 0.150198, source: "test" },
      ontarioEligibleDtcRate: { value: 0.1, source: "test" },
    },
    corporate: {
      fiscalYearEnd: "12-31",
      passiveIncomeRate: { value: 0.5017, source: "test" },
      partIVRate: { value: 0.3833, source: "test" },
      aaiiThresholds: { lower: 50000, upper: 150000, gradePerDollar: 5, source: "test" },
      nerdtohRate: { value: 0.3067, source: "test" },
      dividendRefundRate: { value: 0.3833, source: "test" },
    },
    t1135: { filingThreshold: 100000, detailedThreshold: 250000, source: "test" },
  };
}

describe("parseTaxTable", () => {
  test("parses the committed tax.json without throwing", () => {
    const table = loadTaxTable();
    expect(Object.keys(table).length).toBeGreaterThan(0);
  });

  test("parses a valid year", () => {
    const table = parseTaxTable({ "2026": validYear() });
    expect(table["2026"]?.personal.marginalRate.value).toBe(0.4826);
    expect(table["2026"]?.corporate.aaiiThresholds.upper).toBe(150000);
    expect(table["2026"]?.t1135.filingThreshold).toBe(100000);
  });

  test("throws on a marginal rate written as a percent instead of a fraction", () => {
    const year = validYear();
    year.personal.marginalRate = { value: 48.26, source: "test" };
    expect(() => parseTaxTable({ "2026": year })).toThrow(/between 0 and 1/);
  });

  test("throws when a source string is missing", () => {
    const year = validYear();
    // @ts-expect-error -- deliberately malformed input, the case under test
    year.personal.marginalRate = { value: 0.4826 };
    expect(() => parseTaxTable({ "2026": year })).toThrow(/source/);
  });

  test("throws when aaiiThresholds.upper does not exceed .lower", () => {
    const year = validYear();
    year.corporate.aaiiThresholds = { lower: 150000, upper: 50000, gradePerDollar: 5, source: "t" };
    expect(() => parseTaxTable({ "2026": year })).toThrow(/upper must exceed/);
  });

  test("throws when t1135.detailedThreshold does not exceed .filingThreshold", () => {
    const year = validYear();
    year.t1135 = { filingThreshold: 250000, detailedThreshold: 100000, source: "t" };
    expect(() => parseTaxTable({ "2026": year })).toThrow(/detailedThreshold must exceed/);
  });

  test("throws on a malformed fiscalYearEnd", () => {
    const year = validYear();
    year.corporate.fiscalYearEnd = "Dec 31";
    expect(() => parseTaxTable({ "2026": year })).toThrow(/MM-DD/);
  });
});

describe("taxYear", () => {
  test("returns null for a year with no entry, never a fallback to another year", () => {
    const table = parseTaxTable({ "2026": validYear() });
    expect(taxYear(table, 2027)).toBeNull();
  });

  test("returns the year's own rates when present", () => {
    const table = parseTaxTable({ "2026": validYear() });
    expect(taxYear(table, 2026)?.personal.province).toBe("ON");
  });
});
