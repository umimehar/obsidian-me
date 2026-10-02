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

/** One sleeve of a direct indexing account, and the share of it the sleeve targets. */
export interface SleeveTarget {
  sleeve: string;
  share: number;
}

/** The direct indexing account's sleeve targets and the dollar level that fills them. */
export interface DirectIndexing {
  account: string;
  targets: SleeveTarget[];
  fillTarget: number;
  note: string;
}

/** One payroll automation: a destination and the amount sent to it each pay. */
export interface Automation {
  target: string;
  amount: number;
}

/** A dated window of payroll automations, replaced wholesale by the next phase. */
export interface PayrollPhase {
  id: string;
  label: string;
  from: string;
  to: string | null;
  automations: Automation[];
  note: string;
}

/** The current year's RRSP contribution plan against the deduction target. */
export interface RrspPlan {
  year: number;
  estimatedIncome: number;
  contributedToDate: number;
  contributedAsOf: string;
  deductionTarget: number;
  bracketTop: number;
  note: string;
}

/** A time-bound reminder, such as a superficial-loss window. */
export interface WatchItem {
  label: string;
  through: string;
  note: string;
}

/** The owner's current money-moving decisions: where deposits land and why. */
export interface Strategy {
  decided: string;
  directIndexing: DirectIndexing;
  payroll: PayrollPhase[];
  rrsp: RrspPlan;
  watch: WatchItem[];
}

/** The owner's retirement assumptions and the goals the projection evaluates. */
export interface Plan {
  birthYear: number;
  retirementAge: number;
  inflation: number;
  withdrawalRate: number;
  goals: Goal[];
  strategy: Strategy;
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A date in ISO `YYYY-MM-DD` form, format and calendar validity both checked. */
function requireIsoDate(value: unknown, field: string): string {
  const s = requireString(value, field);
  if (!ISO_DATE.test(s) || Number.isNaN(Date.parse(s))) {
    throw new Error(`plan.json: ${field} must be an ISO date (YYYY-MM-DD)`);
  }
  return s;
}

/** An ISO date, or `null` for a phase or item still open. */
function requireIsoDateOrNull(value: unknown, field: string): string | null {
  return value === null ? null : requireIsoDate(value, field);
}

function parseSleeveTarget(value: unknown, index: number): SleeveTarget {
  const prefix = `strategy.directIndexing.targets[${index}]`;
  if (typeof value !== "object" || value === null) {
    throw new Error(`plan.json: ${prefix} must be an object`);
  }
  const t = value as Record<string, unknown>;
  const share = requireNumber(t.share, `${prefix}.share`);
  if (share <= 0 || share > 1) {
    throw new Error(`plan.json: ${prefix}.share must be greater than 0 and at most 1`);
  }
  return { sleeve: requireString(t.sleeve, `${prefix}.sleeve`), share };
}

/** Within floating point noise of summing to exactly 1 -- the whole account, no gap and no overlap. */
const SHARE_SUM_TOLERANCE = 1e-9;

function parseDirectIndexing(value: unknown): DirectIndexing {
  if (typeof value !== "object" || value === null) {
    throw new Error("plan.json: strategy.directIndexing must be an object");
  }
  const d = value as Record<string, unknown>;
  if (!Array.isArray(d.targets) || d.targets.length === 0) {
    throw new Error("plan.json: strategy.directIndexing.targets must be a non-empty array");
  }
  const targets = d.targets.map((t, i) => parseSleeveTarget(t, i));
  const totalShare = targets.reduce((sum, t) => sum + t.share, 0);
  if (Math.abs(totalShare - 1) > SHARE_SUM_TOLERANCE) {
    throw new Error("plan.json: strategy.directIndexing.targets shares must sum to 1");
  }
  return {
    account: requireString(d.account, "strategy.directIndexing.account"),
    targets,
    fillTarget: requireRange(
      requireNumber(d.fillTarget, "strategy.directIndexing.fillTarget"),
      "strategy.directIndexing.fillTarget",
      0,
      Number.POSITIVE_INFINITY,
    ),
    note: requireString(d.note, "strategy.directIndexing.note"),
  };
}

function parseAutomation(value: unknown, index: number, prefix: string): Automation {
  const itemPrefix = `${prefix}[${index}]`;
  if (typeof value !== "object" || value === null) {
    throw new Error(`plan.json: ${itemPrefix} must be an object`);
  }
  const a = value as Record<string, unknown>;
  const amount = requireNumber(a.amount, `${itemPrefix}.amount`);
  if (amount <= 0) {
    throw new Error(`plan.json: ${itemPrefix}.amount must be greater than 0`);
  }
  return { target: requireString(a.target, `${itemPrefix}.target`), amount };
}

function parsePayrollPhase(value: unknown, index: number): PayrollPhase {
  const prefix = `strategy.payroll[${index}]`;
  if (typeof value !== "object" || value === null) {
    throw new Error(`plan.json: ${prefix} must be an object`);
  }
  const p = value as Record<string, unknown>;
  if (!Array.isArray(p.automations) || p.automations.length === 0) {
    throw new Error(`plan.json: ${prefix}.automations must be a non-empty array`);
  }
  return {
    id: requireString(p.id, `${prefix}.id`),
    label: requireString(p.label, `${prefix}.label`),
    from: requireIsoDate(p.from, `${prefix}.from`),
    to: requireIsoDateOrNull(p.to, `${prefix}.to`),
    automations: p.automations.map((a, i) => parseAutomation(a, i, `${prefix}.automations`)),
    note: requireString(p.note, `${prefix}.note`),
  };
}

/**
 * Phases must run in ascending `from` order with no gap left unstated and no
 * overlap: each phase's `to` must land strictly before the next phase's
 * `from`. A phase open to the future (`to: null`) can only be the last one --
 * an open phase followed by another would overlap it for the rest of time.
 */
function checkPayrollOrder(phases: readonly PayrollPhase[]): void {
  for (let i = 0; i < phases.length - 1; i += 1) {
    const phase = phases[i];
    const next = phases[i + 1];
    if (phase === undefined || next === undefined) continue;
    if (phase.from >= next.from) {
      throw new Error(
        `plan.json: strategy.payroll[${i + 1}].from must be after strategy.payroll[${i}].from`,
      );
    }
    if (phase.to === null || phase.to >= next.from) {
      throw new Error(
        `plan.json: strategy.payroll[${i}].to must be before strategy.payroll[${i + 1}].from`,
      );
    }
  }
}

function parsePayroll(value: unknown): PayrollPhase[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("plan.json: strategy.payroll must be a non-empty array");
  }
  const phases = value.map((p, i) => parsePayrollPhase(p, i));
  checkPayrollOrder(phases);
  return phases;
}

