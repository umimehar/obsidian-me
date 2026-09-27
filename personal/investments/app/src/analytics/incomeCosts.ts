import type { AccountKind } from "../store/mask";
import { type ActivityTotals, sumActivity } from "./activity";
import type { AnalyticsOutput } from "./build";

/** One calendar year's activity income and costs, over the `inTotals` accounts only. */
export interface YearIncome {
  year: number;
  totals: ActivityTotals;
  /** Keyed by masked account id, `inTotals` accounts only. */
  byAccount: Record<string, ActivityTotals>;
}

/** One period's activity totals, over the `inTotals` accounts -- one of `incomeByMonth`'s rows. */
export interface MonthlyActivity {
  period: string;
  totals: ActivityTotals;
}

/** One account's withholding tax for a year, alongside what its wrapper can do about it. */
export interface AccountWithholding {
  maskedId: string;
  label: string;
  kind: AccountKind;
  withholdingTax: number;
  recovery: WithholdingRecovery;
}

export type WithholdingRecovery = "credit" | "exempt for US listed funds" | "lost";

function periodYear(period: string): number {
  return Number(period.slice(0, 4));
}

/**
 * Whether a wrapper's foreign withholding tax can be claimed back.
 *
 * NonRegistered and Corporate hold it personally or corporately and can
 * claim it as a foreign tax credit. RRSP and SpousalRRSP are exempt from US
 * withholding under the Canada-US tax treaty, but only on US listed funds
 * held directly, never on a Canadian listed wrapper of a US fund. Every
 * other wrapper -- TFSA, FHSA, RESP, Crypto, Chequing -- has no treaty
 * relief and no credit to claim, so tax withheld inside it is simply lost.
 */
export function withholdingRecovery(kind: AccountKind): WithholdingRecovery {
  if (kind === "NonRegistered" || kind === "Corporate") return "credit";
  if (kind === "RRSP" || kind === "SpousalRRSP") return "exempt for US listed funds";
  return "lost";
}

/** `inTotals` accounts, keyed by masked id -- the membership this module restricts to. */
function inTotalsIds(analytics: AnalyticsOutput): ReadonlySet<string> {
  return new Set(analytics.series.filter((account) => account.inTotals).map((a) => a.maskedId));
}

/**
 * Income and costs by calendar year, over the `inTotals` accounts only,
 * oldest first. Built straight off `analytics.activity` -- the same
 * reversal-netted totals `activity.ts` already produces -- rather than
 * re-deriving the rule a second time.
 */
export function incomeByYear(analytics: AnalyticsOutput): YearIncome[] {
  const counted = inTotalsIds(analytics);
  const byYear = new Map<number, Record<string, ActivityTotals>>();

  for (const [period, byAccount] of Object.entries(analytics.activity)) {
    const year = periodYear(period);
    const bucket = byYear.get(year) ?? {};
    for (const [accountId, totals] of Object.entries(byAccount)) {
      if (!counted.has(accountId)) continue;
      const existing = bucket[accountId];
      bucket[accountId] = existing ? sumActivity([existing, totals]) : totals;
    }
    byYear.set(year, bucket);
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, byAccount]) => ({
      year,
      byAccount,
      totals: sumActivity(Object.values(byAccount)),
    }));
}

/**
 * Income and costs by month, within one calendar year, over the `inTotals`
 * accounts only, oldest first.
 *
 * A month is only included when at least one `inTotals` account actually
 * has an entry that period -- never when the only statement that period
 * belongs to an excluded account (chequing, most often). Including it
 * anyway would push a real, stated zero into the dividends chart for a
 * month no counted account said anything about at all, which is the same
 * absence-versus-zero mistake `CashflowChart` and `CostGapChart` both guard
 * against.
 */
export function incomeByMonth(analytics: AnalyticsOutput, year: number): MonthlyActivity[] {
  const counted = inTotalsIds(analytics);
  const rows: MonthlyActivity[] = [];

  for (const [period, byAccount] of Object.entries(analytics.activity)) {
    if (periodYear(period) !== year) continue;
    const accountTotals = Object.entries(byAccount)
      .filter(([accountId]) => counted.has(accountId))
      .map(([, totals]) => totals);
    if (accountTotals.length === 0) continue;
    rows.push({ period, totals: sumActivity(accountTotals) });
  }

  return rows.sort((a, b) => a.period.localeCompare(b.period));
}

