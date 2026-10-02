import type { AnalyticsOutput } from "../../analytics/build";
import {
  CORPORATE_CREDIT_FORM,
  CORPORATE_DEDUCTION_FORM,
  type ClaimableYear,
} from "../../analytics/claimable";
import type { PassiveIncomeYear } from "../../analytics/corporatePassiveIncome";
import { formatCurrency, formatRate } from "../format";

export interface TaxTile {
  key: string;
  label: string;
  amount: number;
  note: string;
  tone: "jade" | "red" | "gray";
}

type PersonalIncome = AnalyticsOutput["income"][string];
type PersonalRates = import("../../tax").PersonalTaxYear;

/** The personal "tax picture" tiles -- section 2 of the redesign spec, one tile per figure the owner reports. */
export function personalTaxTiles(
  income: PersonalIncome,
  inclusion: number,
  claimable: ClaimableYear | null,
): TaxTile[] {
  const taxableGain = Math.max(income.realizedGains, 0) * inclusion;
  return [
    {
      key: "net-capital-gain",
      label: "Net capital gain",
      amount: income.realizedGains,
      note: `Taxable at ${formatRate(inclusion * 100)}: ${formatCurrency(taxableGain)}. Schedule 3, line 12700.`,
      tone: income.realizedGains < 0 ? "red" : "jade",
    },
    {
      key: "foreign-dividends",
      label: "Foreign dividends",
      amount: income.foreignDividends,
      note: "Line 12100 (T5 / T3)",
      tone: "gray",
    },
    {
      key: "canadian-distributions",
      label: "Canadian dividends / distributions",
      amount: income.canadianDistributions,
      note: "Exact split comes on your T3 slips",
      tone: "gray",
    },
    {
      key: "interest",
      label: "Interest",
      amount: income.interest,
      note: "Line 12100",
      tone: "gray",
    },
    {
      key: "deductions",
      label: "Deductions (carrying charges)",
      amount: claimable?.deductionsTotal ?? 0,
      note: "Line 22100",
      tone: "gray",
    },
    {
      key: "foreign-tax-credit",
      label: "Foreign tax credit",
      amount: claimable?.creditsTotal ?? 0,
      note: "Line 40500 via form T2209",
      tone: "gray",
    },
  ];
}

/** `formatCurrency(estimatedTax)` and the pieces behind it -- the one emphasized line under the personal tiles grid. */
export function estimatedPersonalTax(income: PersonalIncome, rates: PersonalRates): number {
  const taxableGain = Math.max(income.realizedGains, 0) * rates.capitalGainsInclusion.value;
  const grossedUpDividends =
    income.canadianDistributions * (1 + rates.eligibleDividendGrossUp.value);
  const dtc =
    grossedUpDividends * (rates.federalEligibleDtcRate.value + rates.ontarioEligibleDtcRate.value);
  const taxableIncome =
    income.interest + income.foreignDividends + grossedUpDividends + taxableGain;
  const grossTax = taxableIncome * rates.marginalRate.value;
  return grossTax - dtc - income.foreignTaxWithheld;
}

/** The corporate "tax picture" tiles -- section 2 of the redesign spec, each with a plain-language explainer. */
export function corporateTaxTiles(
  passive: PassiveIncomeYear,
  claimable: ClaimableYear | null,
): TaxTile[] {
  return [
    {
      key: "passive-income",
      label: "Passive income (AAII)",
      amount: passive.aaii,
      note: "The small business rate starts shrinking above $50,000 and is gone at $150,000",
      tone: "gray",
    },
    {
      key: "capital-dividend-account",
      label: "Capital dividend account",
      amount: passive.cdaAddition,
      note: "Can be paid to you tax free",
      tone: "jade",
    },
    {
      key: "rdtoh-non-eligible",
      label: "Refundable tax (non-eligible RDTOH)",
      amount: passive.nerdtohAdded,
      note: "Refunded to the corporation when it pays you taxable dividends",
      tone: "gray",
    },
    {
      key: "rdtoh-eligible",
      label: "Refundable tax (eligible RDTOH)",
      amount: passive.partIVTax,
      note: "Refunded to the corporation when it pays you taxable dividends, via Part IV tax on Canadian dividends",
      tone: "gray",
    },
    {
      key: "deductions",
      label: "Deductions",
      amount: claimable?.deductionsTotal ?? 0,
      note: CORPORATE_DEDUCTION_FORM,
      tone: "gray",
    },
    {
      key: "foreign-tax-credit",
      label: "Foreign tax credit",
      amount: claimable?.creditsTotal ?? 0,
      note: CORPORATE_CREDIT_FORM,
      tone: "gray",
    },
  ];
}
