import { Callout, Flex, Heading, SegmentedControl, Text } from "@radix-ui/themes";
import { useMemo, useState } from "react";
import type { AnalyticsOutput } from "../../analytics/build";
import { buildPortfolioSeries } from "../../analytics/portfolioSeries";
import type { AccountSeries } from "../../analytics/types";
import { loadPlan, retirementYear as planRetirementYear } from "../../plan";
import { projectYears } from "../../projection/engine";
import { fittedReturnRate } from "../../projection/fittedRate";
import { groupOf, projectionInputs } from "../../projection/inputs";
import { milestoneYear, retirementIncome, runScenarios } from "../../projection/scenario";
import type { ScenarioPoint } from "../../projection/scenario";
import { AccountFilter } from "../AccountFilter";
import { isDefaultSelection, seriesForChart } from "../chartAccounts";
import { ProjectionChart } from "../charts/ProjectionChart";
import { type DollarsMode, buildProjectionSeries } from "../charts/projectionSeries";
import { formatCurrency, formatRate } from "../format";
import { GoalsPanel } from "./GoalsPanel";
import { RunwayTable } from "./RunwayTable";

export interface ProjectionsViewProps {
  analytics: AnalyticsOutput;
  /** True when a year is selected elsewhere, which this view deliberately ignores. */
  scopeNote?: boolean;
  accountOptions: readonly AccountSeries[];
  accounts: ReadonlySet<string>;
  onAccountsChange: (accounts: Set<string>) => void;
  onReset: () => void;
  subject: string;
}

const DEFAULT_RATE = 0.06;
const SPREAD = 0.02;
const RATE_MAX = 0.12;
const INFLATION_MAX = 0.05;
const MIN_YEARS = 30;

const MILESTONES = [500_000, 1_000_000] as const;

/** The scenario point at a calendar year, or undefined when the horizon does not reach it. */
function pointAt(points: readonly ScenarioPoint[], year: number): ScenarioPoint | undefined {
  return points.find((p) => Number(p.year) === year);
}

/** Which figure a chosen-dollars tile prints: what actually lands, or today's purchasing power. */
function chosen(point: ScenarioPoint | undefined, dollars: DollarsMode): number | null {
  if (point === undefined) return null;
  return dollars === "real" ? point.real : point.nominal;
}

/**
 * The caveat, in the open above the figures rather than in a footnote.
 *
 * Every other figure on this page was transcribed from a PDF. This one is
 * invented, which makes it the least certain thing here and the one that most
 * needs its qualification adjacent to it.
 */
function Disclaimer() {
  return (
    <Callout.Root color="amber" variant="surface" highContrast data-projection-disclaimer="">
      <Callout.Text>
        This is a scenario, not a forecast. It assumes one flat return every year across a low to
        high band, which no real portfolio delivers, and it assumes contributions keep arriving
        under today's CRA rules. It is not advice and it is not a filing figure.
      </Callout.Text>
    </Callout.Root>
  );
}

/** The retirement tile: balance in the chosen dollars, at the plan's own retirement year. */
function RetirementTile({
  year,
  age,
  value,
  dollars,
}: {
  year: number;
  age: number;
  value: number | null;
  dollars: DollarsMode;
}) {
  const dollarsWord = dollars === "real" ? "today's dollars" : "future dollars";
  return (
    <Flex direction="column" gap="1" data-retirement-tile="">
      <Heading size="2" as="h3" color="gray" weight="regular">
        {`At retirement, ${year} (age ${age})`}
      </Heading>
      <Text size="7" weight="bold">
        {value === null ? "Not within the horizon" : formatCurrency(value)}
      </Text>
      <Text size="2" color="gray">
        {value === null ? "" : `In ${dollarsWord}, at the base rate.`}
      </Text>
    </Flex>
  );
}

/** The monthly income the plan's withdrawal rate funds, always in today's dollars. */
function IncomeTile({
  income,
  withdrawalRate,
}: {
  income: { balance: number; monthly: number } | null;
  withdrawalRate: number;
}) {
  return (
    <Flex direction="column" gap="1" data-retirement-income="">
      <Heading size="2" as="h3" color="gray" weight="regular">
        {`Monthly income at ${formatRate(withdrawalRate * 100)} a year`}
      </Heading>
      <Text size="7" weight="bold">
        {income === null ? "Not within the horizon" : formatCurrency(income.monthly)}
      </Text>
      <Text size="2" color="gray">
        {income === null ? "" : "In today's dollars, drawn from the retirement balance above."}
      </Text>
    </Flex>
  );
}

