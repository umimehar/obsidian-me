import type { CorporateTaxYear } from "../tax";
import type { IncomeSummary } from "./income";

/**
 * Adjusted aggregate investment income for one fiscal year: interest plus
 * foreign dividends plus taxable capital gains (net realized gains x the
 * inclusion rate, floored at zero -- a net loss year reduces nothing here,
 * it feeds the CDA instead) plus Canadian eligible dividends. Eligible
 * dividends from a portfolio investment ARE part of AAII, which is the one
 * place this definition differs from ordinary investment income.
 */
export function aaii(income: IncomeSummary, capitalGainsInclusion: number): number {
  const taxableGains = Math.max(income.realizedGains, 0) * capitalGainsInclusion;
  return (
    income.interest + income.foreignDividends + taxableGains + income.canadianDistributions
  );
}

/** The small business deduction's passive-income grind: $5 of SBD limit lost per $1 of AAII over the lower threshold, never below zero. */
export function sbdGrind(aaiiValue: number, thresholds: CorporateTaxYear["aaiiThresholds"]): number {
  if (aaiiValue <= thresholds.lower) return 0;
  return (aaiiValue - thresholds.lower) * thresholds.gradePerDollar;
}

export interface PassiveIncomeYear {
  year: number;
  aaii: number;
  grind: number;
  /** Whether AAII has passed the upper threshold, where the SBD is fully eliminated. */
  sbdEliminated: boolean;
  /** 30.67% of AAII, added to the non-eligible RDTOH pool this year -- an estimate from statements, not the T2. */
  nerdtohAdded: number;
  /** 38.33% of Canadian eligible dividends received, added to the eligible RDTOH pool via Part IV tax -- an estimate. */
  partIVTax: number;
  /** The non-taxable half of NET realized gains this year -- added to the capital dividend account. A net loss reduces this, and the running `cda` below never goes negative since CRA tracks it as a running balance from $0. */
  cdaAddition: number;
  /** Interest plus foreign dividends and interest, taxed at the passive rate -- the treatment line distinct from eligible dividends, which route through Part IV instead. */
  interestAndForeignTaxable: number;
}

/**
 * One fiscal year's passive-income figures for the corporation: AAII
 * against the SBD grind, the two RDTOH pools' additions and the capital
 * dividend account addition. Every figure here is explicitly an ESTIMATE
 * built from statement activity, never a filing number -- the actual
 * RDTOH and CDA balances live on the T2 and can differ for reasons this
 * project cannot see (prior years' elections, a dividend refund already
 * paid out, etc).
 */
export function passiveIncomeYear(
  year: number,
  income: IncomeSummary,
  rates: CorporateTaxYear,
): PassiveIncomeYear {
  const inclusion = 0.5; // the net realized gain's taxable/non-taxable split is always 50/50 regardless of the personal inclusion rate on file
  const aaiiValue = aaii(income, inclusion);
  const grind = sbdGrind(aaiiValue, rates.aaiiThresholds);
  const netRealizedGain = income.realizedGains;
  return {
    year,
    aaii: aaiiValue,
    grind,
    sbdEliminated: aaiiValue >= rates.aaiiThresholds.upper,
    nerdtohAdded: aaiiValue * rates.nerdtohRate.value,
    partIVTax: income.canadianDistributions * rates.partIVRate.value,
    cdaAddition: netRealizedGain * inclusion,
    interestAndForeignTaxable: income.interest + income.foreignDividends,
  };
}

export interface RunningCapitalAccounts {
  year: number;
  cdaBalance: number;
  nerdtohBalance: number;
  eligibleRdtohBalance: number;
}

/**
 * Running CDA and RDTOH balances across every fiscal year the corpus
 * covers, oldest first -- never reset per year, since both are genuinely
 * cumulative accounts. A year's `cdaAddition` can be negative (a net
 * realized loss), and the running balance is allowed to fall with it;
 * CRA's own CDA can go negative in principle, though a corporation would
 * not actually pay a capital dividend against a negative balance.
 */
export function runningCapitalAccounts(
  years: readonly PassiveIncomeYear[],
): RunningCapitalAccounts[] {
  let cda = 0;
  let nerdtoh = 0;
  let eligibleRdtoh = 0;
  const rows: RunningCapitalAccounts[] = [];
  for (const y of years) {
    cda += y.cdaAddition;
    nerdtoh += y.nerdtohAdded;
    eligibleRdtoh += y.partIVTax;
    rows.push({ year: y.year, cdaBalance: cda, nerdtohBalance: nerdtoh, eligibleRdtohBalance: eligibleRdtoh });
  }
  return rows;
}
