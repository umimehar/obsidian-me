import raw from "@data/plan.json";
import type { GoalScope } from "./goals/scope";

/**
 * A goal to project the corpus against: a target, a year and the scope of
 * accounts it applies to. Moved from `goals/config.ts` into this file
 * unchanged, so the owner's assumptions and the goals they imply live
 * together in one committed plan rather than half in code.
 */
export interface Goal {
  id: string;
  label: string;
  scope: GoalScope;
  target: number;
  by: string;
  /** Where the target and the year came from. Rendered, never decorative. */
  source: string;
}

/** The owner's retirement assumptions and the goals the projection evaluates. */
export interface Plan {
  birthYear: number;
  retirementAge: number;
  inflation: number;
  withdrawalRate: number;
  goals: Goal[];
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new Error(`plan.json: ${field} must be a number`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`plan.json: ${field} must be a string`);
  return value;
}

function parseGoal(value: unknown, index: number): Goal {
  if (typeof value !== "object" || value === null) {
    throw new Error(`plan.json: goals[${index}] must be an object`);
  }
  const g = value as Record<string, unknown>;
  const prefix = `goals[${index}]`;
  if (typeof g.scope !== "object" || g.scope === null) {
    throw new Error(`plan.json: ${prefix}.scope must be an object`);
  }
  return {
    id: requireString(g.id, `${prefix}.id`),
    label: requireString(g.label, `${prefix}.label`),
    scope: g.scope as GoalScope,
    target: requireNumber(g.target, `${prefix}.target`),
    by: requireString(g.by, `${prefix}.by`),
    source: requireString(g.source, `${prefix}.source`),
  };
}

/**
 * Parses `plan.json` into a `Plan`, throwing on the first field that fails
 * its shape check rather than handing back a partially trusted object. The
 * dashboard has no reasonable default for a birth year or a goal target --
 * a stale or hand-edited plan file must surface as the `ErrorBoundary`'s
 * rebuild message, not as a silently wrong projection.
 */
export function parsePlan(value: unknown): Plan {
  if (typeof value !== "object" || value === null) {
    throw new Error("plan.json: must be an object");
  }
  const p = value as Record<string, unknown>;
  if (!Array.isArray(p.goals)) {
    throw new Error("plan.json: goals must be an array");
  }
  return {
    birthYear: requireNumber(p.birthYear, "birthYear"),
    retirementAge: requireNumber(p.retirementAge, "retirementAge"),
    inflation: requireNumber(p.inflation, "inflation"),
    withdrawalRate: requireNumber(p.withdrawalRate, "withdrawalRate"),
    goals: p.goals.map(parseGoal),
  };
}

/** The committed plan, parsed once per call. */
export function loadPlan(): Plan {
  return parsePlan(raw);
}

/** The calendar year the owner turns `retirementAge`. */
export function retirementYear(plan: Plan): number {
  return plan.birthYear + plan.retirementAge;
}
