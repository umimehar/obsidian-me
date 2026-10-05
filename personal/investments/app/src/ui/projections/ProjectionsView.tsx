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
import { formatPeriodLabel } from "../charts/plot";
import { type DollarsMode, buildProjectionSeries } from "../charts/projectionSeries";
import { formatCurrency, formatRate } from "../format";
import { GoalsPanel } from "./GoalsPanel";
import { RunwayTable } from "./RunwayTable";
import { StrategyPanel } from "./StrategyPanel";

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

/** Today's local date in ISO `YYYY-MM-DD` form, so the strategy panel's current phase is unambiguous. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The scenario point at a calendar year, or undefined when the horizon does not reach it. */
function pointAt(points: readonly ScenarioPoint[], year: number): ScenarioPoint | undefined {
  return points.find((p) => Number(p.year) === year);
}

/** Which figure a chosen-dollars tile prints: what actually lands, or today's purchasing power. */
function chosen(point: ScenarioPoint | undefined, dollars: DollarsMode): number | null {
  if (point === undefined) return null;
  return dollars === "real" ? point.real : point.nominal;
}

/** The registered groups CRA rules let new money land in, for the selected accounts the engine covers. */
function fundedGroupLabels(
  series: readonly AccountSeries[],
  accounts: ReadonlySet<string>,
): string[] {
  const groups = series
    .filter((a) => a.inTotals && accounts.has(a.maskedId))
    .map((a) => groupOf(a.kind))
    .filter((group): group is NonNullable<typeof group> => group !== null);
  return [...new Set(groups)];
}

/**
 * Every other figure on this page was transcribed from a PDF. This one is
 * invented, which makes it the least certain thing here and the one that
 * most needs its qualification adjacent to it.
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

/** The heading, the subject and the account filter, plus the year-scope note when it applies. */
function Header({
  subject,
  accountOptions,
  accounts,
  onAccountsChange,
  onReset,
  isDefault,
  scopeNote,
}: {
  subject: string;
  accountOptions: readonly AccountSeries[];
  accounts: ReadonlySet<string>;
  onAccountsChange: (accounts: Set<string>) => void;
  onReset: () => void;
  isDefault: boolean;
  scopeNote: boolean;
}) {
  return (
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
          isDefault={isDefault}
          onSelectedChange={onAccountsChange}
          onReset={onReset}
        />
      </Flex>
      {scopeNote ? (
        <Callout.Root color="gray" variant="surface" data-projection-scope-note="">
          <Callout.Text>
            The year filter does not apply here. A forecast runs forward from the latest statement,
            so this always projects from the whole corpus.
          </Callout.Text>
        </Callout.Root>
      ) : null}
    </Flex>
  );
}

