import { Badge, Card, Flex, Heading, Text } from "@radix-ui/themes";
import type {
  Automation,
  DirectIndexing,
  PayrollPhase,
  RrspPlan,
  Strategy,
  WatchItem,
} from "../../plan";
import { formatCurrency, formatShare } from "../format";

export interface StrategyPanelProps {
  /** The plan's current money-moving decisions, read from `data/plan.json` by the caller. */
  strategy: Strategy;
  /** The caller's local date in ISO form, so the current payroll phase and watch status are testable. */
  today: string;
}

/** A phase is current when `today` falls inside its window, open or closed. */
function isCurrentPhase(phase: PayrollPhase, today: string): boolean {
  if (today < phase.from) return false;
  return phase.to === null || today <= phase.to;
}

function perPayTotal(automations: readonly Automation[]): number {
  return automations.reduce((sum, a) => sum + a.amount, 0);
}

function dateRangeText(phase: PayrollPhase): string {
  return phase.to === null ? `from ${phase.from}` : `${phase.from} to ${phase.to}`;
}

function DirectIndexingSection({ directIndexing }: { directIndexing: DirectIndexing }) {
  return (
    <Card mb="2" data-testid="strategy-direct-indexing">
      <Flex direction="column" gap="2">
        <Heading size="2" as="h4">
          Direct indexing
        </Heading>
        <Text size="2" color="gray">
          {directIndexing.account}
        </Text>
        {directIndexing.targets.map((t) => (
          <Text size="2" key={t.sleeve}>
            {t.sleeve}: {formatShare(t.share)}
          </Text>
        ))}
        <Text size="2">Fill target: {formatCurrency(directIndexing.fillTarget)}</Text>
        <Text size="2" color="gray">
          Sleeve split is not in the statements, so progress is not measured here.
        </Text>
        <Text size="2" color="gray">
          {directIndexing.note}
        </Text>
      </Flex>
    </Card>
  );
}

function PayrollPhaseCard({ phase, today }: { phase: PayrollPhase; today: string }) {
  const current = isCurrentPhase(phase, today);
  return (
    <Card mb="2" data-testid={`payroll-${phase.id}`}>
      <Flex direction="column" gap="2">
        <Flex align="center" gap="2">
          <Heading size="2" as="h4">
            {phase.label}
          </Heading>
          {current ? (
            <Badge color="jade" variant="soft" highContrast>
              Current
            </Badge>
          ) : null}
        </Flex>
        <Text size="2" color="gray">
          {dateRangeText(phase)}
        </Text>
        <Text size="2">Per pay: {formatCurrency(perPayTotal(phase.automations))}</Text>
        <Flex direction="column" gap="1">
          {phase.automations.map((a, i) => (
            <Text size="2" color="gray" key={`${phase.id}-${a.target}-${i}`}>
              {a.target}: {formatCurrency(a.amount)}
            </Text>
          ))}
        </Flex>
        <Text size="2" color="gray">
          {phase.note}
        </Text>
      </Flex>
    </Card>
  );
}

function RrspSection({ rrsp }: { rrsp: RrspPlan }) {
  const remaining = Math.max(rrsp.deductionTarget - rrsp.contributedToDate, 0);
  const taxableAfterDeduction = rrsp.estimatedIncome - rrsp.deductionTarget;
  return (
    <Card mb="2" data-testid="strategy-rrsp">
      <Flex direction="column" gap="2">
        <Heading size="2" as="h4">
          RRSP, {rrsp.year}
        </Heading>
        <Text size="2">
          Contributed to date: {formatCurrency(rrsp.contributedToDate)} as of {rrsp.contributedAsOf}
        </Text>
        <Text size="2">Deduction target: {formatCurrency(rrsp.deductionTarget)}</Text>
        <Text size="2">Remaining to target: {formatCurrency(remaining)}</Text>
        <Text size="2">Estimated income: {formatCurrency(rrsp.estimatedIncome)}</Text>
        <Text size="2">
          Estimated taxable income after the deduction: {formatCurrency(taxableAfterDeduction)},
          beside bracket top {formatCurrency(rrsp.bracketTop)}
        </Text>
        <Text size="2" color="gray">
          {rrsp.note}
        </Text>
      </Flex>
    </Card>
  );
}

function WatchCard({ item, today }: { item: WatchItem; today: string }) {
  const active = today <= item.through;
  return (
    <Card mb="2" data-testid="strategy-watch-item">
      <Flex direction="column" gap="2">
        <Flex align="center" gap="2">
          <Text size="2" weight="bold">
            {item.label}
          </Text>
          <Badge color={active ? "amber" : "gray"} variant="soft" highContrast>
            {active ? "Active" : "Ended"}
          </Badge>
        </Flex>
        <Text size="2" color="gray">
          through {item.through}
        </Text>
        <Text size="2" color="gray">
          {item.note}
        </Text>
      </Flex>
    </Card>
  );
}

/**
 * The owner's current money-moving decisions, read once from `data/plan.json`
 * and shown alongside the goals they fund. `today` is a prop rather than
 * `new Date()` read here, so the current payroll phase and watch status are
 * deterministic in tests.
 *
 * Heading sits at `h3`, one level under the projections view's own `h2`, same
 * as `GoalsPanel` beside it; each section below uses `h4`.
 */
export function StrategyPanel({ strategy, today }: StrategyPanelProps) {
  return (
    <Flex direction="column" gap="2">
      <Heading size="3" as="h3">
        Plan
      </Heading>
      <Text size="2" color="gray">
        Decided {strategy.decided}
      </Text>
      <DirectIndexingSection directIndexing={strategy.directIndexing} />
      {strategy.payroll.map((phase) => (
        <PayrollPhaseCard key={phase.id} phase={phase} today={today} />
      ))}
      <RrspSection rrsp={strategy.rrsp} />
      {strategy.watch.map((item, i) => (
        <WatchCard key={`${item.label}-${i}`} item={item} today={today} />
      ))}
    </Flex>
  );
}