/** The first year each milestone is reached in today's dollars, at the base rate. */
function MilestonesTile({ points }: { points: readonly ScenarioPoint[] }) {
  return (
    <Flex direction="column" gap="1">
      <Heading size="2" as="h3" color="gray" weight="regular">
        Milestones, today's dollars
      </Heading>
      {MILESTONES.map((threshold) => {
        const year = milestoneYear(points, threshold);
        return (
          <Text key={threshold} size="3" data-milestone={threshold === 500_000 ? "500k" : "1m"}>
            {`${formatCurrency(threshold)}: ${year ?? "not within the horizon"}`}
          </Text>
        );
      })}
    </Flex>
  );
}

/** The return rate and inflation sliders, plus the today's/future dollars toggle. */
function Controls({
  rate,
  onRateChange,
  inflation,
  onInflationChange,
  dollars,
  onDollarsChange,
}: {
  rate: number;
  onRateChange: (rate: number) => void;
  inflation: number;
  onInflationChange: (inflation: number) => void;
  dollars: DollarsMode;
  onDollarsChange: (dollars: DollarsMode) => void;
}) {
  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="2" data-projection-rate-control="">
        <Text as="label" size="2" htmlFor="projection-rate">
          {`Return rate assumed: ${formatRate(rate * 100)} a year`}
        </Text>
        <input
          id="projection-rate"
          type="range"
          min={0}
          max={RATE_MAX * 100}
          step="any"
          value={rate * 100}
          aria-valuetext={formatRate(rate * 100)}
          onChange={(event) => onRateChange(Number(event.target.value) / 100)}
        />
      </Flex>
      <Flex direction="column" gap="2" data-projection-inflation-control="">
        <Text as="label" size="2" htmlFor="projection-inflation">
          {`Inflation assumed: ${formatRate(inflation * 100)} a year`}
        </Text>
        <input
          id="projection-inflation"
          type="range"
          min={0}
          max={INFLATION_MAX * 100}
          step="any"
          value={inflation * 100}
          aria-valuetext={formatRate(inflation * 100)}
          onChange={(event) => onInflationChange(Number(event.target.value) / 100)}
        />
      </Flex>
      <SegmentedControl.Root
        value={dollars}
        onValueChange={(value) => onDollarsChange(value === "nominal" ? "nominal" : "real")}
        aria-label="Dollars"
        data-dollars-toggle=""
      >
        <SegmentedControl.Item value="real">Today's dollars</SegmentedControl.Item>
        <SegmentedControl.Item value="nominal">Future dollars</SegmentedControl.Item>
      </SegmentedControl.Root>
    </Flex>
  );
}

/** Which accounts CRA rules let this projection fund, and which selected accounts it merely compounds. */
function Assumptions({
  rate,
  inflation,
  fundedGroups,
  uncompounded,
}: {
  rate: number;
  inflation: number;
  fundedGroups: readonly string[];
  uncompounded: readonly string[];
}) {
  const funded =
    fundedGroups.length === 0 ? "none of the selected accounts" : fundedGroups.join(", ");
  return (
    <Text size="2" color="gray" data-projection-assumptions="">
      Assumes {formatRate(rate * 100)} a year and {formatRate(inflation * 100)} inflation. New money
      keeps landing in {funded} under today's CRA rules.
      {uncompounded.length === 0
        ? ""
        : ` ${uncompounded.join(", ")} ${uncompounded.length === 1 ? "grows" : "grow"} at the rate with no new money.`}
    </Text>
  );
}

/** The fitted rate, stated as context only: no button applies it. */
function FittedContext({ fitted }: { fitted: ReturnType<typeof fittedReturnRate> }) {
  return (
    <Text size="2" color="gray" data-projection-fitted-context="">
      Your last {fitted.months} months ran at {formatRate(fitted.rate * 100)} a year after deposits;
      a short strong run, not a thirty year expectation.
    </Text>
  );
}

/** Nothing stated to start from, which is not the same as starting from zero. */
function EmptyState() {
  return (
    <Flex direction="column" gap="2">
      <Heading size="5" as="h2">
        Where this is heading
      </Heading>
      <Text size="2" color="gray" data-projection-empty="">
        The selected accounts state no market value to start from, so there is nothing to project. A
        projection from zero would be a figure about nothing.
      </Text>
    </Flex>
  );
}

/**
 * Where the portfolio, or a chosen selection of it, is heading: a low to
 * high band in today's dollars by default, milestones, and a retirement
 * income at the plan's own age. The rate a reader chooses, the dollars mode,
 * and the account selection are the only things this view owns; the
 * scenarios themselves come from `runScenarios`.
 */