/** One account's income and costs for a year, sorted by dividends + interest + lending. */
export interface AccountIncome {
  maskedId: string;
  label: string;
  totals: ActivityTotals;
}

/**
 * Income and costs per `inTotals` account, for one calendar year, sorted by
 * (dividends + interest + lending income) descending -- the accounts that
 * actually pay something first, withholding and fees being costs rather
 * than income are left out of that ordering key.
 */
export function incomeByAccountForYear(analytics: AnalyticsOutput, year: number): AccountIncome[] {
  const counted = inTotalsIds(analytics);
  const byAccount = new Map<string, ActivityTotals[]>();
  for (const [period, accounts] of Object.entries(analytics.activity)) {
    if (periodYear(period) !== year) continue;
    for (const [accountId, totals] of Object.entries(accounts)) {
      if (!counted.has(accountId)) continue;
      const rows = byAccount.get(accountId) ?? [];
      rows.push(totals);
      byAccount.set(accountId, rows);
    }
  }

  const rows: AccountIncome[] = [];
  for (const account of analytics.series) {
    const activity = byAccount.get(account.maskedId);
    if (activity === undefined) continue;
    rows.push({ maskedId: account.maskedId, label: account.label, totals: sumActivity(activity) });
  }
  return rows.sort((a, b) => {
    const income = (t: ActivityTotals) => t.dividends + t.interest + t.lendingIncome;
    return income(b.totals) - income(a.totals);
  });
}

/** One chequing account's interest for a year -- never `inTotals`, so never in `incomeByYear`. */
export interface ChequingInterest {
  maskedId: string;
  label: string;
  interest: number;
}

/**
 * Chequing interest by account, for one calendar year -- every chequing
 * account with a nonzero figure. Chequing carried coded `INT` rows on its
 * BROKERAGE statements through 2026-06; from 2026-07 it sends only a CASH
 * statement, which carries no activity code at all, so a later year can
 * state nothing here even though earlier ones do.
 */
export function chequingInterestByAccount(
  analytics: AnalyticsOutput,
  year: number,
): ChequingInterest[] {
  const byAccount = new Map<string, number>();
  for (const [period, accounts] of Object.entries(analytics.activity)) {
    if (periodYear(period) !== year) continue;
    for (const [accountId, totals] of Object.entries(accounts)) {
      byAccount.set(accountId, (byAccount.get(accountId) ?? 0) + totals.interest);
    }
  }

  const rows: ChequingInterest[] = [];
  for (const account of analytics.series) {
    if (account.kind !== "Chequing") continue;
    const interest = byAccount.get(account.maskedId);
    if (!interest) continue;
    rows.push({ maskedId: account.maskedId, label: account.label, interest });
  }
  return rows.sort((a, b) => b.interest - a.interest);
}

/**
 * Foreign withholding tax by account, for one calendar year -- every account
 * with a nonzero figure, including the spousal RRSP even though it is not
 * `inTotals`. It is the owner's RRSP room but the spouse's asset, and its
 * withholding is worth showing on its own line rather than folding silently
 * into either the totals or a lost cause.
 */
export function withholdingByAccount(
  analytics: AnalyticsOutput,
  year: number,
): AccountWithholding[] {
  const byAccount = new Map<string, number>();
  for (const [period, accounts] of Object.entries(analytics.activity)) {
    if (periodYear(period) !== year) continue;
    for (const [accountId, totals] of Object.entries(accounts)) {
      byAccount.set(accountId, (byAccount.get(accountId) ?? 0) + totals.withholdingTax);
    }
  }

  const rows: AccountWithholding[] = [];
  for (const account of analytics.series) {
    const amount = byAccount.get(account.maskedId);
    if (!amount) continue;
    if (!account.inTotals && account.kind !== "SpousalRRSP") continue;
    rows.push({
      maskedId: account.maskedId,
      label: account.label,
      kind: account.kind,
      withholdingTax: amount,
      recovery: withholdingRecovery(account.kind),
    });
  }
  return rows.sort((a, b) => b.withholdingTax - a.withholdingTax);
}
