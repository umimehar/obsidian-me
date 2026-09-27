import raw from "@data/plan.json";
import type { GoalScope } from "./goals/scope";
import type { ProjectionGroup } from "./projection/inputs";

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

/** Mirrors `Purpose` in `store/registry.ts`. Not imported: that module has no runtime array to check against, only a type. */
const PURPOSES = [
  "retirement",
  "house",
  "education",
  "business",
  "growth",
  "spending",
  "unassigned",
] as const;

/** Mirrors `ProjectionGroup` in `projection/inputs.ts`, for the same reason. */
const PROJECTION_GROUPS: readonly ProjectionGroup[] = ["TFSA", "RRSP", "FHSA", "RESP", "Corporate"];

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new Error(`plan.json: ${field} must be a number`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`plan.json: ${field} must be a string`);
  return value;
}

/** A number already checked to be a `number`, further bounded to a plausible range. */
function requireRange(value: number, field: string, min: number, max: number): number {
  if (value < min || value > max) {
    throw new Error(`plan.json: ${field} must be between ${min} and ${max}`);
  }
  return value;
}

function requireOneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const found = allowed.find((option) => option === value);
  if (found === undefined) {
    throw new Error(`plan.json: ${field} must be one of ${allowed.join(", ")}`);
  }
  return found;
}

/**
 * A goal's scope, shape and value checked: `portfolio` carries nothing else,
 * `purpose` names one of `Purpose`'s values, `groups` names an array of
 * `ProjectionGroup` values. A scope naming a purpose or a group this app does
 * not know about would silently resolve to zero covered accounts everywhere
 * it is read, which reads as "on track with nothing to fund" rather than the
 * typo it actually is.
 */
function parseGoalScope(value: unknown, field: string): GoalScope {
  if (typeof value !== "object" || value === null) {
    throw new Error(`plan.json: ${field} must be an object`);
  }
  const s = value as Record<string, unknown>;
  if (s.kind === "portfolio") return { kind: "portfolio" };
  if (s.kind === "purpose") {
    return { kind: "purpose", purpose: requireOneOf(s.purpose, `${field}.purpose`, PURPOSES) };
  }
  if (s.kind === "groups") {
    if (!Array.isArray(s.groups)) throw new Error(`plan.json: ${field}.groups must be an array`);
    const groups = s.groups.map((g, i) =>
      requireOneOf(g, `${field}.groups[${i}]`, PROJECTION_GROUPS),
    );
    return { kind: "groups", groups };
  }
  throw new Error(`plan.json: ${field}.kind must be "portfolio", "purpose" or "groups"`);
}

function parseGoal(value: unknown, index: number): Goal {
  if (typeof value !== "object" || value === null) {
    throw new Error(`plan.json: goals[${index}] must be an object`);
  }
  const g = value as Record<string, unknown>;
  const prefix = `goals[${index}]`;
  return {
    id: requireString(g.id, `${prefix}.id`),
    label: requireString(g.label, `${prefix}.label`),
    scope: parseGoalScope(g.scope, `${prefix}.scope`),
    target: requireNumber(g.target, `${prefix}.target`),
    by: requireString(g.by, `${prefix}.by`),
    source: requireString(g.source, `${prefix}.source`),
  };
}

/**
 * Parses `plan.json` into a `Plan`, throwing on the first field that fails
 * its shape or range check rather than handing back a partially trusted
 * object. The dashboard has no reasonable default for a birth year or a goal
 * target -- a stale or hand-edited plan file must surface as the
 * `ErrorBoundary`'s rebuild message naming the field, not a silently wrong
 * projection.
 *
 * The ranges are plausibility bounds, not the owner's actual figures: a
 * retirement age of 30 or 80, and an inflation or withdrawal rate above 20%,
 * are outside anything this projection is meant to model, so a typo landing
 * there (2.5 instead of 0.025) fails loudly instead of compounding into a
 * projection nobody would recognize.
 */
export function parsePlan(value: unknown): Plan {
  if (typeof value !== "object" || value === null) {
    throw new Error("plan.json: must be an object");
  }
  const p = value as Record<string, unknown>;
  if (!Array.isArray(p.goals)) {
    throw new Error("plan.json: goals must be an array");
  }
  const currentYear = new Date().getUTCFullYear();
  return {
    birthYear: requireRange(
      requireNumber(p.birthYear, "birthYear"),
      "birthYear",
      1900,
      currentYear,
    ),
    retirementAge: requireRange(
      requireNumber(p.retirementAge, "retirementAge"),
      "retirementAge",
      30,
      80,
    ),
    inflation: requireRange(requireNumber(p.inflation, "inflation"), "inflation", 0, 0.2),
    withdrawalRate: requireRange(
      requireNumber(p.withdrawalRate, "withdrawalRate"),
      "withdrawalRate",
      0,
      0.2,
    ),
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
