import { describe, expect, test } from "bun:test";
import { loadPlan, parsePlan, retirementYear } from "./plan";

const VALID_STRATEGY = {
  decided: "2026-10-01",
  directIndexing: {
    account: "Non-registered 1f9a",
    targets: [
      { sleeve: "U.S. Market Index", share: 0.7 },
      { sleeve: "U.S. Innovation Index", share: 0.3 },
    ],
    fillTarget: 15250,
    note: "Test fixture.",
  },
  payroll: [
    {
      id: "phase-1",
      label: "Now",
      from: "2026-10-01",
      to: "2026-10-31",
      automations: [{ target: "Savings", amount: 500 }],
      note: "Test fixture.",
    },
    {
      id: "phase-2",
      label: "Later",
      from: "2026-11-01",
      to: null,
      automations: [{ target: "Savings", amount: 600 }],
      note: "Test fixture.",
    },
  ],
  rrsp: {
    year: 2026,
    estimatedIncome: 235000,
    contributedToDate: 42000,
    contributedAsOf: "2026-10-01",
    deductionTarget: 53500,
    bracketTop: 181440,
    note: "Test fixture.",
  },
  watch: [
    {
      label: "No purchases",
      through: "2026-11-01",
      note: "Test fixture.",
    },
  ],
};

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
  strategy: VALID_STRATEGY,
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

  test("throws naming a goal scope with an unknown purpose", () => {
    const bad = {
      ...VALID,
      goals: [{ ...VALID.goals[0], scope: { kind: "purpose", purpose: "vacation" } }],
    };
    expect(() => parsePlan(bad)).toThrow(/goals\[0\]\.scope\.purpose/);
  });

  test("throws naming a goal scope with an unknown group", () => {
    const bad = {
      ...VALID,
      goals: [{ ...VALID.goals[0], scope: { kind: "groups", groups: ["RRSP", "Chequing"] } }],
    };
    expect(() => parsePlan(bad)).toThrow(/goals\[0\]\.scope\.groups\[1\]/);
  });

  test("throws naming a goal scope with an unknown kind", () => {
    const bad = { ...VALID, goals: [{ ...VALID.goals[0], scope: { kind: "everything" } }] };
    expect(() => parsePlan(bad)).toThrow(/goals\[0\]\.scope\.kind/);
  });

  test("accepts a portfolio scope, which carries nothing else", () => {
    const ok = { ...VALID, goals: [{ ...VALID.goals[0], scope: { kind: "portfolio" } }] };
    expect(parsePlan(ok).goals[0]?.scope).toEqual({ kind: "portfolio" });
  });

  test.each([
    ["retirementAge", 20],
    ["retirementAge", 90],
    ["inflation", 0.3],
    ["inflation", -0.01],
    ["withdrawalRate", 0.5],
    ["birthYear", 2200],
    ["birthYear", 1800],
  ] as const)("throws naming %s out of its plausible range (%d)", (field, value) => {
    expect(() => parsePlan({ ...VALID, [field]: value })).toThrow(new RegExp(field));
  });

  test("accepts the edges of each range", () => {
    const edges = {
      ...VALID,
      retirementAge: 30,
      inflation: 0.2,
      withdrawalRate: 0,
      birthYear: 1900,
    };
    expect(() => parsePlan(edges)).not.toThrow();
  });
});

