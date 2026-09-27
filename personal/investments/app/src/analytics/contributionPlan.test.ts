import { describe, expect, test } from "bun:test";
import { formatCurrency } from "../ui/format";
import { contributionDeadline, nextAction } from "./contributionPlan";
import type { RespGrantPosition, RoomLine } from "./rooms";

function grant(over: Partial<RespGrantPosition> = {}): RespGrantPosition {
  return {
    received: 0,
    cap: 7200,
    remaining: 7200,
    maximizingContribution: 2500,
    ...over,
  };
}

function roomLine(over: Partial<RoomLine> = {}): RoomLine {
  return {
    group: "RRSP",
    year: 2026,
    used: 0,
    limit: 10000,
    assessed: true,
    remaining: 10000,
    spousalUsed: null,
    lifetimeContributions: null,
    lifetimeGrant: null,
    ...over,
  };
}

describe("contributionDeadline", () => {
  test("RRSP is the 60th day of the following year", () => {
    expect(contributionDeadline("RRSP", 2026)).toBe("2027-03-01");
  });

  test("RRSP's 60th day falls in a leap year", () => {
    expect(contributionDeadline("RRSP", 2027)).toBe("2028-02-29");
  });

  test("a deadline landing on a Sunday rolls forward to the Monday", () => {
    // 2025's RRSP deadline, the 60th day of 2026, is 2026-03-01 -- a Sunday.
    expect(contributionDeadline("RRSP", 2025)).toBe("2026-03-02");
  });

  test("TFSA, FHSA and RESP all close December 31 of the year itself", () => {
    expect(contributionDeadline("TFSA", 2026)).toBe("2026-12-31");
    expect(contributionDeadline("FHSA", 2026)).toBe("2026-12-31");
    expect(contributionDeadline("RESP", 2026)).toBe("2026-12-31");
  });

  test("TFSA, FHSA and RESP never roll December 31 into January, even on a weekend", () => {
    // 2023-12-31 and 2028-12-31 both fall on a Sunday. Only the RRSP's
    // 60th-day rule is a CRA business-day deadline; the calendar year
    // cutoff for the other three wrappers is fixed and never moves.
    for (const group of ["TFSA", "FHSA", "RESP"] as const) {
      expect(contributionDeadline(group, 2023)).toBe("2023-12-31");
      expect(contributionDeadline(group, 2028)).toBe("2028-12-31");
    }
  });
});

describe("nextAction", () => {
  test("RRSP with room remaining states the amount and the deadline", () => {
    const line = roomLine({
      group: "RRSP",
      year: 2026,
      used: 33000,
      limit: 70752,
      remaining: 37752,
    });
    const action = nextAction(line);
    expect(action.group).toBe("RRSP");
    expect(action.amount).toBe(37752);
    expect(action.deadline).toBe("2027-03-01");
    expect(action.text).toBe(
      `Up to ${formatCurrency(37752)} more can be deducted against 2026 income, by 2027-03-01.`,
    );
  });

  test("RRSP at exactly zero remaining says the room is used, not a zero amount", () => {
    const line = roomLine({ group: "RRSP", year: 2026, used: 70752, limit: 70752, remaining: 0 });
    const action = nextAction(line);
    expect(action.amount).toBeNull();
    expect(action.text).toContain("full assessed 2026 RRSP room is used");
  });

  test("an unassessed TFSA asks for the assessed figure rather than guessing", () => {
    const line = roomLine({
      group: "TFSA",
      year: 2026,
      used: 7000,
      limit: 7000,
      assessed: false,
      remaining: null,
    });
    const action = nextAction(line);
    expect(action.text).toBe("Add your assessed TFSA room to see what is left.");
    expect(action.amount).toBeNull();
    expect(action.deadline).toBe("2026-12-31");
  });

  test("FHSA with annual room left states the amount, the deadline, and the lifetime remaining as separate context", () => {
    const line = roomLine({
      group: "FHSA",
      year: 2026,
      used: 4000,
      limit: 8000,
      remaining: null,
      lifetimeContributions: { contributed: 20000, cap: 40000, remaining: 20000 },
    });
    const action = nextAction(line);
    expect(action.amount).toBe(4000);
    expect(action.text).toBe(
      `${formatCurrency(4000)} left this year, by 2026-12-31. ${formatCurrency(20000)} of lifetime room remains for future years.`,
    );
  });

  test("FHSA with the annual room used says so plainly, and never attaches the deadline to the lifetime figure", () => {
    const line = roomLine({
      group: "FHSA",
      year: 2026,
      used: 8000,
      limit: 8000,
      remaining: null,
      lifetimeContributions: { contributed: 24000, cap: 40000, remaining: 16000 },
    });
    const action = nextAction(line);
    expect(action.amount).toBeNull();
    expect(action.text).toBe(
      `This year's FHSA room is used. ${formatCurrency(16000)} of lifetime room remains for future years.`,
    );
    // The lifetime figure must never read as something owed by the annual deadline.
    expect(action.text).not.toContain("2026-12-31");
  });

  test("RESP under the grant maximizing contribution states the gap, using the line's own figure and formatCurrency throughout", () => {
    const line = roomLine({
      group: "RESP",
      year: 2026,
      used: 1000,
      limit: null,
      remaining: null,
      lifetimeGrant: grant({ maximizingContribution: 2500, remaining: 100 }),
    });
    const action = nextAction(line);
    expect(action.amount).toBe(1500);
    expect(action.text).toBe(
      `${formatCurrency(1500)} more by December 31 earns this year's full ${formatCurrency(500)} grant.`,
    );
  });

  test("RESP at or above the grant maximizing contribution says the grant is covered", () => {
    const line = roomLine({
      group: "RESP",
      year: 2026,
      used: 3000,
      limit: null,
      remaining: null,
      lifetimeGrant: grant({ maximizingContribution: 2500, remaining: 100 }),
    });
    const action = nextAction(line);
    expect(action.amount).toBeNull();
    expect(action.text).toBe("This year's full basic grant is covered.");
  });

  test("RESP with room carried forward past this year's basic amount states the catch up provision", () => {
    const line = roomLine({
      group: "RESP",
      year: 2026,
      used: 1000,
      limit: null,
      remaining: null,
      lifetimeGrant: grant({ maximizingContribution: 2500, remaining: 3000 }),
    });
    const action = nextAction(line);
    expect(action.text).toContain(formatCurrency(5000));
    expect(action.text).toContain(formatCurrency(1000));
    expect(action.text).toContain("cannot confirm the exact carry forward");
  });

  test("RESP at the lifetime CESG cap says so instead of promising a grant", () => {
    const line = roomLine({
      group: "RESP",
      year: 2026,
      used: 1000,
      limit: null,
      remaining: null,
      lifetimeGrant: grant({ received: 7200, remaining: 0 }),
    });
    const action = nextAction(line);
    expect(action.amount).toBeNull();
    expect(action.text).toBe(
      `The ${formatCurrency(7200)} lifetime CESG cap has been reached; no further grant will be paid.`,
    );
  });

  test("a RESP room line missing its lifetime grant position throws rather than guessing", () => {
    const line = roomLine({ group: "RESP", year: 2026, used: 1000, limit: null, remaining: null });
    expect(() => nextAction(line)).toThrow();
  });
});

