import { describe, expect, test } from "bun:test";
import { projectYears } from "../projection/engine";
import { projectionInputs } from "../projection/inputs";
import { loadAnalytics } from "../ui/data";
import { GOALS } from "./config";
import type { Goal } from "./config";
import { contributionToClose, evaluateGoal } from "./evaluate";

const analytics = loadAnalytics();
const rows6 = projectYears(projectionInputs(analytics, { returnRate: 0.06 }));

const houseGoal = GOALS[0];
if (houseGoal === undefined) throw new Error("GOALS is missing the house entry");
const educationGoal = GOALS[1];
if (educationGoal === undefined) throw new Error("GOALS is missing the education entry");

describe("evaluateGoal, the two shipped goals against the real corpus", () => {
  test("the house goal clears its 40,000 target in 2028", () => {
    const v = evaluateGoal(houseGoal, analytics, rows6, 0.06, "2039");
    expect(v.projected).toBeCloseTo(50180.1, 2);
    expect(v.gap).toBeCloseTo(10180.1, 2);
    expect(v.monthlyToClose).toBeNull();
    expect(v.blocked).toBeNull();
  });

  test("the education goal clears its 50,000 target in 2042", () => {
    const v = evaluateGoal(educationGoal, analytics, rows6, 0.06, "2039");
    expect(v.projected).toBeCloseTo(92547.67, 2);
    expect(v.gap).toBeGreaterThan(0);
    expect(v.monthlyToClose).toBeNull();
    expect(v.blocked).toBeNull();
  });
});

// Both shipped goals are met at every return rate the slider offers: the
// FHSA holds $28,295.25 today with $16,000 of lifetime room left, clearing
// $40,000 by 2028 even at 0% return, and the RESP clears $50,000 with room
// to spare. The corpus therefore cannot reach the shortfall branch below --
// every test in this block raises a goal's target past what the real
// projection can deliver, on purpose, the way phase 2c's task 8 declared
// its RESP fixture rather than claiming a corpus kill it did not have.
describe("evaluateGoal, the shortfall solve -- fixture only, the corpus cannot reach it", () => {
  test("a shortfall solves to a contribution that, fed back, lands on the target", () => {
    const stretch: Goal = { ...houseGoal, id: "stretch", target: 90000 };
    const v = evaluateGoal(stretch, analytics, rows6, 0.06, "2039");
    expect(v.gap).toBeLessThan(0);

    // The house goal's account is the FHSA, and its lifetime room is fully
    // used by baseline contributions before 2028 regardless of the extra
    // amount asked for -- see the "blocked" test below. `monthlyToClose` is
    // therefore null here too, so this test reads the arithmetic off the
    // exported `contributionToClose` directly, the same figure the card
    // would print if the wrapper had room.
    const years = 2028 - 2026 + 1;
    const annual = contributionToClose(v.gap ?? 0, years, 0.06);
    const grown = (annual * (1.06 ** years - 1)) / 0.06;
    expect((v.projected ?? 0) + grown).toBeCloseTo(90000, 2);
  });

  // `engine.ts`'s room schedule (contributions and `roomRemaining`) does not
  // depend on `returnRate` at all -- only the compounded `value` does. So the
  // FHSA's lifetime room is exhausted by 2028 in a 0% projection exactly as
  // it is at 6%, and this shortfall is room-blocked here too. What this test
  // actually verifies is the arithmetic itself: `contributionToClose` stays
  // finite at `rate` of exactly 0, where the textbook growth-factor formula
  // would divide by zero.
  test("a zero return rate solves without dividing by zero", () => {
    const stretch: Goal = { ...houseGoal, id: "stretch", target: 90000 };
    const rows0 = projectYears(projectionInputs(analytics, { returnRate: 0 }));
    const v = evaluateGoal(stretch, analytics, rows0, 0, "2039");
    expect(v.gap).toBeLessThan(0);
    const years = 2028 - 2026 + 1;
    expect(Number.isFinite(contributionToClose(v.gap ?? 0, years, 0))).toBe(true);
  });

  test("a shortfall the wrapper has no room to close is blocked with a reason", () => {
    const stretch: Goal = { ...houseGoal, id: "stretch", target: 90000 };
    const v = evaluateGoal(stretch, analytics, rows6, 0.06, "2039");
    expect(v.blocked).toContain("room");
    expect(v.monthlyToClose).toBeNull();
  });
});

describe("evaluateGoal, the null cases -- never a rendered zero", () => {
  test("a scope covering no projected account is unprojectable, not zero", () => {
    const g: Goal = { ...houseGoal, id: "x", scope: { kind: "purpose", purpose: "spending" } };
    const v = evaluateGoal(g, analytics, rows6, 0.06, "2039");
    expect(v.projected).toBeNull();
    expect(v.gap).toBeNull();
    expect(v.monthlyToClose).toBeNull();
  });

  test("a target year past the projection's last row is unprojectable, not clamped", () => {
    const g: Goal = { ...houseGoal, id: "x", by: "2099" };
    const v = evaluateGoal(g, analytics, rows6, 0.06, "2039");
    expect(v.projected).toBeNull();
  });
});

// Corporate has no CRA contribution room -- `engine.ts` reports its
// `roomRemaining` as a flat 0 because there is nothing to report, not
// because the wrapper is capped. A room check that read that 0 the same way
// it reads TFSA/RRSP/FHSA/RESP's 0 would falsely block the one wrapper CRA
// places no ceiling on. Fixture only: no shipped goal scopes to Corporate.
describe("evaluateGoal, Corporate has no CRA room to exhaust", () => {
  test("a corporate-scoped shortfall is never blocked for lack of room", () => {
    if (analytics.series.every((a) => a.shortId !== "91b8")) {
      throw new Error("fixture base account 91b8 missing from corpus");
    }
    const goal: Goal = {
      id: "corp-stretch",
      label: "Corporate stretch",
      scope: { kind: "groups", groups: ["Corporate"] },
      target: 1_000_000,
      by: "2030",
      source: "fixture",
    };
    const v = evaluateGoal(goal, analytics, rows6, 0.06, "2039");
    expect(v.gap).toBeLessThan(0);
    expect(v.blocked).toBeNull();
    expect(v.monthlyToClose).not.toBeNull();
  });
});
