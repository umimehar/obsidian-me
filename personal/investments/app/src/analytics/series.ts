import type { AccountRecord } from "../store/registry";
import type { Contributions, Statement } from "../types";
import type { AccountSeries, MonthPoint } from "./types";

/**
 * Activity codes counted as a subscriber's own contribution when a
 * `contributions` figure must be derived from activity rather than read off
 * a statement: `CONT` itself, plus the codes that mark money arriving from
 * outside the owner's Wealthsimple accounts (a bank EFT, a pre-authorized
 * transfer, an e-transfer received, or a generic deposit). `GRANT`/`CLB`
 * are deliberately absent -- government money is not the subscriber's
 * contribution and must never count toward a lifetime cap. `TRFINTF` /
 * `TRFOUT` / `TRFOUTTF` are also absent -- transfers between the owner's
 * own accounts are not new money in.
 */
const CONTRIBUTION_ACTIVITY_CODES = new Set(["CONT", "DEP", "EFT", "AFT_IN", "E_TRFIN", "TRFIN"]);

/** Sums this statement's contribution-shaped activity credits (see `CONTRIBUTION_ACTIVITY_CODES`). */
function deriveContributionFromActivity(s: Statement): number {
  let total = 0;
  for (const row of s.activity) {
    if (CONTRIBUTION_ACTIVITY_CODES.has(row.code)) total += row.credit;
  }
  return total;
}

/** The fields every `MonthPoint` carries regardless of how contributions are sourced. */
function baseMonthFields(
  s: Statement,
): Omit<
  MonthPoint,
  | "contributions"
  | "contributionMonthsSpanned"
  | "contributionFirst60Days"
  | "contributionRestOfYear"
  | "contributionsSource"
> {
  const cadCash = s.cash.find((c) => c.currency === "CAD") ?? null;
  return {
    period: s.source.period,
    marketValue: s.portfolio?.totalMarketValue ?? null,
    bookCost: s.portfolio?.totalBookCost ?? null,
    cashBalance: cadCash?.closing ?? null,
    deposits: cadCash?.paidIn?.deposits ?? 0,
    withdrawals: cadCash?.paidOut?.withdrawals ?? 0,
    grants: 0, // task 3: summed from GRANT/CLB activity credits
  };
}

/**
 * The account's combined year-to-date contribution figure for one
 * statement -- `yearToDate` directly for a self-directed-style statement,
 * or `first60Days + restOfYear` for the split-style statements the RRSP
 * family sometimes prints, since both halves are themselves cumulative
 * within the calendar year and combine to the same kind of running total.
 * Null when the statement states no contributions figure at all.
 */
function combinedYearToDate(c: Contributions | null): number | null {
  if (c === null) return null;
  if (c.yearToDate !== null) return c.yearToDate;
  if (c.first60Days !== null || c.restOfYear !== null) {
    return (c.first60Days ?? 0) + (c.restOfYear ?? 0);
  }
  return null;
}

function parsePeriod(period: string): { year: number; month: number } {
  const [yearPart, monthPart] = period.split("-");
  return { year: Number(yearPart), month: Number(monthPart) };
}

interface ContributionDelta {
  contributions: number;
  contributionMonthsSpanned: number;
}

/**
 * The delta for one stated year-to-date figure against the last one seen,
 * or the figure itself when it opens a new calendar year (no prior point,
 * or a prior point from an earlier year).
 */
function contributionDelta(
  yearToDate: number,
  current: { year: number; month: number },
  last: { year: number; month: number; yearToDate: number } | null,
): ContributionDelta {
  if (last !== null && last.year === current.year) {
    return {
      contributions: yearToDate - last.yearToDate,
      contributionMonthsSpanned: current.month - last.month,
    };
  }
  return { contributions: yearToDate, contributionMonthsSpanned: current.month };
}

interface MonthsResult {
  months: MonthPoint[];
  contributionsByYear: Record<string, number>;
}

/**
 * Each stated year-to-date contribution figure turns into a delta against
 * the last stated figure -- or into the figure itself when it is the first
 * stated point of its calendar year, since the running total resets each
 * January. A statement with no stated figure gets a null `contributions`
 * delta and does not move the baseline forward, so the next stated figure's
 * delta silently spans the gap; `contributionMonthsSpanned` records how many
 * calendar months that delta covers so the UI cannot attribute a
 * multi-month lump to one month.
 *
 * `contributionsByYear` takes the last stated year-to-date figure observed
 * in each calendar year, which equals the sum of that year's monthly deltas
 * by construction, since they telescope back to it.
 */
