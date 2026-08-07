import type { AnalyticsOutput } from "../analytics/build";
import {
  REGISTERED_KINDS,
  type RegisteredGroup,
  type RoomLine,
  genericAnnualLimit,
} from "../analytics/rooms";
import type { AccountSeries } from "../analytics/types";
import type { AccountKind } from "../store/mask";
import type { ProjectionInputs, RegisteredRules } from "./engine";
import { fittedReturnRate } from "./fittedRate";

/**
 * The projection covers one group more than the room bars do. A corporate
 * account has no CRA room, so it must stay out of `REGISTERED_KINDS` -- but
 * it holds money and it is funded on a plan, so it belongs in a forecast of
 * what the accounts are worth.
 */
export type ProjectionGroup = RegisteredGroup | "Corporate";

const PROJECTION_GROUP_ORDER: readonly ProjectionGroup[] = [
  "TFSA",
  "RRSP",
  "FHSA",
  "RESP",
  "Corporate",
];

const PROJECTION_KINDS: Record<ProjectionGroup, readonly AccountKind[]> = {
  ...REGISTERED_KINDS,
  Corporate: ["Corporate"],
};

/**
 * Flat CRA figures. FHSA and RESP limits are statutory and do not index, so
 * unlike the year-keyed tables in `rooms.ts` these are single numbers.
 * `tfsaRounding`/`rrspRounding` are the units CRA publishes each indexed
 * limit to -- a rounding rule about publication, applied to the figure handed
 * back each year and never carried into the next one (see `engine.ts`).
 */
const REGISTERED_RULES: RegisteredRules = {
  fhsaAnnual: 8000,
  fhsaLifetime: 40000,
  respLifetime: 50000,
  respGrantTarget: 2500,
  respCatchupTarget: 5000,
  cesgRate: 0.2,
  cesgAnnualBasic: 500,
  cesgAnnualMax: 1000,
  cesgLifetime: 7200,
  tfsaRounding: 500,
  rrspRounding: 10,
};

/**
 * The four figures no statement states and no rule derives. Each is a fact
 * about a person or a plan, so each is an override with a documented
 * default rather than something reconstructed from the corpus.
 *
 * `years`, `returnRate` and `indexRate` are the dials the interface will
 * hand back from its own controls. `returnRate` left undefined is what makes
 * the page self-seeding: the rate then comes from `fittedReturnRate` over
 * the same analytics payload, so a new statement month moves it.
 */
export interface ProjectionOverrides {
  years?: number;
  /** Annual return, as a fraction. Omitted means fit it from the market-value history. */
  returnRate?: number;
  /** Annual indexation applied to the TFSA and RRSP room bases. */
  indexRate?: number;
  /** The last calendar year RRSP room accrues. The owner turns 71 in 2068. */
  rrspLastYear?: string;
  /** $1,000 biweekly over 26 pay periods. An owner plan, so flat, not indexed. */
  corporateAnnual?: number;
  /** Drives RESP catch-up grant room and the CESG cutoff. Appears in no statement. */
  respBeneficiaryBirthYear?: number;
}

const DEFAULT_YEARS = 30;
const DEFAULT_INDEX_RATE = 0.02;
const DEFAULT_RRSP_LAST_YEAR = "2068";
const DEFAULT_CORPORATE_ANNUAL = 1000 * 26;
const DEFAULT_RESP_BIRTH_YEAR = 2025;

/** The counted accounts belonging to one projection group. */
function accountsIn(series: readonly AccountSeries[], group: ProjectionGroup): AccountSeries[] {
  const kinds = PROJECTION_KINDS[group];
  return series.filter((a) => a.inTotals && kinds.includes(a.kind));
}

/**
 * The latest period any counted account reports, `YYYY-MM`, or null when no
 * counted account reports one. Periods sort correctly as plain strings.
 *
 * This, not the calendar, is what the projection starts from. The corpus
 * ends at 2026-06 while the clock reads 2026-08, and the three excluded
 * Chequing accounts run to 2026-07 -- reading either of those would start
 * the projection from a year the invested accounts have no figures for.
 */
