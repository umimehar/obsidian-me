import { describe, expect, test } from "bun:test";
import { formatCurrency } from "../ui/format";
import { contributionDeadline, nextAction } from "./contributionPlan";
import type { RoomLine } from "./rooms";

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

  test("TFSA, FHSA and RESP all close December 31 of the year itself", () => {
    expect(contributionDeadline("TFSA", 2026)).toBe("2026-12-31");
    expect(contributionDeadline("FHSA", 2026)).toBe("2026-12-31");
    expect(contributionDeadline("RESP", 2026)).toBe("2026-12-31");
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

  test("FHSA states the annual room left and the lifetime remaining", () => {
    const line = roomLine({
      group: "FHSA",
      year: 2026,
      used: 8000,
      limit: 8000,
      remaining: null,
      lifetimeContributions: { contributed: 24000, cap: 40000, remaining: 16000 },
    });
    const action = nextAction(line);
    expect(action.amount).toBe(0);
    expect(action.text).toContain(formatCurrency(16000));
    expect(action.text).toContain("2026-12-31");
  });

  test("RESP under the grant maximizing contribution states the gap", () => {
    const line = roomLine({ group: "RESP", year: 2026, used: 1000, limit: null, remaining: null });
    const action = nextAction(line);
    expect(action.amount).toBe(1500);
    expect(action.text).toBe(
      `${formatCurrency(1500)} more by December 31 earns this year's full $500 grant.`,
    );
  });

  test("RESP at or above the grant maximizing contribution says the grant is covered", () => {
    const line = roomLine({ group: "RESP", year: 2026, used: 3000, limit: null, remaining: null });
    const action = nextAction(line);
    expect(action.amount).toBeNull();
    expect(action.text).toBe("This year's full basic grant is covered.");
  });
});
