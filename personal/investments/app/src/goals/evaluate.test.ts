import { describe, expect, test } from "bun:test";
import { GOLDENS } from "../goldens";
import { projectYears } from "../projection/engine";
import { projectionInputs } from "../projection/inputs";
import { loadAnalytics } from "../ui/data";
import {
  CORPORATE_GOAL,
  EDUCATION_GOAL,
  GOLDEN_GOALS,
  HOUSE_GOAL,
  STRETCH_GOAL,
} from "./__fixtures__/goals";
import type { Goal } from "./config";
import { contributionToClose, evaluateGoal } from "./evaluate";

const analytics = loadAnalytics();
const rows6 = projectYears(projectionInputs(analytics, { returnRate: 0.06 }));
const CLOSE_YEAR = GOLDENS.projection.fhsaCloseYear;

const houseGoal = HOUSE_GOAL;
const educationGoal = EDUCATION_GOAL;

/** The recorded verdict for one goal, or a throw naming the missing entry. */
function golden(id: string) {
  const found = GOLDENS.goals[id];
  if (!found) throw new Error(`no goal golden for ${id}; run bun run goldens`);
  return found;
}

describe("evaluateGoal, every golden goal against the real corpus", () => {
  // Parameterised over the whole set rather than written out per goal: a
  // goal added to GOLDEN_GOALS is then covered by construction, and cannot
  // reach the goldens file without also being asserted here.
  for (const goal of GOLDEN_GOALS) {
    test(`${goal.id} matches its recorded verdict`, () => {
      const v = evaluateGoal(goal, analytics, rows6, 0.06, CLOSE_YEAR);
      const g = golden(goal.id);
      expect(v.projected).toBeCloseTo(g.projected ?? Number.NaN, 2);
      expect(v.gap).toBeCloseTo(g.gap ?? Number.NaN, 2);
      expect(v.blocked).toBe(g.blocked);
      expect(v.coverage.covered.length).toBe(g.coveredCount);
      expect(v.coverage.uncovered.length).toBe(g.uncoveredCount);
      if (g.monthlyToClose === null) {
        expect(v.monthlyToClose).toBeNull();
      } else {
        expect(v.monthlyToClose).toBeCloseTo(g.monthlyToClose, 2);
      }
      // The gap is the projection less the target, never a third figure.
      expect(v.gap).toBeCloseTo((v.projected ?? 0) - goal.target, 6);
    });
  }

  test("both shipped goals clear their targets, with no shortfall to solve", () => {
    for (const goal of [houseGoal, educationGoal]) {
      const v = evaluateGoal(goal, analytics, rows6, 0.06, CLOSE_YEAR);
      expect(v.gap).toBeGreaterThan(0);
      expect(v.monthlyToClose).toBeNull();
      expect(v.blocked).toBeNull();
    }
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
    const v = evaluateGoal(stretch, analytics, rows6, 0.06, CLOSE_YEAR);
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
    const rows0 = projectYears(projectionInputs(analytics, { returnRate: 0 }));
    const v = evaluateGoal(STRETCH_GOAL, analytics, rows0, 0, CLOSE_YEAR);
    expect(v.gap).toBeLessThan(0);
    const years = Number(STRETCH_GOAL.by) - GOLDENS.income.year + 1;
    expect(contributionToClose(v.gap ?? 0, years, 0)).toBeCloseTo(
      GOLDENS.zeroRateStretchAnnualToClose,
      2,
    );
  });

  test("a shortfall the wrapper has no room to close is blocked with a reason", () => {
    const v = evaluateGoal(STRETCH_GOAL, analytics, rows6, 0.06, CLOSE_YEAR);
    expect(v.blocked).toContain("room");
    expect(v.monthlyToClose).toBeNull();
  });
});

describe("evaluateGoal, the null cases -- never a rendered zero", () => {
  test("a scope covering no projected account is unprojectable, not zero", () => {
    const g: Goal = { ...houseGoal, id: "x", scope: { kind: "purpose", purpose: "spending" } };
    const v = evaluateGoal(g, analytics, rows6, 0.06, CLOSE_YEAR);
    expect(v.projected).toBeNull();
    expect(v.gap).toBeNull();
    expect(v.monthlyToClose).toBeNull();
  });

  test("a target year past the projection's last row is unprojectable, not clamped", () => {
    const g: Goal = { ...houseGoal, id: "x", by: "2099" };
    const v = evaluateGoal(g, analytics, rows6, 0.06, CLOSE_YEAR);
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
    const v = evaluateGoal(CORPORATE_GOAL, analytics, rows6, 0.06, CLOSE_YEAR);
    expect(v.gap).toBeCloseTo(golden("corp-stretch").gap ?? Number.NaN, 2);
    expect(v.blocked).toBeNull();
    expect(v.monthlyToClose).toBeCloseTo(golden("corp-stretch").monthlyToClose ?? Number.NaN, 2);
  });
});