export function ProjectionsView({
  analytics,
  scopeNote = false,
  accountOptions,
  accounts,
  onAccountsChange,
  onReset,
  subject,
}: ProjectionsViewProps) {
  const plan = useMemo(() => loadPlan(), []);
  const fitted = useMemo(() => fittedReturnRate(analytics.series), [analytics]);
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [inflation, setInflation] = useState(plan.inflation);
  const [dollars, setDollars] = useState<DollarsMode>("real");

  const retireYear = planRetirementYear(plan);
  const startYearNumber = Number(projectionInputs(analytics).startYear || 0);
  const years = Math.max(MIN_YEARS, retireYear - startYearNumber);

  const scenarios = useMemo(
    () => runScenarios(analytics, accounts, { rate, spread: SPREAD, inflation, years }),
    [analytics, accounts, rate, inflation, years],
  );

  // The selected accounts' own stated history, the same subset the account
  // filter names and the scenario's opening balance is drawn from -- never
  // the whole portfolio, or the seam would jump against the scenario that
  // continues from it.
  const history = useMemo(
    () => buildPortfolioSeries(seriesForChart(analytics.series, accounts)),
    [analytics, accounts],
  );
  const series = useMemo(
    () => buildProjectionSeries(history, scenarios, dollars),
    [history, scenarios, dollars],
  );

  // Held once so the goals panel and the runway table -- which still evaluate
  // the plan's own goals against the whole portfolio, not the chart's
  // selection -- read the same base-rate rows the rest of the app always has.
  const inputs = useMemo(
    () => projectionInputs(analytics, { returnRate: rate, years }),
    [analytics, rate, years],
  );
  const rows = useMemo(() => projectYears(inputs), [inputs]);

  const opening = scenarios.base.points[0]?.nominal ?? 0;
  if (opening <= 0) return <EmptyState />;

  const retirementPoint = pointAt(scenarios.base.points, retireYear);
  const income = retirementIncome(scenarios.base.points, retireYear, plan.withdrawalRate);
  const fundedGroups = [
    ...new Set(
      analytics.series
        .filter((a) => a.inTotals && accounts.has(a.maskedId))
        .map((a) => groupOf(a.kind))
        .filter((group): group is NonNullable<typeof group> => group !== null),
    ),
  ];

  return (
    <Flex direction="column" gap="5">
      <Flex direction="column" gap="2">
        <Heading size="5" as="h2">
          Where this is heading
        </Heading>
        <Flex align="center" gap="3" wrap="wrap">
          <Text size="2" color="gray">
            {subject}
          </Text>
          <AccountFilter
            accounts={accountOptions}
            selected={accounts}
            subject={subject}
            isDefault={isDefaultSelection(analytics.series, accounts)}
            onSelectedChange={onAccountsChange}
            onReset={onReset}
          />
        </Flex>
      </Flex>
      {scopeNote ? (
        <Callout.Root color="gray" variant="surface" data-projection-scope-note="">
          <Callout.Text>
            The year filter does not apply here. A forecast runs forward from the latest statement,
            so this always projects from the whole corpus.
          </Callout.Text>
        </Callout.Root>
      ) : null}
      <Controls
        rate={rate}
        onRateChange={setRate}
        inflation={inflation}
        onInflationChange={setInflation}
        dollars={dollars}
        onDollarsChange={setDollars}
      />
      <Flex gap="6" wrap="wrap">
        <RetirementTile
          year={retireYear}
          age={plan.retirementAge}
          value={chosen(retirementPoint, dollars)}
          dollars={dollars}
        />
        <IncomeTile income={income} withdrawalRate={plan.withdrawalRate} />
        <MilestonesTile points={scenarios.base.points} />
      </Flex>
      <Disclaimer />
      <ProjectionChart
        series={series}
        rate={rate}
        low={scenarios.low.rate}
        high={scenarios.high.rate}
        retirementYear={retireYear}
        dollars={dollars}
      />
      <Assumptions
        rate={rate}
        inflation={inflation}
        fundedGroups={fundedGroups}
        uncompounded={scenarios.uncompounded}
      />
      <FittedContext fitted={fitted} />
      <GoalsPanel
        analytics={analytics}
        rows={rows}
        rate={rate}
        fhsaCloseYear={inputs.fhsaCloseYear}
        goals={plan.goals}
      />
      <RunwayTable rows={rows} inputs={inputs} />
    </Flex>
  );
}
