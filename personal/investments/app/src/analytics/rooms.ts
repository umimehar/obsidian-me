import type { AccountKind } from "../store/mask";
import type { Statement } from "../types";
import type { AccountSeries } from "./types";

/** The four wrappers that carry a CRA contribution room concept. Everything else (NonRegistered, Corporate, Crypto, Chequing) has none. */
export type RegisteredGroup = "TFSA" | "RRSP" | "FHSA" | "RESP";

const REGISTERED_GROUPS: readonly RegisteredGroup[] = ["TFSA", "RRSP", "FHSA", "RESP"];

/**
 * Which `AccountKind`s roll into each group. RRSP rolls up self-directed,
 * managed AND spousal accounts, because a spousal RRSP contribution counts
 * against the contributing spouse's own room -- it is the same room as the
 * self-directed/managed accounts, not a separate pool. `RoomLine.spousalUsed`
 * reports the spousal slice of `used` separately so the owner can still see
 * it, without treating it as a distinct group.
 */
export const REGISTERED_KINDS: Record<RegisteredGroup, readonly AccountKind[]> = {
  TFSA: ["TFSA"],
  RRSP: ["RRSP", "SpousalRRSP"],
  FHSA: ["FHSA"],
  RESP: ["RESP"],
};

/**
 * The generic CRA annual maximum per wrapper per year, published figures.
 * TFSA and RRSP are indexed (to inflation and average wage respectively);
 * FHSA is a flat statutory dollar figure, so its table just repeats the
 * same value across years. RESP is deliberately absent -- it has no annual
 * contribution limit at all (see `buildRespLine`); its only contribution
 * bound is the $50,000 lifetime cap in `LIFETIME_CONTRIBUTION_CAPS`.
 *
 * This is the fallback ceiling. Where `ASSESSED_ROOM` has a figure for the
 * same group/year, that one wins instead -- see `resolveLimit`.
 */
const CONTRIBUTION_LIMITS: Partial<Record<RegisteredGroup, Record<number, number>>> = {
  TFSA: { 2022: 6000, 2023: 6500, 2024: 7000, 2025: 7000, 2026: 7000 },
  RRSP: { 2022: 29210, 2023: 30780, 2024: 31560, 2025: 32490, 2026: 33810 },
  FHSA: { 2023: 8000, 2024: 8000, 2025: 8000, 2026: 8000 },
};

/**
 * This person's actual room, transcribed from a notice of assessment, with
 * carry-forward already included. This is the real ceiling and it can
 * differ substantially from the generic annual maximum above. Where a
 * figure exists here for a group/year it wins, and `RoomLine.assessed`
 * records that so the interface can label the line and drop the
 * carry-forward caveat it would otherwise need against the generic
 * maximum. A group/year absent from this table simply falls back to
 * `CONTRIBUTION_LIMITS`.
 *
 * RRSP 2026 = 70,752, from the 2025 notice of assessment: 45,191 unused
 * room at the end of 2025, plus 25,561 additional limit earned in 2025
 * (18% of 2025 earned income), with no PSPA, PAR, or previously reported
 * undeducted contributions. Add next year's figure here when its NOA
 * arrives -- leaving this stale silently reverts that year to the generic
 * maximum, understating room by the carry-forward.
 */
const ASSESSED_ROOM: Partial<Record<RegisteredGroup, Record<number, number>>> = {
  RRSP: { 2026: 70752 },
};

/** Lifetime contribution caps, for the two groups that have one. TFSA and RRSP have none -- their room is entirely annual (plus carry-forward), never a lifetime dollar ceiling. */
const LIFETIME_CONTRIBUTION_CAPS: Partial<Record<RegisteredGroup, number>> = {
  FHSA: 40000,
  RESP: 50000,
};

/**
 * The RESP's CESG/CLB lifetime grant cap. Distinct from
 * `LIFETIME_CONTRIBUTION_CAPS.RESP` (the $50,000 contribution cap) -- the
 * two bounds are not the same and must never be conflated.
 */
const RESP_LIFETIME_GRANT_CAP = 7200;

/**
 * The contribution level that attracts the maximum BASIC annual CESG
 * ($500 = 20% of $2,500). This is not an annual contribution limit -- RESP
 * has none -- it is where the grant line stops improving in a normal year.
 * Unused grant room from prior years carries forward, so a catch-up year
 * can attract CESG on up to $5,000 of contributions (twice the basic
 * amount, $1,000), which is why a year's true grant entitlement is not
 * simply "contributed >= this threshold implies $500".
 */
const RESP_GRANT_MAXIMIZING_CONTRIBUTION = 2500;

