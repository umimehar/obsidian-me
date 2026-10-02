import { describe, expect, test } from "bun:test";
import {
  CORPORATE_KINDS,
  PERSONAL_NONREG_KINDS,
  accountIdsOfKind,
} from "../analytics/accountScopes";
import { claimableYear } from "../analytics/claimable";
import { passiveIncomeYear } from "../analytics/corporatePassiveIncome";
import { withholdingByAccount } from "../analytics/incomeCosts";
import { GOLDENS } from "../goldens";
import { loadTaxTable, taxYear } from "../tax";
import { loadAnalytics } from "./data";

/**
 * Pins the Non-registered and Corporate tabs' own figures against the
 * committed `data/goldens.json`, by calling the SAME production functions
 * the tabs call -- never a figure restated by hand. A regression in
 * `claimableYear`, `passiveIncomeYear` or the per-sale ledger shows up here
 * as a red test, exactly the discipline the rest of `goldens.ts` already
 * follows.
 */
describe("the taxable tabs' goldens", () => {
  const analytics = loadAnalytics();
  const table = loadTaxTable();
  const year = GOLDENS.income.year;
  const rates = taxYear(table, year);
  if (rates === null) throw new Error(`no tax.json rates for ${year}`);

  const personalIds = accountIdsOfKind(analytics.series, PERSONAL_NONREG_KINDS);
  const corporateIds = accountIdsOfKind(analytics.series, CORPORATE_KINDS);
  const withholding = withholdingByAccount(analytics, year);
  const personalForeignTax = new Map(
    withholding
      .filter((w) => personalIds.has(w.maskedId))
      .map((w) => [w.maskedId, w.withholdingTax]),
  );
  const corporateForeignTax = new Map(
    withholding
      .filter((w) => corporateIds.has(w.maskedId))
      .map((w) => [w.maskedId, w.withholdingTax]),
  );

  test("personal income matches the golden", () => {
    const income = analytics.income[String(year)];
    expect(income?.realizedGains).toBe(GOLDENS.taxableTabs.personal.realizedGains);
    expect(income?.foreignDividends).toBe(GOLDENS.taxableTabs.personal.foreignDividends);
    expect(income?.sales.length).toBe(GOLDENS.taxableTabs.personal.salesCount);
  });

  test("corporate income matches the golden and is never the same as personal income", () => {
    const income = analytics.corporateIncome[String(year)];
    expect(income?.realizedGains).toBe(GOLDENS.taxableTabs.corporate.realizedGains);
    expect(income?.realizedGains).not.toBe(GOLDENS.taxableTabs.personal.realizedGains);
  });

  test("the superficial-loss watch's flagged count matches the golden", () => {
    const candidates = analytics.superficialLoss[String(year)] ?? [];
    const flagged = candidates.filter((c) => c.status !== "clear");
    expect(flagged.length).toBe(GOLDENS.taxableTabs.personal.superficialLossFlaggedCount);
  });

  test("personal claimable totals match the golden", () => {
    const result = claimableYear(
      analytics,
      year,
      personalIds,
      rates.personal.marginalRate.value,
      false,
      personalForeignTax,
    );
    expect(result.deductionsTotal).toBe(GOLDENS.taxableTabs.personal.claimableDeductionsTotal);
    expect(result.creditsTotal).toBe(GOLDENS.taxableTabs.personal.claimableCreditsTotal);
  });

  test("corporate claimable and passive income match the golden", () => {
    const result = claimableYear(
      analytics,
      year,
      corporateIds,
      rates.corporate.passiveIncomeRate.value,
      true,
      corporateForeignTax,
    );
    expect(result.deductionsTotal).toBe(GOLDENS.taxableTabs.corporate.claimableDeductionsTotal);

    const income = analytics.corporateIncome[String(year)];
    if (!income) throw new Error("no corporate income for the golden year");
    const passive = passiveIncomeYear(year, income, rates.corporate);
    expect(passive.aaii).toBe(GOLDENS.taxableTabs.corporate.aaii);
    expect(passive.cdaAddition).toBe(GOLDENS.taxableTabs.corporate.cdaAddition);
  });

  test("T1135 cost amounts match the golden", () => {
    const personal = analytics.foreignPropertyPersonal[String(year)];
    const corporate = analytics.foreignPropertyCorporate[String(year)];
    expect(personal?.maxForeignCost).toBe(GOLDENS.taxableTabs.personal.t1135MaxForeignCost);
    expect(corporate?.maxForeignCost).toBe(GOLDENS.taxableTabs.corporate.t1135MaxForeignCost);
  });
});