function buildStatedMonths(statements: readonly Statement[]): MonthsResult {
  const months: MonthPoint[] = [];
  const contributionsByYear: Record<string, number> = {};
  let last: { year: number; month: number; yearToDate: number } | null = null;

  for (const s of statements) {
    const current = parsePeriod(s.source.period);
    const yearToDate = combinedYearToDate(s.contributions);
    const delta = yearToDate === null ? null : contributionDelta(yearToDate, current, last);

    if (yearToDate !== null) {
      contributionsByYear[current.year] = yearToDate;
      last = { ...current, yearToDate };
    }

    months.push({
      ...baseMonthFields(s),
      contributions: delta?.contributions ?? null,
      contributionMonthsSpanned: delta?.contributionMonthsSpanned ?? 1,
      contributionFirst60Days: s.contributions?.first60Days ?? null,
      contributionRestOfYear: s.contributions?.restOfYear ?? null,
      contributionsSource: yearToDate === null ? null : "stated",
    });
  }

  return { months, contributionsByYear };
}

/**
 * Used only when an account states no contributions figure on any of its
 * statements -- each month's figure is reconstructed from that statement's
 * own activity rows instead (see `deriveContributionFromActivity`), rather
 * than left at zero, which the CSV-era pipeline this app replaces once did
 * and undercounted a real account by $8,000 as a result. Each derived
 * figure is a plain per-period total, not a running one, so
 * `contributionsByYear` sums them directly instead of reading off the last
 * one the way `buildStatedMonths` does.
 */
function buildDerivedMonths(statements: readonly Statement[]): MonthsResult {
  const months: MonthPoint[] = [];
  const contributionsByYear: Record<string, number> = {};

  for (const s of statements) {
    const { year } = parsePeriod(s.source.period);
    const contributions = deriveContributionFromActivity(s);
    contributionsByYear[year] = (contributionsByYear[year] ?? 0) + contributions;

    months.push({
      ...baseMonthFields(s),
      contributions,
      contributionMonthsSpanned: 1,
      contributionFirst60Days: null,
      contributionRestOfYear: null,
      contributionsSource: "derived",
    });
  }

  return { months, contributionsByYear };
}

/**
 * Builds one account's `MonthPoint`s and its `contributionsByYear` rollup.
 * Reads the stated year-to-date figures when the account prints any --
 * `buildStatedMonths` -- and falls back to deriving from activity,
 * flagged as such, only when it prints none at all.
 */
function buildMonths(statements: readonly Statement[]): MonthsResult {
  const statesContributions = statements.some((s) => s.contributions !== null);
  return statesContributions ? buildStatedMonths(statements) : buildDerivedMonths(statements);
}

/**
 * Picks, for one account, the one statement per period that carries a
 * `MonthPoint`. PERFORMANCE is dropped entirely -- it duplicates its
 * BROKERAGE twin's portfolio and would double-count. A CASH-template
 * statement is used only when no BROKERAGE statement covers the same
 * period, since a chequing account has cash but never a portfolio.
 */
function pickStatementsByPeriod(statements: readonly Statement[]): Statement[] {
  const byPeriod = new Map<string, Statement>();
  for (const s of statements) {
    if (s.source.template === "PERFORMANCE") continue;
    const existing = byPeriod.get(s.source.period);
    if (!existing || s.source.template === "BROKERAGE") {
      byPeriod.set(s.source.period, s);
    }
  }
  return [...byPeriod.values()].sort((a, b) => a.source.period.localeCompare(b.source.period));
}

/**
 * One `AccountSeries` per registry account, each holding one `MonthPoint`
 * per period that has a statement. A period with no statement is simply
 * absent -- never zero-filled -- so a gap in the corpus stays visible as a
 * gap in the series.
 */
export function buildSeries(
  statements: readonly Statement[],
  accounts: readonly AccountRecord[],
): AccountSeries[] {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) {
    const list = byAccount.get(s.source.accountNo) ?? [];
    list.push(s);
    byAccount.set(s.source.accountNo, list);
  }

  return accounts.map((account) => {
    const picked = pickStatementsByPeriod(byAccount.get(account.maskedId) ?? []);
    const { months, contributionsByYear } = buildMonths(picked);
    return {
      maskedId: account.maskedId,
      shortId: account.shortId,
      label: account.label,
      kind: account.kind,
      style: account.style,
      purpose: account.purpose,
      inTotals: account.inTotals,
      months,
      contributionsByYear,
    };
  });
}