/**
 * Activity codes that represent government grant money landing in an RESP:
 * the Canada Education Savings Grant (`GRANT`) and the Canada Learning Bond
 * (`CLB`). Grant received is always summed from these credits, never
 * assumed from a percentage of contributions -- CESG is generally 20% of
 * contributions up to an annual limit with unused grant room carrying
 * forward, so a contribution-based estimate would not match what was
 * actually paid.
 */
const GRANT_ACTIVITY_CODES = new Set(["GRANT", "CLB"]);

/** One wrapper's lifetime contribution position: contributed to date (through the reporting year) against its lifetime cap. */
export interface LifetimePosition {
  contributed: number;
  cap: number;
  remaining: number;
}

/**
 * The RESP's lifetime CESG/CLB grant position, derived from activity
 * credits. `maximizingContribution` is the annual contribution that
 * attracts the maximum basic CESG in a normal (non-catch-up) year -- see
 * `RESP_GRANT_MAXIMIZING_CONTRIBUTION`. It is informational, not a cap.
 */
export interface RespGrantPosition {
  received: number;
  cap: number;
  remaining: number;
  maximizingContribution: number;
}

/**
 * One wrapper's room line for one calendar year.
 *
 * `limit` is null for RESP, which has no annual contribution limit at all
 * -- its only contribution bound is the lifetime cap in
 * `lifetimeContributions`. For every other group `limit` is either the
 * assessed figure (`assessed: true`) or the generic annual maximum
 * (`assessed: false`).
 *
 * `remaining` is populated ONLY when `assessed` is true: an assessed limit
 * already has carry-forward baked in, so `limit - used` is a real figure.
 * Against a generic annual maximum, carry-forward is unknown -- a full or
 * over-full year is not necessarily an over-contribution -- so `remaining`
 * is null rather than a number that would misread as an over-contribution
 * flag by another name. There is deliberately no `over` boolean on this
 * shape either.
 */
export interface RoomLine {
  group: RegisteredGroup;
  year: number;
  used: number;
  limit: number | null;
  assessed: boolean;
  remaining: number | null;
  /**
   * RRSP only: the slice of `used` contributed to a spousal RRSP, already
   * included in `used` (spousal contributions count against the
   * contributor's own room). Null for every other group.
   */
  spousalUsed: number | null;
  /** FHSA and RESP only, which carry a lifetime contribution cap. Null for TFSA and RRSP. */
  lifetimeContributions: LifetimePosition | null;
  /** RESP only. Null for every other group. */
  lifetimeGrant: RespGrantPosition | null;
}

function periodYear(period: string): number {
  return Number(period.slice(0, 4));
}

/** Sums `contributionsByYear[year]` across a set of accounts, treating a year with no entry as zero. */
function sumContributionsForYear(accounts: readonly AccountSeries[], year: number): number {
  let total = 0;
  for (const account of accounts) {
    total += account.contributionsByYear[String(year)] ?? 0;
  }
  return total;
}

/** Sums every calendar year's contributions up to and including `uptoYear`, for a lifetime-to-date position. */
function cumulativeContributions(accounts: readonly AccountSeries[], uptoYear: number): number {
  let total = 0;
  for (const account of accounts) {
    for (const [yearKey, amount] of Object.entries(account.contributionsByYear)) {
      if (Number(yearKey) <= uptoYear) total += amount;
    }
  }
  return total;
}

/**
 * Sums GRANT/CLB activity credits up to and including `uptoYear`, across
 * the given accounts' statements. PERFORMANCE statements are skipped --
 * they duplicate their BROKERAGE twin's activity, the same reason
 * `series.ts` drops them when building the monthly timeline, and summing
 * both would double the grant total.
 */
function grantsReceivedThrough(
  statements: readonly Statement[],
  maskedIds: ReadonlySet<string>,
  uptoYear: number,
): number {
  let total = 0;
  for (const s of statements) {
    if (s.source.template === "PERFORMANCE") continue;
    if (!maskedIds.has(s.source.accountNo)) continue;
    if (periodYear(s.source.period) > uptoYear) continue;
    for (const row of s.activity) {
      if (GRANT_ACTIVITY_CODES.has(row.code)) total += row.credit;
    }
  }
  return total;
}

/**
 * Resolves one group/year's limit: the assessed figure when one exists for
 * that exact year (never a nearby year -- an assessed figure for 2026 must
 * not leak into 2025's line), otherwise the generic annual maximum. Throws
 * when neither table has an entry, since reporting a silent zero would
 * understate room rather than surface the gap. Never called for RESP,
 * which has no annual limit -- see `buildRespLine`.
 */
