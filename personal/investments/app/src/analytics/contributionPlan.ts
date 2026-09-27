import { formatCurrency } from "../ui/format";
import type { RegisteredGroup, RoomLine } from "./rooms";

/** The `n`th day of `year` (1 indexed), as an ISO date -- leap years fall out of `Date` arithmetic rather than a table. */
function nthDayOfYear(year: number, n: number): string {
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() + (n - 1));
  return date.toISOString().slice(0, 10);
}

/** A CRA deadline that lands on a weekend moves to the next business day: Saturday forward two days, Sunday forward one. No statutory holiday table -- weekends are the one rule stated everywhere the deadline is published. */
function rollPastWeekend(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  else if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The CRA deadline for a contribution to count against `year`, rolled past
 * a weekend. RRSP gets the first 60 days of the following year (2027-03-01
 * for 2026, 2028-02-29 for 2027 -- a leap year, and 2026-03-02 for 2025,
 * since 2026-03-01 falls on a Sunday); TFSA, FHSA and RESP all close on
 * December 31 of the year itself.
 */
export function contributionDeadline(group: RegisteredGroup, year: number): string {
  const raw = group === "RRSP" ? nthDayOfYear(year + 1, 60) : `${year}-12-31`;
  return rollPastWeekend(raw);
}

export interface NextAction {
  group: RegisteredGroup;
  text: string;
  amount: number | null;
  deadline: string;
}

/** The generic case a wrapper falls back to before it has an assessed limit: no real remaining figure to state at all. */
function unassessedAction(group: RegisteredGroup, deadline: string): NextAction {
  return {
    group,
    deadline,
    amount: null,
    text: `Add your assessed ${group} room to see what is left.`,
  };
}

function rrspAction(line: RoomLine, deadline: string): NextAction {
  if (!line.assessed) return unassessedAction("RRSP", deadline);
  if (line.remaining !== null && line.remaining > 0) {
    return {
      group: "RRSP",
      deadline,
      amount: line.remaining,
      text: `Up to ${formatCurrency(line.remaining)} more can be deducted against ${line.year} income, by ${deadline}.`,
    };
  }
  return {
    group: "RRSP",
    deadline,
    amount: null,
    text: `The full assessed ${line.year} RRSP room is used.`,
  };
}

function tfsaAction(line: RoomLine, deadline: string): NextAction {
  if (!line.assessed) return unassessedAction("TFSA", deadline);
  if (line.remaining !== null && line.remaining > 0) {
    return {
      group: "TFSA",
      deadline,
      amount: line.remaining,
      text: `Up to ${formatCurrency(line.remaining)} more can be contributed by ${deadline}.`,
    };
  }
  return {
    group: "TFSA",
    deadline,
    amount: null,
    text: `The full assessed ${line.year} TFSA room is used.`,
  };
}

/**
 * The lifetime remaining, stated purely as context for future years -- never
 * glued to this year's deadline, which is what let a reader mistake
 * $16,000 of LIFETIME room for something owed by December 31.
 */
function lifetimeContext(lifetimeRemaining: number | null): string {
  return lifetimeRemaining === null
    ? ""
    : ` ${formatCurrency(lifetimeRemaining)} of lifetime room remains for future years.`;
}

/**
 * FHSA states the annual room against this year's deadline, and the
 * lifetime cap as a separate sentence with no deadline attached to it --
 * lifetime room is not something due by December 31, only the annual
 * figure is.
 */
function fhsaAction(line: RoomLine, deadline: string): NextAction {
  const annualRemaining = line.limit !== null ? line.limit - line.used : null;
  const context = lifetimeContext(line.lifetimeContributions?.remaining ?? null);

  if (annualRemaining !== null && annualRemaining > 0) {
    return {
      group: "FHSA",
      deadline,
      amount: annualRemaining,
      text: `${formatCurrency(annualRemaining)} left this year, by ${deadline}.${context}`,
    };
  }

  return {
    group: "FHSA",
    deadline,
    amount: null,
    text: `This year's FHSA room is used.${context}`,
  };
}

/**
 * The CRA catch-up provision: contributing twice the basic maximizing
 * amount in one year attracts twice the basic grant, when unused room has
 * carried forward from prior years. Derived from `maximizingContribution`
 * rather than a second hand typed pair of figures.
 */
const CESG_CATCHUP_MULTIPLE = 2;
const CESG_RATE = 0.2;

function respAction(line: RoomLine, deadline: string): NextAction {
  const grant = line.lifetimeGrant;
  if (grant === null) throw new Error("RESP room line missing its lifetime grant position");

  if (grant.remaining <= 0) {
    return {
      group: "RESP",
      deadline,
      amount: null,
      text: `The ${formatCurrency(grant.cap)} lifetime CESG cap has been reached; no further grant will be paid.`,
    };
  }

  const basicGrant = grant.maximizingContribution * CESG_RATE;
  // Carry forward exists whenever more than a single ordinary year's room
  // remains; the exact figure needs the beneficiary's date of birth, which
  // this room line does not carry.
  const carryForward =
    grant.remaining > basicGrant
      ? ` Unused grant room may have carried forward from prior years: contributing up to ${formatCurrency(
          grant.maximizingContribution * CESG_CATCHUP_MULTIPLE,
        )} this year could attract up to ${formatCurrency(
          basicGrant * CESG_CATCHUP_MULTIPLE,
        )} of grant, but this planner cannot confirm the exact carry forward without a date of birth.`
      : "";

  const gap = grant.maximizingContribution - line.used;
  if (gap > 0) {
    return {
      group: "RESP",
      deadline,
      amount: gap,
      text: `${formatCurrency(gap)} more by December 31 earns this year's full ${formatCurrency(basicGrant)} grant.${carryForward}`,
    };
  }
  return {
    group: "RESP",
    deadline,
    amount: null,
    text: `This year's full basic grant is covered.${carryForward}`,
  };
}

/** One registered wrapper's room line, turned into the one thing to do about it next: how much, by when, in words. */
export function nextAction(line: RoomLine): NextAction {
  const deadline = contributionDeadline(line.group, line.year);
  switch (line.group) {
    case "RRSP":
      return rrspAction(line, deadline);
    case "TFSA":
      return tfsaAction(line, deadline);
    case "FHSA":
      return fhsaAction(line, deadline);
    case "RESP":
      return respAction(line, deadline);
    default: {
      const exhaustive: never = line.group;
      throw new Error(`unhandled registered group: ${exhaustive}`);
    }
  }
}