describe("parsePlan, strategy", () => {
  test("parses the strategy fixture", () => {
    const plan = parsePlan(VALID);
    expect(plan.strategy.decided).toBe("2026-10-01");
    expect(plan.strategy.directIndexing.account).toBe("Non-registered 1f9a");
    expect(plan.strategy.payroll).toHaveLength(2);
    expect(plan.strategy.rrsp.year).toBe(2026);
    expect(plan.strategy.watch).toHaveLength(1);
  });

  test("throws when strategy is missing or not an object", () => {
    const { strategy: _strategy, ...rest } = VALID;
    expect(() => parsePlan(rest)).toThrow(/strategy/);
    expect(() => parsePlan({ ...VALID, strategy: "nope" })).toThrow(/strategy/);
  });

  test("throws naming a badly formed decided date", () => {
    const bad = { ...VALID, strategy: { ...VALID_STRATEGY, decided: "Oct 1" } };
    expect(() => parsePlan(bad)).toThrow(/strategy\.decided/);
  });

  test("throws naming an impossible calendar date", () => {
    const bad = { ...VALID, strategy: { ...VALID_STRATEGY, decided: "2026-13-40" } };
    expect(() => parsePlan(bad)).toThrow(/strategy\.decided/);
  });

  test("throws when directIndexing targets is empty", () => {
    const bad = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        directIndexing: { ...VALID_STRATEGY.directIndexing, targets: [] },
      },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.directIndexing\.targets/);
  });

  test("throws when directIndexing targets shares do not sum to 1", () => {
    const bad = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        directIndexing: {
          ...VALID_STRATEGY.directIndexing,
          targets: [{ sleeve: "Only one", share: 0.5 }],
        },
      },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.directIndexing\.targets/);
  });

  test("throws naming a share of 0 or above 1", () => {
    const zero = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        directIndexing: {
          ...VALID_STRATEGY.directIndexing,
          targets: [
            { sleeve: "A", share: 0 },
            { sleeve: "B", share: 1 },
          ],
        },
      },
    };
    expect(() => parsePlan(zero)).toThrow(/strategy\.directIndexing\.targets\[0\]\.share/);
  });

  test("throws naming a negative fillTarget", () => {
    const bad = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        directIndexing: { ...VALID_STRATEGY.directIndexing, fillTarget: -1 },
      },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.directIndexing\.fillTarget/);
  });

  test("throws when payroll is empty", () => {
    const bad = { ...VALID, strategy: { ...VALID_STRATEGY, payroll: [] } };
    expect(() => parsePlan(bad)).toThrow(/strategy\.payroll/);
  });

  test("throws when a payroll phase's automations is empty", () => {
    const bad = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        payroll: [{ ...VALID_STRATEGY.payroll[0], automations: [] }],
      },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.payroll\[0\]\.automations/);
  });

  test("throws naming a non positive automation amount", () => {
    const bad = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        payroll: [
          { ...VALID_STRATEGY.payroll[0], automations: [{ target: "Savings", amount: 0 }] },
        ],
      },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.payroll\[0\]\.automations\[0\]\.amount/);
  });

  test("throws when payroll phases are out of ascending from order", () => {
    const bad = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        payroll: [VALID_STRATEGY.payroll[1], VALID_STRATEGY.payroll[0]],
      },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.payroll\[1\]\.from/);
  });

  test("throws when payroll phases overlap", () => {
    const bad = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        payroll: [{ ...VALID_STRATEGY.payroll[0], to: "2026-11-15" }, VALID_STRATEGY.payroll[1]],
      },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.payroll\[0\]\.to/);
  });

  test("throws when a non-final phase is left open ended", () => {
    const bad = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        payroll: [{ ...VALID_STRATEGY.payroll[0], to: null }, VALID_STRATEGY.payroll[1]],
      },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.payroll\[0\]\.to/);
  });

  test("throws naming a non integer rrsp year", () => {
    const bad = {
      ...VALID,
      strategy: { ...VALID_STRATEGY, rrsp: { ...VALID_STRATEGY.rrsp, year: 2026.5 } },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.rrsp\.year/);
  });

  test("throws naming a negative rrsp figure", () => {
    const bad = {
      ...VALID,
      strategy: { ...VALID_STRATEGY, rrsp: { ...VALID_STRATEGY.rrsp, deductionTarget: -1 } },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.rrsp\.deductionTarget/);
  });

  test("throws naming a badly formed rrsp contributedAsOf date", () => {
    const bad = {
      ...VALID,
      strategy: {
        ...VALID_STRATEGY,
        rrsp: { ...VALID_STRATEGY.rrsp, contributedAsOf: "not a date" },
      },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.rrsp\.contributedAsOf/);
  });

  test("accepts an empty watch list", () => {
    const ok = { ...VALID, strategy: { ...VALID_STRATEGY, watch: [] } };
    expect(parsePlan(ok).strategy.watch).toEqual([]);
  });

  test("throws when watch is not an array", () => {
    const bad = { ...VALID, strategy: { ...VALID_STRATEGY, watch: "nope" } };
    expect(() => parsePlan(bad)).toThrow(/strategy\.watch/);
  });

  test("throws naming a badly formed watch through date", () => {
    const bad = {
      ...VALID,
      strategy: { ...VALID_STRATEGY, watch: [{ ...VALID_STRATEGY.watch[0], through: "nope" }] },
    };
    expect(() => parsePlan(bad)).toThrow(/strategy\.watch\[0\]\.through/);
  });
});

describe("loadPlan, the committed file", () => {
  test("parses without throwing and carries both goals", () => {
    const plan = loadPlan();
    expect(plan.goals.map((g) => g.id)).toEqual(["house", "education"]);
    expect(plan.birthYear).toBe(1997);
    expect(plan.retirementAge).toBe(60);
  });

  test("parses the committed strategy", () => {
    const plan = loadPlan();
    expect(plan.strategy.decided).toBe("2026-10-01");
    expect(plan.strategy.payroll.length).toBeGreaterThan(0);
    expect(plan.strategy.rrsp.year).toBe(2026);
  });
});

describe("retirementYear", () => {
  test("is birth year plus retirement age", () => {
    expect(retirementYear(parsePlan(VALID))).toBe(2057);
  });
});