function latestCountedPeriod(series: readonly AccountSeries[]): string | null {
  let latest: string | null = null;
  for (const account of series) {
    if (!account.inTotals) continue;
    for (const month of account.months) {
      if (latest === null || month.period > latest) latest = month.period;
    }
  }
  return latest;
}

/** Sums `deposits` across a group's accounts, over one calendar year or over all of them. */
function depositsIn(accounts: readonly AccountSeries[], year: string | null): number {
  let total = 0;
  for (const account of accounts) {
    for (const month of account.months) {
      if (year !== null && !month.period.startsWith(year)) continue;
      total += month.deposits;
    }
  }
  return total;
}

function lineFor(lines: readonly RoomLine[], group: RegisteredGroup): RoomLine | null {
  return lines.find((l) => l.group === group) ?? null;
}

/**
 * What each group has already had put into it this calendar year, which the
 * engine subtracts from the start year's room.
 *
 * RESP is the exception, and it is not a stylistic one. CRA counts every
 * dollar a subscriber puts into an RESP against the $50,000 lifetime cap,
 * however it arrived: a deposit that Wealthsimple never tagged `CONT` is
 * still a contribution. In this corpus the RESP's six statements carry
 * $2,550 of `CONT` rows and $450 of `DEP` rows, so a figure built from
 * tagged contributions alone undercounts by $450 -- and understating money
 * already in overstates the room left, which is the direction that gets
 * someone over-contributed. Grants stay out either way: a `GRANT` credit is
 * government money, never the subscriber's, and it lands as an activity
 * credit rather than in the cash block's `paidIn.deposits`.
 *
 * The asymmetry is deliberate: RESP is the ONLY group read from deposits.
 * TFSA, RRSP and FHSA read the room line's `used`, because deposits
 * over-count there. Money routes through a hub account on its way to the
 * RRSPs, so the same dollar lands as a deposit twice -- the CSV-era pipeline
 * this app replaces read gross deposits as the room basis once and inflated
 * 2026 RRSP from the real $33,000 to $52,666. The RESP has no hub in front
 * of it, so it has no such double count to avoid, and reading its deposits
 * is safe as well as correct.
 */
function contributedThisYear(
  series: readonly AccountSeries[],
  lines: readonly RoomLine[],
  year: string,
): Record<string, number> {
  return {
    TFSA: lineFor(lines, "TFSA")?.used ?? 0,
    RRSP: lineFor(lines, "RRSP")?.used ?? 0,
    FHSA: lineFor(lines, "FHSA")?.used ?? 0,
    RESP: depositsIn(accountsIn(series, "RESP"), year),
    // A corporation has no contribution room, so there is nothing already
    // used against it. The engine funds it from `corporateAnnual` instead.
    Corporate: 0,
  };
}

/**
 * Lifetime totals for the two groups that carry a lifetime cap. FHSA reads
 * the rooms module's own cumulative figure; RESP is summed from deposits for
 * the reason in `contributedThisYear`.
 */
function lifetimeContributed(
  series: readonly AccountSeries[],
  lines: readonly RoomLine[],
): Record<string, number> {
  return {
    FHSA: lineFor(lines, "FHSA")?.lifetimeContributions?.contributed ?? 0,
    RESP: depositsIn(accountsIn(series, "RESP"), null),
  };
}

/**
 * RRSP room the start year can still use, taken from the notice-of-assessment
 * line and nowhere else.
 *
 * `RoomLine.remaining` is populated only when `assessed` is true, and that is
 * the whole point: an assessed figure has carry-forward baked in, so
 * `limit - used` is a real number. The generic annual maximum does not, so
 * falling back to it would report this year's published limit less this
 * year's contributions as though it were room -- in this corpus 33,810
 * against the real 37,752, understating by 3,942 while looking entirely
 * plausible. With no assessed figure the honest answer is zero: unknown
 * carry-forward is not a licence to invent some.
 */
function rrspAssessedRemaining(lines: readonly RoomLine[]): number {
  const rrsp = lineFor(lines, "RRSP");
  if (rrsp === null || !rrsp.assessed) return 0;
  return Math.max(0, rrsp.remaining ?? 0);
}

