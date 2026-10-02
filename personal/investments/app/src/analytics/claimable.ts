import type { AccountKind } from "../store/mask";
import type { AnalyticsOutput } from "./build";

export type ClaimableTreatment =
  | "foreign-tax-credit"
  | "carrying-charge"
  | "excluded-registered"
  | "not-deductible"
  | "ask-accountant";

/** One claimable or excluded item for one account, for one year -- see `CLAUDE.md`'s "Claimable items" spec. */
export interface ClaimableLine {
  maskedId: string;
  label: string;
  what: string;
  amount: number;
  /** The form/line it belongs to, or `null` for a line that belongs on no form (an excluded registered fee, or an unclassifiable amount). */
  form: string | null;
  treatment: ClaimableTreatment;
  /** The tax effect at the year's marginal/passive rate, estimate labelled by the caller -- null when the treatment carries no rate (a credit's effect is the amount itself, an excluded fee has no effect at all). */
  taxEffectEstimate: number | null;
}

function periodYear(period: string): number {
  return Number(period.slice(0, 4));
}

/** Stated fees for one account, summed over `year`. */
function statedFeesForAccount(
  statedFees: AnalyticsOutput["statedFees"],
  maskedId: string,
  year: number,
): number {
  let total = 0;
  for (const [period, byAccount] of Object.entries(statedFees)) {
    if (periodYear(period) !== year) continue;
    total += byAccount[maskedId] ?? 0;
  }
  return total;
}

const REGISTERED_KINDS: ReadonlySet<AccountKind> = new Set([
  "TFSA",
  "RRSP",
  "SpousalRRSP",
  "FHSA",
  "RESP",
]);

/**
 * The carrying-charge (personal, line 22100) and investment-management-fee
 * (corporate) claimable line for one account's fees -- or the excluded
 * line, for a registered account's fees, which are never deductible and
 * are listed separately so the owner sees WHY they are excluded rather
 * than simply missing.
 */
function feeLine(
  maskedId: string,
  label: string,
  kind: AccountKind,
  fee: number,
  marginalRate: number,
  isCorporate: boolean,
): ClaimableLine | null {
  if (fee <= 0.005) return null;
  if (REGISTERED_KINDS.has(kind)) {
    return {
      maskedId,
      label,
      what: "Account fee on a registered account",
      amount: fee,
      form: null,
      treatment: "excluded-registered",
      taxEffectEstimate: null,
    };
  }
  return {
    maskedId,
    label,
    what: isCorporate
      ? "Investment management fee, deductible against property income"
      : "Account management / service fee",
    amount: fee,
    form: isCorporate ? null : "Line 22100 (Schedule 4), carrying charge",
    treatment: "carrying-charge",
    taxEffectEstimate: fee * marginalRate,
  };
}

/** The foreign-tax-withheld credit line, personal (T2209/line 40500) or corporate (foreign non-business income tax credit). */
function foreignTaxLine(
  maskedId: string,
  label: string,
  foreignTaxWithheld: number,
  isCorporate: boolean,
): ClaimableLine | null {
  if (foreignTaxWithheld <= 0.005) return null;
  return {
    maskedId,
    label,
    what: isCorporate
      ? "Foreign tax withheld -- foreign non-business income tax credit (reduces but does not refund)"
      : "Foreign tax withheld on dividends -- foreign tax credit (15% US treaty rate)",
    amount: foreignTaxWithheld,
    form: isCorporate ? null : "T2209 / line 40500",
    treatment: "foreign-tax-credit",
    taxEffectEstimate: foreignTaxWithheld,
  };
}

/** Commissions, FX conversion costs and spreads: already inside realized gains (ACB/proceeds), never a separate deduction, shown with that label. */
function commissionsLine(
  maskedId: string,
  label: string,
  fxConversionAmount: number,
): ClaimableLine | null {
  if (fxConversionAmount <= 0.005) return null;
  return {
    maskedId,
    label,
    what: "Commissions, FX conversion costs and spreads -- already adjust ACB/proceeds inside realized gains, not a separate deduction",
    amount: fxConversionAmount,
    form: null,
    treatment: "not-deductible",
    taxEffectEstimate: null,
  };
}

export interface ClaimableYear {
  lines: ClaimableLine[];
  deductionsTotal: number;
  deductionsTaxEffectEstimate: number;
  creditsTotal: number;
}

/**
 * Every claimable deduction and creditable tax for one year, over the
 * accounts of `kinds` (personal non-registered scope or the corporate
 * scope -- see `accountScopes.ts`), built from statement activity
 * (`statedFees`, `activity.fxConversionAmount`, `income.foreignTaxWithheld`)
 * rather than a hardcoded list. `marginalRate` is the personal estimate or
 * the corporate passive rate, whichever the caller's scope calls for.
 *
 * Registered-account fees are listed with `excluded-registered`, never
 * silently dropped, so the owner sees why they do not reduce anything.
 * Anything this function cannot classify is the caller's job to add under
 * `ask-accountant` -- this function itself never emits that treatment,
 * since every line it builds is already classified by rule.
 */
/** One account's FX conversion amount for the year, summed off `analytics.activity`. */
function fxConversionForAccount(
  activity: AnalyticsOutput["activity"],
  maskedId: string,
  year: number,
): number {
  let total = 0;
  for (const [period, byAccount] of Object.entries(activity)) {
    if (periodYear(period) !== year) continue;
    total += byAccount[maskedId]?.fxConversionAmount ?? 0;
  }
  return total;
}

/** Every claimable line for one account -- the three rules `claimableYear` applies, for one account at a time. */
function linesForAccount(
  analytics: AnalyticsOutput,
  account: AnalyticsOutput["series"][number],
  year: number,
  marginalRate: number,
  isCorporate: boolean,
  foreignTaxWithheldByAccount: ReadonlyMap<string, number>,
): ClaimableLine[] {
  const fee = statedFeesForAccount(analytics.statedFees, account.maskedId, year);
  const foreignTax = foreignTaxWithheldByAccount.get(account.maskedId) ?? 0;
  const fxConversionAmount = fxConversionForAccount(analytics.activity, account.maskedId, year);

  return [
    feeLine(account.maskedId, account.label, account.kind, fee, marginalRate, isCorporate),
    foreignTaxLine(account.maskedId, account.label, foreignTax, isCorporate),
    commissionsLine(account.maskedId, account.label, fxConversionAmount),
  ].filter((line): line is ClaimableLine => line !== null);
}

export function claimableYear(
  analytics: AnalyticsOutput,
  year: number,
  accountIds: ReadonlySet<string>,
  marginalRate: number,
  isCorporate: boolean,
  foreignTaxWithheldByAccount: ReadonlyMap<string, number>,
): ClaimableYear {
  const lines: ClaimableLine[] = [];
  for (const account of analytics.series) {
    if (!accountIds.has(account.maskedId)) continue;
    lines.push(
      ...linesForAccount(
        analytics,
        account,
        year,
        marginalRate,
        isCorporate,
        foreignTaxWithheldByAccount,
      ),
    );
  }

  const deductionsTotal = lines
    .filter((l) => l.treatment === "carrying-charge")
    .reduce((sum, l) => sum + l.amount, 0);
  const deductionsTaxEffectEstimate = lines
    .filter((l) => l.treatment === "carrying-charge")
    .reduce((sum, l) => sum + (l.taxEffectEstimate ?? 0), 0);
  const creditsTotal = lines
    .filter((l) => l.treatment === "foreign-tax-credit")
    .reduce((sum, l) => sum + l.amount, 0);

  return { lines, deductionsTotal, deductionsTaxEffectEstimate, creditsTotal };
}