/** The retirement tile: balance in the chosen dollars, named by the month it actually falls in. */
function RetirementTile({
  period,
  year,
  age,
  value,
  dollars,
}: {
  period: string | undefined;
  year: number;
  age: number;
  value: number | null;
  dollars: DollarsMode;
}) {
  const dollarsWord = dollars === "real" ? "today's dollars" : "future dollars";
  const when = period === undefined ? String(year) : formatPeriodLabel(period, { month: "long" });
  return (
    <Flex direction="column" gap="1" data-retirement-tile="">
      <Heading size="2" as="h3" color="gray" weight="regular">
        {`At retirement, ${when} (age ${age})`}
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

/** The three headline tiles, side by side. */
function Tiles({
  retirementPeriod,
  retireYear,
  age,
  retirementValue,
  dollars,
  income,
  withdrawalRate,
  points,
}: {
  retirementPeriod: string | undefined;
  retireYear: number;
  age: number;
  retirementValue: number | null;
  dollars: DollarsMode;
  income: { balance: number; monthly: number } | null;
  withdrawalRate: number;
  points: readonly ScenarioPoint[];
}) {
  return (
    <Flex gap="6" wrap="wrap">
      <RetirementTile
        period={retirementPeriod}
        year={retireYear}
        age={age}
        value={retirementValue}
        dollars={dollars}
      />
      <IncomeTile income={income} withdrawalRate={withdrawalRate} />
      <MilestonesTile points={points} />
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

/** The month name of a `YYYY-MM` period, for a sentence rather than an axis label. */
function monthName(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)),
  );
}

/** Which accounts CRA rules let this projection fund, and which selected accounts it merely compounds. */
function Assumptions({
  rate,
  inflation,
  fundedGroups,
  uncompounded,
  anchorPeriod,
}: {
  rate: number;
  inflation: number;
  fundedGroups: readonly string[];
  uncompounded: readonly string[];
  anchorPeriod: string;
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
      {` The Room runway table below counts calendar years. The chart dates each point to ${monthName(anchorPeriod)}, the month of your latest statement, so a year's contributions in the table show up on the chart the following ${monthName(anchorPeriod)}.`}
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
 * Everything derived from the analytics payload, the selection and the two
 * dials, held in one hook so the exported component's body stays a layout
 * rather than a second copy of this arithmetic.
 */
function useProjectionData(
  analytics: AnalyticsOutput,
  accounts: ReadonlySet<string>,
  rate: number,
  inflation: number,
  dollars: DollarsMode,
  retireYear: number,
) {
  // Depends only on `analytics`: the years this projection runs never
  // changes with the rate slider, so this must not refit on every drag.
  const anchorInputs = useMemo(() => projectionInputs(analytics), [analytics]);
  const years = Math.max(MIN_YEARS, retireYear - Number(anchorInputs.startYear || 0));

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

  return { scenarios, series, inputs, rows };
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
  // Must stay inside the ErrorBoundary render path: a stale plan.json throws
  // here, and that throw is how a bad file surfaces as the rebuild message
  // rather than a silent default or a crash outside React's own catch.
  const plan = useMemo(() => loadPlan(), []);
  const fitted = useMemo(() => fittedReturnRate(analytics.series), [analytics]);
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [inflation, setInflation] = useState(plan.inflation);
  const [dollars, setDollars] = useState<DollarsMode>("real");
  const retireYear = planRetirementYear(plan);

  const { scenarios, series, inputs, rows } = useProjectionData(
    analytics,
    accounts,
    rate,
    inflation,
    dollars,
    retireYear,
  );

  const opening = scenarios.base.points[0]?.nominal ?? 0;
  if (opening <= 0) return <EmptyState />;

  const retirementPoint = pointAt(scenarios.base.points, retireYear);
  const income = retirementIncome(scenarios.base.points, retireYear, plan.withdrawalRate);
  const fundedGroups = fundedGroupLabels(analytics.series, accounts);

  return (
    <Flex direction="column" gap="5">
      <Header
        subject={subject}
        accountOptions={accountOptions}
        accounts={accounts}
        onAccountsChange={onAccountsChange}
        onReset={onReset}
        isDefault={isDefaultSelection(analytics.series, accounts)}
        scopeNote={scopeNote}
      />
      <Controls
        rate={rate}
        onRateChange={setRate}
        inflation={inflation}
        onInflationChange={setInflation}
        dollars={dollars}
        onDollarsChange={setDollars}
      />
      <Tiles
        retirementPeriod={retirementPoint?.period}
        retireYear={retireYear}
        age={plan.retirementAge}
        retirementValue={chosen(retirementPoint, dollars)}
        dollars={dollars}
        income={income}
        withdrawalRate={plan.withdrawalRate}
        points={scenarios.base.points}
      />
      <Disclaimer />
      <ProjectionChart
        series={series}
        rate={rate}
        low={scenarios.low.rate}
        high={scenarios.high.rate}
        retirementPeriod={retirementPoint?.period ?? `${retireYear}-01`}
        retirementAge={plan.retirementAge}
        dollars={dollars}
      />
      <Assumptions
        rate={rate}
        inflation={inflation}
        fundedGroups={fundedGroups}
        uncompounded={scenarios.uncompounded}
        anchorPeriod={scenarios.startPeriod}
      />
      <FittedContext fitted={fitted} />
      <GoalsPanel
        analytics={analytics}
        rows={rows}
        rate={rate}
        fhsaCloseYear={inputs.fhsaCloseYear}
        goals={plan.goals}
      />
      <StrategyPanel strategy={plan.strategy} today={todayIso()} />
      <RunwayTable rows={rows} inputs={inputs} />
    </Flex>
  );
}
