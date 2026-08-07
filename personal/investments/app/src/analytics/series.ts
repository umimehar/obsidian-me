import type { AccountKind } from "../store/mask";
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

/**
 * The wrappers where a derived figure lands on a CRA annual room bar, so
 * `DEP` must not count toward it. RESP is deliberately absent: see
 * `contributionCodesFor`.
 */
const ANNUAL_ROOM_KINDS: ReadonlySet<AccountKind> = new Set<AccountKind>([
  "TFSA",
  "RRSP",
  "SpousalRRSP",
  "FHSA",
]);

/**
 * `CONTRIBUTION_ACTIVITY_CODES`, minus `DEP` for the wrappers that carry an
 * annual CRA room bar.
 *
 * Every statement's own activity-code legend prints `DEP - Non-contribution
 * deposit`. Counting it toward `rooms[].used` for a TFSA, RRSP or FHSA would
 * have this app overrule the document, and land the result on a room bar as
 * money the statement explicitly says was not a contribution. Deriving a
 * figure from activity is already a fallback; it must not also disagree with
 * the page it is derived from.
 *
 * RESP keeps `DEP`, and the corpus is why: its $450 arrived under that code,
 * and CRA counts every dollar a subscriber puts into an RESP against the
 * $50,000 lifetime cap however it arrived. The RESP has no annual room bar
 * for this to inflate either.
 *
 * No account in today's corpus changes: the only `DEP` credits anywhere are
 * the RESP's $450 and a chequing account's, and neither is affected. This
 * closes a hazard the trailing-month derivation opened rather than fixing a
 * live wrong figure -- before it, `DEP` only ever reached wholly-derived
 * accounts, none of which had an annual room bar.
 */
function contributionCodesFor(kind: AccountKind): ReadonlySet<string> {
  if (!ANNUAL_ROOM_KINDS.has(kind)) return CONTRIBUTION_ACTIVITY_CODES;
  const codes = new Set(CONTRIBUTION_ACTIVITY_CODES);
  codes.delete("DEP");
  return codes;
}

/** Sums this statement's contribution-shaped activity credits (see `contributionCodesFor`). */
function deriveContributionFromActivity(s: Statement, codes: ReadonlySet<string>): number {
  let total = 0;
  for (const row of s.activity) {
    if (codes.has(row.code)) total += row.credit;
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

/** The contribution fields one statement resolves to, whatever route produced them. */
interface ContributionFields {
  contributions: number | null;
  contributionMonthsSpanned: number;
  contributionsSource: "stated" | "derived" | null;
}

/**
 * The index, per calendar year, of the last statement in `statements` that
 * states a year-to-date contributions figure. A year absent from the map
 * states none at all.
 *
 * This is what separates a gap the statements later close from one they
 * never do. Wealthsimple's layout changed for 2025-10 through 2026-01 and
 * dropped the Contributions panel from four consecutive statements on three
 * accounts, so the panel's absence is routine, not exceptional.
 */
function lastStatedIndexByYear(statements: readonly Statement[]): Map<number, number> {
  const lastStated = new Map<number, number>();
  for (const [index, s] of statements.entries()) {
    if (combinedYearToDate(s.contributions) === null) continue;
    lastStated.set(parsePeriod(s.source.period).year, index);
  }
  return lastStated;
}

/**
 * What an unstated statement's contribution is worth.
 *
 * A stated year-to-date figure is authoritative and already includes every
 * earlier month of its year, so an unstated month that a later stated figure
 * still covers stays null: deriving it from activity would double-count it
 * against that figure's delta. `contributionMonthsSpanned` on the closing
 * stated month records how many calendar months the delta covers.
 *
 * After a year's last stated figure there is nothing authoritative left, and
 * leaving those months null loses real money out of the year's total. That
 * cost the RRSP total $1,000 for 2025: account 2318's last stated figure was
 * $2,000 at 2025-09, and its 2025-10 statement prints a $1,000.00 CONT
 * activity row under a Portfolio Cash block with no Contributions panel at
 * all. The money is printed, just not as a running total, so it is derived
 * from activity and flagged `"derived"` rather than presented as printed.
 */
function unstatedContribution(
  s: Statement,
  coveredByLaterStatedFigure: boolean,
  codes: ReadonlySet<string>,
): ContributionFields {
  if (coveredByLaterStatedFigure) {
    return { contributions: null, contributionMonthsSpanned: 1, contributionsSource: null };
  }
  return {
    contributions: deriveContributionFromActivity(s, codes),
    contributionMonthsSpanned: 1,
    contributionsSource: "derived",
  };
}

/**
 * Each stated year-to-date contribution figure turns into a delta against
 * the last stated figure -- or into the figure itself when it is the first
 * stated point of its calendar year, since the running total resets each
 * January.
 *
 * A statement with no stated figure resolves through `unstatedContribution`:
 * null when a later stated figure in the same year still covers it, derived
 * from its own activity rows when nothing does.
 *
 * `contributionsByYear` takes the last stated year-to-date figure observed
 * in each calendar year -- which equals the sum of that year's stated deltas
 * by construction, since they telescope back to it -- plus every derived
 * figure after it. The two never overlap: derivation only happens past the
 * year's last stated index.
 */
function buildStatedMonths(statements: readonly Statement[], kind: AccountKind): MonthsResult {
  const months: MonthPoint[] = [];
  const contributionsByYear: Record<string, number> = {};
  const codes = contributionCodesFor(kind);
  const lastStated = lastStatedIndexByYear(statements);
  let last: { year: number; month: number; yearToDate: number } | null = null;

  for (const [index, s] of statements.entries()) {
    const current = parsePeriod(s.source.period);
    const yearToDate = combinedYearToDate(s.contributions);
    let fields: ContributionFields;

    if (yearToDate === null) {
      const stop = lastStated.get(current.year);
      fields = unstatedContribution(s, stop !== undefined && index < stop, codes);
      const derived = fields.contributions;
      if (derived !== null) {
        contributionsByYear[current.year] = (contributionsByYear[current.year] ?? 0) + derived;
      }
    } else {
      fields = { ...contributionDelta(yearToDate, current, last), contributionsSource: "stated" };
      contributionsByYear[current.year] = yearToDate;
      last = { ...current, yearToDate };
    }

    months.push({
      ...baseMonthFields(s),
      ...fields,
      contributionFirst60Days: s.contributions?.first60Days ?? null,
      contributionRestOfYear: s.contributions?.restOfYear ?? null,
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
function buildDerivedMonths(statements: readonly Statement[], kind: AccountKind): MonthsResult {
  const months: MonthPoint[] = [];
  const contributionsByYear: Record<string, number> = {};
  const codes = contributionCodesFor(kind);

  for (const s of statements) {
    const { year } = parsePeriod(s.source.period);
    const contributions = deriveContributionFromActivity(s, codes);
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
function buildMonths(statements: readonly Statement[], kind: AccountKind): MonthsResult {
  const statesContributions = statements.some((s) => s.contributions !== null);
  return statesContributions
    ? buildStatedMonths(statements, kind)
    : buildDerivedMonths(statements, kind);
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
    const { months, contributionsByYear } = buildMonths(picked, account.kind);
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