function resolveLimit(group: RegisteredGroup, year: number): { limit: number; assessed: boolean } {
  const assessedFigure = ASSESSED_ROOM[group]?.[year];
  if (assessedFigure !== undefined) {
    return { limit: assessedFigure, assessed: true };
  }
  const generic = CONTRIBUTION_LIMITS[group]?.[year];
  if (generic === undefined) {
    throw new Error(`no contribution limit configured for ${group} ${year}`);
  }
  return { limit: generic, assessed: false };
}

function buildLifetimeContributions(
  accounts: readonly AccountSeries[],
  year: number,
  cap: number,
): LifetimePosition {
  const contributed = cumulativeContributions(accounts, year);
  return { contributed, cap, remaining: cap - contributed };
}

function buildLifetimeGrant(
  statements: readonly Statement[],
  maskedIds: ReadonlySet<string>,
  year: number,
): RespGrantPosition {
  const received = grantsReceivedThrough(statements, maskedIds, year);
  return {
    received,
    cap: RESP_LIFETIME_GRANT_CAP,
    remaining: RESP_LIFETIME_GRANT_CAP - received,
    maximizingContribution: RESP_GRANT_MAXIMIZING_CONTRIBUTION,
  };
}

/**
 * RESP has no annual contribution limit -- its only contribution bound is
 * the $50,000 lifetime cap, reported via `lifetimeContributions`. `limit`,
 * `assessed` and `remaining` stay null/false rather than repurposing the
 * $2,500 grant-maximizing contribution as a fake annual ceiling, which is
 * exactly the conflation that produced a false "over-contributed" reading.
 */
function buildRespLine(
  year: number,
  accounts: readonly AccountSeries[],
  statements: readonly Statement[],
): RoomLine {
  const lifetimeCap = LIFETIME_CONTRIBUTION_CAPS.RESP;
  if (lifetimeCap === undefined) throw new Error("RESP lifetime contribution cap not configured");
  const maskedIds = new Set(accounts.map((a) => a.maskedId));

  return {
    group: "RESP",
    year,
    used: sumContributionsForYear(accounts, year),
    limit: null,
    assessed: false,
    remaining: null,
    spousalUsed: null,
    lifetimeContributions: buildLifetimeContributions(accounts, year, lifetimeCap),
    lifetimeGrant: buildLifetimeGrant(statements, maskedIds, year),
  };
}

/**
 * TFSA, RRSP and FHSA: an annual limit against `used`, either assessed
 * (real, carry-forward-inclusive -- `remaining` is a real number) or
 * generic (carry-forward unknown -- `remaining` stays null, see `RoomLine`).
 */
function buildAnnualLine(
  group: Exclude<RegisteredGroup, "RESP">,
  year: number,
  accounts: readonly AccountSeries[],
): RoomLine {
  const used = sumContributionsForYear(accounts, year);
  const spousalUsed =
    group === "RRSP"
      ? sumContributionsForYear(
          accounts.filter((a) => a.kind === "SpousalRRSP"),
          year,
        )
      : null;
  const { limit, assessed } = resolveLimit(group, year);

  const lifetimeCap = LIFETIME_CONTRIBUTION_CAPS[group];
  const lifetimeContributions =
    lifetimeCap === undefined ? null : buildLifetimeContributions(accounts, year, lifetimeCap);

  return {
    group,
    year,
    used,
    limit,
    assessed,
    remaining: assessed ? limit - used : null,
    spousalUsed,
    lifetimeContributions,
    lifetimeGrant: null,
  };
}

function buildLine(
  group: RegisteredGroup,
  year: number,
  accounts: readonly AccountSeries[],
  statements: readonly Statement[],
): RoomLine {
  return group === "RESP"
    ? buildRespLine(year, accounts, statements)
    : buildAnnualLine(group, year, accounts);
}

/**
 * One `RoomLine` per registered group that has at least one account in
 * `series`, for the given calendar `year`. A group with no accounts (for
 * example a person with no FHSA) is simply absent, rather than reported at
 * zero, since a zero used-against-zero-accounts line would read as a real
 * position.
 *
 * `statements` is only consulted for the RESP grant position -- it is not
 * read off `AccountSeries.months`, which does not yet carry a populated
 * `grants` figure.
 */
export function buildRoomLines(
  series: readonly AccountSeries[],
  statements: readonly Statement[],
  year: number,
): RoomLine[] {
  const lines: RoomLine[] = [];
  for (const group of REGISTERED_GROUPS) {
    const kinds = REGISTERED_KINDS[group];
    const accounts = series.filter((s) => kinds.includes(s.kind));
    if (accounts.length === 0) continue;
    lines.push(buildLine(group, year, accounts, statements));
  }
  return lines;
}
