import { Card, Flex, Heading, Text } from "@radix-ui/themes";
import type { AnalyticsOutput } from "../../analytics/build";
import { GOALS, type Goal } from "../../goals/config";
import { type GoalVerdict, evaluateGoal } from "../../goals/evaluate";
import type { ScopeCoverage } from "../../goals/scope";
import type { ProjectionYear } from "../../projection/engine";
import { formatCurrency } from "../format";

export interface GoalsPanelProps {
  analytics: AnalyticsOutput;
  rows: readonly ProjectionYear[];
  rate: number;
  fhsaCloseYear: string;
  /**
   * Defaults to the shipped `GOALS`. It exists so a test can render a scope
   * the shipped config does not carry -- a `growth` purpose, a raised
   * target -- never as a runtime feature. Nothing in the app passes it.
   */
  goals?: readonly Goal[];
}

/** How many of the scope's accounts the projection reaches, and what is left out when it does not reach all of them. */
function coverageLine(coverage: ScopeCoverage): string {
  const total = coverage.covered.length + coverage.uncovered.length;
  const covered = `Covers ${coverage.covered.length} of ${total} ${total === 1 ? "account" : "accounts"} in scope.`;
  if (coverage.uncovered.length === 0) return covered;

  const uncoveredValue = coverage.scopeValue - coverage.coveredValue;
  const noun = coverage.uncovered.length === 1 ? "account" : "accounts";
  return `${covered} The projection does not forecast ${coverage.uncovered.length} ${noun} holding ${formatCurrency(uncoveredValue)}.`;
}

/** "ahead of target" for a surplus, "short of target" for a shortfall. Never a bare signed number a reader has to interpret. */
function directionWord(gap: number): "ahead of target" | "short of target" {
  return gap >= 0 ? "ahead of target" : "short of target";
}

interface GoalCardProps {
  goal: Goal;
  verdict: GoalVerdict;
}

/**
 * The card for a goal the projection cannot reach: no covered account, or a
 * target year outside `rows`. It says so in words rather than falling back
 * to a projected or a gap of zero, which would read as "on track" for a
 * goal the projection never looked at.
 */
function UnprojectableCard({ goal, verdict }: GoalCardProps) {
  const targetLine = `Target: ${formatCurrency(goal.target)} by ${goal.by}.`;
  const coverage = coverageLine(verdict.coverage);
  const summary = `${goal.label}. ${targetLine} This goal cannot be projected. ${coverage} ${goal.source}`;

  return (
    <Card mb="3" data-testid={`goal-${goal.id}`} aria-label={summary}>
      <Flex direction="column" gap="2">
        <Heading size="3" as="h3">
          {goal.label}
        </Heading>
        <Text size="2" color="gray">
          {targetLine}
        </Text>
        <Text size="2" color="amber">
          This goal cannot be projected.
        </Text>
        <Text size="2" color="gray">
          {coverage}
        </Text>
        <Text size="2" color="gray">
          {goal.source}
        </Text>
      </Flex>
    </Card>
  );
}

/**
 * The card for a goal the projection can reach. `target`, `projected`,
 * `gap` and `monthlyToClose` each format through exactly one
 * `formatCurrency` call, held in a variable reused by both the visible text
 * and the card's `aria-label` -- so the two can never disagree. Six defects
 * of an announcement reading a coarser figure than the card's own text have
 * shipped in this project; this is what closes that class off for good.
 */
function ProjectedCard({ goal, verdict }: GoalCardProps) {
  const projected = verdict.projected;
  const gap = verdict.gap;
  if (projected === null || gap === null)
    throw new Error("ProjectedCard requires a projected goal");

  const targetText = formatCurrency(goal.target);
  const projectedText = formatCurrency(projected);
  const gapText = formatCurrency(Math.abs(gap));
  const direction = directionWord(gap);
  const coverage = coverageLine(verdict.coverage);

  const targetLine = `Target: ${targetText} by ${goal.by}.`;
  const projectedLine = `Projected in ${goal.by}: ${projectedText}.`;
  const gapLine = `${gapText} ${direction}.`;

  // A shortfall closes one of two ways: an extra monthly contribution, or
  // not at all when the wrapper it lives in has no CRA room left. Never
  // both, and never neither when gap is negative -- evaluateGoal always
  // sets exactly one of the two whenever there is a shortfall to report on.
  const extraLine =
    gap < 0
      ? (verdict.blocked ??
        (verdict.monthlyToClose !== null
          ? `${formatCurrency(verdict.monthlyToClose)} a month closes the gap by ${goal.by}.`
          : null))
      : null;

  const summary = [goal.label, targetLine, projectedLine, gapLine, coverage, extraLine, goal.source]
    .filter((part): part is string => part !== null)
    .join(" ");

  return (
    <Card mb="3" data-testid={`goal-${goal.id}`} aria-label={summary}>
      <Flex direction="column" gap="2">
        <Heading size="3" as="h3">
          {goal.label}
        </Heading>
        <Text size="2" color="gray">
          {targetLine}
        </Text>
        <Text size="5" weight="bold">
          {projectedText}
        </Text>
        <Text size="2" color={gap >= 0 ? "jade" : "amber"}>
          {gapLine}
        </Text>
        <Text size="2" color="gray">
          {coverage}
        </Text>
        {extraLine === null ? null : (
          <Text size="2" color={verdict.blocked !== null ? "amber" : "gray"}>
            {extraLine}
          </Text>
        )}
        <Text size="2" color="gray">
          {goal.source}
        </Text>
      </Flex>
    </Card>
  );
}

function GoalCard({ goal, verdict }: GoalCardProps) {
  return verdict.projected === null || verdict.gap === null ? (
    <UnprojectableCard goal={goal} verdict={verdict} />
  ) : (
    <ProjectedCard goal={goal} verdict={verdict} />
  );
}

/**
 * One card per declared goal, evaluated against the projection already
 * built by the caller. Headings sit at `h3`, one level under the
 * projections view's own `h2` -- this panel introduces no heading of its
 * own, so mounting it under `ProjectionsView` never skips a level.
 *
 * `rows` and `rate` are the caller's, not recomputed here: the same rows
 * the chart already drew from, so a goal card and the chart beside it can
 * never disagree about which scenario is on screen.
 */
export function GoalsPanel({
  analytics,
  rows,
  rate,
  fhsaCloseYear,
  goals = GOALS,
}: GoalsPanelProps) {
  return (
    <Flex direction="column" gap="2" data-goals-panel="">
      {goals.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          verdict={evaluateGoal(goal, analytics, rows, rate, fhsaCloseYear)}
        />
      ))}
    </Flex>
  );
}