function parseRrsp(value: unknown): RrspPlan {
  if (typeof value !== "object" || value === null) {
    throw new Error("plan.json: strategy.rrsp must be an object");
  }
  const r = value as Record<string, unknown>;
  const year = requireNumber(r.year, "strategy.rrsp.year");
  if (!Number.isInteger(year)) {
    throw new Error("plan.json: strategy.rrsp.year must be an integer");
  }
  const nonNegative = (v: unknown, field: string) =>
    requireRange(requireNumber(v, field), field, 0, Number.POSITIVE_INFINITY);
  return {
    year,
    estimatedIncome: nonNegative(r.estimatedIncome, "strategy.rrsp.estimatedIncome"),
    contributedToDate: nonNegative(r.contributedToDate, "strategy.rrsp.contributedToDate"),
    contributedAsOf: requireIsoDate(r.contributedAsOf, "strategy.rrsp.contributedAsOf"),
    deductionTarget: nonNegative(r.deductionTarget, "strategy.rrsp.deductionTarget"),
    bracketTop: nonNegative(r.bracketTop, "strategy.rrsp.bracketTop"),
    note: requireString(r.note, "strategy.rrsp.note"),
  };
}

function parseWatchItem(value: unknown, index: number): WatchItem {
  const prefix = `strategy.watch[${index}]`;
  if (typeof value !== "object" || value === null) {
    throw new Error(`plan.json: ${prefix} must be an object`);
  }
  const w = value as Record<string, unknown>;
  return {
    label: requireString(w.label, `${prefix}.label`),
    through: requireIsoDate(w.through, `${prefix}.through`),
    note: requireString(w.note, `${prefix}.note`),
  };
}

function parseWatch(value: unknown): WatchItem[] {
  if (!Array.isArray(value)) {
    throw new Error("plan.json: strategy.watch must be an array");
  }
  return value.map((w, i) => parseWatchItem(w, i));
}

function parseStrategy(value: unknown): Strategy {
  if (typeof value !== "object" || value === null) {
    throw new Error("plan.json: strategy must be an object");
  }
  const s = value as Record<string, unknown>;
  return {
    decided: requireIsoDate(s.decided, "strategy.decided"),
    directIndexing: parseDirectIndexing(s.directIndexing),
    payroll: parsePayroll(s.payroll),
    rrsp: parseRrsp(s.rrsp),
    watch: parseWatch(s.watch),
  };
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
    strategy: parseStrategy(p.strategy),
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
