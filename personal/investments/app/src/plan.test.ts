import { describe, expect, test } from "bun:test";
import { loadPlan, parsePlan, retirementYear } from "./plan";

const VALID = {
  birthYear: 1997,
  retirementAge: 60,
  inflation: 0.025,
  withdrawalRate: 0.04,
  goals: [
    {
      id: "house",
      label: "House down payment",
      scope: { kind: "purpose", purpose: "house" },
      target: 40000,
      by: "2028",
      source: "Test fixture.",
    },
  ],
};

describe("parsePlan", () => {
  test("parses a well formed plan", () => {
    const plan = parsePlan(VALID);
    expect(plan.birthYear).toBe(1997);
    expect(plan.retirementAge).toBe(60);
    expect(plan.inflation).toBe(0.025);
    expect(plan.withdrawalRate).toBe(0.04);
    expect(plan.goals).toHaveLength(1);
    expect(plan.goals[0]?.id).toBe("house");
  });

  test("throws naming a missing field", () => {
    const { inflation: _inflation, ...rest } = VALID;
    expect(() => parsePlan(rest)).toThrow(/inflation/);
  });

  test("throws naming a bad goal field", () => {
    const bad = { ...VALID, goals: [{ ...VALID.goals[0], target: "lots" }] };
    expect(() => parsePlan(bad)).toThrow(/goals\[0\]\.target/);
  });

  test("throws on a non object payload", () => {
    expect(() => parsePlan(null)).toThrow(/plan\.json/);
    expect(() => parsePlan("nope")).toThrow(/plan\.json/);
  });

  test("throws when goals is not an array", () => {
    expect(() => parsePlan({ ...VALID, goals: "nope" })).toThrow(/goals/);
  });
});

describe("loadPlan, the committed file", () => {
  test("parses without throwing and carries both goals", () => {
    const plan = loadPlan();
    expect(plan.goals.map((g) => g.id)).toEqual(["house", "education"]);
    expect(plan.birthYear).toBe(1997);
    expect(plan.retirementAge).toBe(60);
  });
});

describe("retirementYear", () => {
  test("is birth year plus retirement age", () => {
    expect(retirementYear(parsePlan(VALID))).toBe(2057);
  });
});
