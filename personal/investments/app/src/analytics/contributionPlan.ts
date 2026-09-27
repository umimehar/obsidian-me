import { formatCurrency } from "../ui/format";
import type { RegisteredGroup, RoomLine } from "./rooms";

/** The `n`th day of `year` (1 indexed), as an ISO date -- leap years fall out of `Date` arithmetic rather than a table. */
function nthDayOfYear(year: number, n: number): string {
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() + (n - 1));
  const iso = date.toISOString().slice(0, 10);
  return iso;
}

/**
 * The CRA deadline for a contribution to count against `year`. RRSP gets the
 * first 60 days of the following year (2027-03-01 for 2026, 2028-02-29 for
 * 2027 -- a leap year); TFSA, FHSA and RESP all close on December 31 of the
 * year itself.
 */
export function contributionDeadline(group: RegisteredGroup, year: number): string {
  if (group === "RRSP") return nthDayOfYear(year + 1, 60);
  return `${year}-12-31`;
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

/** FHSA states two remainings at once: this year's annual room, and the lifetime cap that bounds it. */
function fhsaAction(line: RoomLine, deadline: string): NextAction {
  const annualRemaining = line.limit !== null ? line.limit - line.used : null;
  const lifetimeRemaining = line.lifetimeContributions?.remaining ?? null;

  const parts: string[] = [];
  if (annualRemaining !== null && annualRemaining > 0) {
    parts.push(`${formatCurrency(annualRemaining)} left this year`);
  }
  if (lifetimeRemaining !== null) {
    parts.push(`${formatCurrency(lifetimeRemaining)} left toward the lifetime cap`);
  }

  const text =
    parts.length > 0
      ? `${parts.join(", ")}, by ${deadline}.`
      : `Contribute by ${deadline} to count against ${line.year}.`;

  return { group: "FHSA", deadline, amount: annualRemaining, text };
}

/** The RESP's basic CESG maximizes at $2,500 contributed in the year -- see `RESP_GRANT_MAXIMIZING_CONTRIBUTION` in `rooms.ts`. */
const RESP_GRANT_MAXIMIZING_CONTRIBUTION = 2500;

function respAction(line: RoomLine, deadline: string): NextAction {
  const gap = RESP_GRANT_MAXIMIZING_CONTRIBUTION - line.used;
  if (gap > 0) {
    return {
      group: "RESP",
      deadline,
      amount: gap,
      text: `${formatCurrency(gap)} more by December 31 earns this year's full $500 grant.`,
    };
  }
  return {
    group: "RESP",
    deadline,
    amount: null,
    text: "This year's full basic grant is covered.",
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