describe("nextAction with context", () => {
  test("a year before the group's first account says so, not a next action for an account that did not exist", () => {
    const line = roomLine({ group: "TFSA", year: 2023, used: 6000, limit: 6500 });
    const action = nextAction(line, { firstYear: 2026, latestPeriod: "2026-08" });
    expect(action.text).toBe("No account yet.");
    expect(action.amount).toBeNull();
  });

  test("a year that has ended reads in the past tense, with no deadline in the text", () => {
    const line = roomLine({
      group: "TFSA",
      year: 2024,
      used: 7000,
      limit: 7000,
      assessed: true,
      remaining: 500,
    });
    const action = nextAction(line, { firstYear: 2023, latestPeriod: "2026-08" });
    expect(action.text).toBe(
      `Contributed ${formatCurrency(7000)} of ${formatCurrency(7000)}. Room left unused: ${formatCurrency(500)}.`,
    );
    expect(action.text).not.toContain("2024-12-31");
  });

  test("a RESP past year with no unused room states only what was contributed", () => {
    const line = roomLine({ group: "RESP", year: 2024, used: 2500, limit: null, remaining: null });
    const action = nextAction(line, { firstYear: 2023, latestPeriod: "2026-08" });
    expect(action.text).toBe(`Contributed ${formatCurrency(2500)}.`);
  });

  test("RRSP for last year still gives a live deadline when the corpus's latest statement predates it", () => {
    const line = roomLine({
      group: "RRSP",
      year: 2025,
      used: 15000,
      limit: 60191,
      assessed: true,
      remaining: 45191,
    });
    const action = nextAction(line, { firstYear: 2023, latestPeriod: "2026-02" });
    expect(action.deadline).toBe("2026-03-02");
    expect(action.text).toContain("can be deducted against 2025 income");
  });

  test("RRSP for last year reads past tense once a later statement proves the deadline closed", () => {
    const line = roomLine({
      group: "RRSP",
      year: 2025,
      used: 15000,
      limit: 60191,
      assessed: true,
      remaining: 45191,
    });
    const action = nextAction(line, { firstYear: 2023, latestPeriod: "2026-03" });
    expect(action.text).toBe(
      `Contributed ${formatCurrency(15000)} of ${formatCurrency(60191)}. Room left unused: ${formatCurrency(45191)}.`,
    );
  });

  test("a null latestPeriod (an empty corpus) never counts a deadline as passed", () => {
    const line = roomLine({ group: "TFSA", year: 2020, used: 5000, limit: 6000 });
    const action = nextAction(line, { firstYear: 2018, latestPeriod: null });
    expect(action.text).not.toContain("Contributed");
  });
});