/**
 * The year the FHSA must close, 15 years after its first activity. Read from
 * the account's earliest statement period across the whole corpus, since when
 * an account closes is a fact about the account.
 *
 * Empty string when no FHSA account exists, which the engine reads as a
 * close year already past -- an FHSA that is not there contributes nothing
 * and holds nothing, rather than being projected forward from nowhere.
 */
function fhsaCloseYear(series: readonly AccountSeries[]): string {
  let earliest: string | null = null;
  for (const account of accountsIn(series, "FHSA")) {
    const first = account.months[0];
    if (first !== undefined && (earliest === null || first.period < earliest)) {
      earliest = first.period;
    }
  }
  return earliest === null ? "" : String(Number(earliest.slice(0, 4)) + 15);
}

/**
 * Each group's opening balance, read off the registration rollup rather than
 * re-summed here. That rollup already totals each account's latest stated
 * `marketValue` over the `inTotals: true` accounts, which is exactly what an
 * opening balance is -- summing it a second way would let the projection's
 * starting point drift from the value the rest of the dashboard shows.
 */
function openingByGroup(analytics: AnalyticsOutput): Record<string, number> {
  const totals = new Map(analytics.rollups.registration.map((r) => [r.key, r.total]));
  const opening: Record<string, number> = {};
  for (const group of PROJECTION_GROUP_ORDER) opening[group] = totals.get(group) ?? 0;
  return opening;
}

/**
 * Everything the thirty-year engine needs, derived from `analytics.json` at
 * call time. Nothing here is pinned to the clock: the start year comes from
 * the statements, so a new statement month moves the projection's starting
 * point with no code change, and a stale corpus projects from where the
 * corpus actually ends rather than from today.
 *
 * Pure. See `engine.ts` for the rules this feeds.
 */
export function projectionInputs(
  analytics: AnalyticsOutput,
  overrides: ProjectionOverrides = {},
): ProjectionInputs {
  const series = analytics.series;
  const latest = latestCountedPeriod(series);
  const startYear = latest === null ? "" : latest.slice(0, 4);
  const lines = analytics.rooms[startYear] ?? [];
  const birthYear = overrides.respBeneficiaryBirthYear ?? DEFAULT_RESP_BIRTH_YEAR;

  return {
    startYear,
    years: overrides.years ?? DEFAULT_YEARS,
    returnRate: overrides.returnRate ?? fittedReturnRate(series).rate,
    indexRate: overrides.indexRate ?? DEFAULT_INDEX_RATE,
    opening: openingByGroup(analytics),
    contributedThisYear: contributedThisYear(series, lines, startYear),
    lifetimeContributed: lifetimeContributed(series, lines),
    cesgReceived: lineFor(lines, "RESP")?.lifetimeGrant?.received ?? 0,
    // Basic CESG room accrues from birth, including the birth year itself.
    // Floored at zero so a start year before the beneficiary was born -- or
    // an empty corpus, whose start year is no year at all -- reports no room
    // rather than a large negative one.
    cesgRoomAccrued: Math.max(
      0,
      REGISTERED_RULES.cesgAnnualBasic * (Number(startYear) - birthYear + 1),
    ),
    rrspAssessedRemaining: rrspAssessedRemaining(lines),
    fhsaCloseYear: fhsaCloseYear(series),
    rrspLastYear: overrides.rrspLastYear ?? DEFAULT_RRSP_LAST_YEAR,
    // CESG stops after the year the beneficiary turns 17.
    cesgLastYear: String(birthYear + 17),
    groups: PROJECTION_GROUP_ORDER.filter((g) => accountsIn(series, g).length > 0),
    corporateAnnual: overrides.corporateAnnual ?? DEFAULT_CORPORATE_ANNUAL,
    // The PUBLISHED limit, never the assessed one -- see `genericAnnualLimit`.
    roomBase: {
      TFSA: genericAnnualLimit("TFSA", Number(startYear)) ?? 0,
      RRSP: genericAnnualLimit("RRSP", Number(startYear)) ?? 0,
    },
    rules: REGISTERED_RULES,
  };
}
