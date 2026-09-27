import type { Goal } from "../../plan";
import { loadPlan } from "../../plan";

const GOALS = loadPlan().goals;

/**
 * Goals the tests evaluate against the REAL corpus but which are not shipped
 * in `GOALS`: both shipped goals are met at every rate the slider offers, so
 * the shortfall branch, the room-blocked branch and the monthly-solve branch
 * are unreachable without raising a target past what the projection can
 * deliver.
 *
 * They live here rather than inline in each test because `bun run goldens`
 * evaluates them too. A fixture goal defined twice -- once in the generator,
 * once in the test -- is a golden that silently describes a different goal
 * from the one being asserted, which is the one way a goldens file can lie
 * without anything failing.
 */

function shipped(index: number, name: string): Goal {
  const goal = GOALS[index];
  if (goal === undefined) throw new Error(`GOALS is missing the ${name} entry`);
  return goal;
}

export const HOUSE_GOAL: Goal = shipped(0, "house");
export const EDUCATION_GOAL: Goal = shipped(1, "education");

/** The house goal with its target raised past what the FHSA's room can reach. */
export const STRETCH_GOAL: Goal = { ...HOUSE_GOAL, id: "stretch", target: 90_000 };

/**
 * Corporate has no CRA contribution room, so `engine.ts` reports its
 * `roomRemaining` as a flat 0 -- meaning "nothing to report", not "capped".
 * This is the goal that proves a room check does not read that 0 the way it
 * reads a real wrapper's exhausted 0.
 */
export const CORPORATE_GOAL: Goal = {
  id: "corp-stretch",
  label: "Corporate stretch",
  scope: { kind: "groups", groups: ["Corporate"] },
  target: 1_000_000,
  by: "2030",
  source: "fixture",
};

/** Every goal `bun run goldens` records a verdict for, shipped and fixture alike. */
export const GOLDEN_GOALS: readonly Goal[] = [
  HOUSE_GOAL,
  EDUCATION_GOAL,
  STRETCH_GOAL,
  CORPORATE_GOAL,
];
