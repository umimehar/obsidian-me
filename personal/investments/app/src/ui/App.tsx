import { Button, Flex, Heading, SegmentedControl, Text, Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { simulateBenchmark, skippedPeriods } from "../analytics/benchmark";
import type { AnalyticsOutput } from "../analytics/build";
import { feeReconciliationGaps } from "../analytics/feeReconciliation";
import { latestGroupGain } from "../analytics/groupGain";
import type { AccountSeries } from "../analytics/types";
import { loadTaxTable } from "../tax";
import { AboutNumbers } from "./AboutNumbers";
import { AccountFilter } from "./AccountFilter";
import { Cards } from "./Cards";
import { CORPORATE_NOTES, Corporate } from "./Corporate";
import { DataStatus } from "./DataStatus";
import { Holdings } from "./Holdings";
import { IncomeCosts } from "./IncomeCosts";
import { NON_REGISTERED_NOTES, NonRegistered } from "./NonRegistered";
import { GroupGainLine, Overview } from "./Overview";
import { Reconciliation } from "./Reconciliation";
import { SummaryStrip } from "./SummaryStrip";
import { Tabs } from "./Tabs";
import { ThisMonth } from "./ThisMonth";
import { YearFilter } from "./YearFilter";
import {
  chartSubject,
  chartableAccounts,
  defaultSelection,
  isDefaultSelection,
  seriesForChart,
} from "./chartAccounts";
import { BenchmarkChart } from "./charts/BenchmarkChart";
import { CashflowChart } from "./charts/CashflowChart";
import { ContributionsChart } from "./charts/ContributionsChart";
import { CostGapChart } from "./charts/CostGapChart";
import { ReturnOverTime } from "./charts/ReturnOverTime";
import { ReturnsChart } from "./charts/ReturnsChart";
import { ValueOverTime } from "./charts/ValueOverTime";
import {
  grandTotal,
  latestPeriod,
  loadAnalytics,
  loadBenchmark,
  loadCards,
  loadCheckpoints,
  loadCoverage,
  loadReconciliation,
} from "./data";
import { formatCurrency, formatRate, formatSignedCurrency } from "./format";
import { ProjectionsView } from "./projections/ProjectionsView";
import {
  type YearChange,
  type YearScope,
  clipReturns,
  clipSeries,
  scopeYears,
  yearChange,
} from "./scope";
import { ErrorBoundary } from "./states/ErrorBoundary";
import { type TabId, useHashTab } from "./useHashTab";
import { ContributionHistory } from "./wrappers/ContributionHistory";
import { RegisteredView } from "./wrappers/RegisteredView";

type Appearance = "inherit" | "light" | "dark";

/** The appearance the page would render under `"inherit"`, from the OS preference. */
function useSystemAppearance(): "light" | "dark" {
  const query = "(prefers-color-scheme: dark)";
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return systemDark ? "dark" : "light";
}

export type ChartMode = "value" | "return";

/**
 * Which of the two portfolio charts is showing.
 *
 * The pair is the point: a market-value chart climbs when money arrives, so
 * on its own it cannot tell a good year from a well-funded one. The return
 * chart answers exactly that and nothing else, which is why it is a toggle on
 * one chart rather than a second chart stacked below it.
 */
function ChartModeToggle({
  mode,
  onModeChange,
}: {
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
}) {
  return (
    <SegmentedControl.Root
      size="1"
      value={mode}
      onValueChange={(value) => onModeChange(value === "return" ? "return" : "value")}
      aria-label="Chart"
      data-chart-mode=""
    >
      <SegmentedControl.Item value="value">Value</SegmentedControl.Item>
      <SegmentedControl.Item value="return">Return</SegmentedControl.Item>
    </SegmentedControl.Root>
  );
}

/**
 * What a scoped year did, with the money paid into it stated inline.
 *
 * The single most misleading thing a year filter can do is let deposits read
 * as performance. 2026 took this portfolio from $85,516 to $234,580, and a
 * bare "+$149,063" would be true, enormous and almost entirely contributions:
 * $129,732 of it was money paid in and $19,331 was growth. So the growth
 * figure is netted, and the deposits are printed beside it rather than
 * mentioned in a caveat somewhere else. Never one without the other.
 */
/** A rate with an explicit sign, matching how `formatGainWithShare` signs its own. */
function signedRate(rate: number): string {
  return `${rate >= 0 ? "+" : ""}${formatRate(rate * 100)}`;
}

function YearChangeLine({ change }: { change: YearChange }) {
  const moved = change.netDeposits >= 0 ? "paid in" : "withdrawn";
  return (
    <Text size="2" color="gray" data-year-change="">
      {change.year}: grew{" "}
      <Text color={change.growth >= 0 ? "jade" : "red"} data-year-growth="">
        {formatSignedCurrency(change.growth)}
        {change.returnRate === null ? "" : ` (${signedRate(change.returnRate)})`}
      </Text>{" "}
      after {formatCurrency(Math.abs(change.netDeposits))} {moved}, from{" "}
      {formatCurrency(change.start)} to {formatCurrency(change.end)}
    </Text>
  );
}

/** The USD book cost caveat, once per tab -- one constant, so every tab reads one sentence. */
const USD_BOOK_COST_NOTE =
  "An estimate: book cost for USD holdings is a converted approximation, not a filing figure.";

interface WithSummaryProps {
  total: number;
  period: string | null;
  figures: ReturnType<typeof latestGroupGain>;
  years: readonly number[];
  scope: YearScope;
  onScopeChange: (scope: YearScope) => void;
  children: ReactNode;
  /** Notes beyond the shared USD book cost caveat -- a tab's own data limit, appended after it. */
  extraNotes?: readonly string[];
}

/**
 * Every tab but Portfolio carries this strip rather than the full hero: the
 * year scope has to stay reachable everywhere, but the hero chart repeating
 * above every panel was one of the things the owner asked fixed. It also
 * carries the USD book-cost caveat once, the same way Portfolio's own
 * `AboutNumbers` does, so a reader on Growth or Plan is not left to wonder
 * whether the strip's gain is an exact figure.
 */
function WithSummary({
  total,
  period,
  figures,
  years,
  scope,
  onScopeChange,
  children,
  extraNotes = [],
}: WithSummaryProps) {
  return (
    <Flex direction="column" gap="6">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <SummaryStrip total={total} period={period} figures={figures} />
        <YearFilter years={years} scope={scope} onScopeChange={onScopeChange} />
      </Flex>
      {children}
      <AboutNumbers notes={[USD_BOOK_COST_NOTE, ...extraNotes]} />
    </Flex>
  );
}

interface PortfolioPanelProps {
  analytics: AnalyticsOutput;
  all: AnalyticsOutput;
  change: YearChange | null;
  portfolioGain: ReturnType<typeof latestGroupGain>;
  total: number;
  period: string | null;
  years: readonly number[];
  scope: YearScope;
  onScopeChange: (scope: YearScope) => void;
  accountOptions: readonly AccountSeries[];
  accounts: Set<string>;
  onAccountsChange: (accounts: Set<string>) => void;
  subject: string;
  chart: ChartMode;
  onChartChange: (chart: ChartMode) => void;
}

function PortfolioPanel({
  analytics,
  all,
  change,
  portfolioGain,
  total,
  period,
  years,
  scope,
  onScopeChange,
  accountOptions,
  accounts,
  onAccountsChange,
  subject,
  chart,
  onChartChange,
}: PortfolioPanelProps) {
  return (
    <Flex direction="column" gap="6">
      <Flex direction="column" gap="1">
        {/* The heading is the label, not the figure. A screen reader's heading
            list is a table of contents, and "$241,739.67" is not a section name. */}
        <Heading size="2" as="h2" color="gray" weight="regular">
          Portfolio total{period !== null ? ` as of ${period}` : ""}
        </Heading>
        <Text size="8" weight="bold" data-portfolio-total="">
          {formatCurrency(total)}
        </Text>
        {/* The same `GroupGainLine` every group card renders, not a second
            copy: the headline book value/gain and a card's cannot drift
            apart in format, sign convention or colour if there is only one
            component printing either. */}
        <GroupGainLine figures={portfolioGain} />
        {change === null ? null : <YearChangeLine change={change} />}
      </Flex>
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <YearFilter years={years} scope={scope} onScopeChange={onScopeChange} />
        <Flex align="center" gap="3">
          <AccountFilter
            accounts={accountOptions}
            selected={accounts}
            subject={subject}
            isDefault={isDefaultSelection(all.series, accounts)}
            onSelectedChange={onAccountsChange}
            onReset={() => onAccountsChange(defaultSelection(all.series))}
          />
          <ChartModeToggle mode={chart} onModeChange={onChartChange} />
        </Flex>
      </Flex>
      {chart === "value" ? (
        <ValueOverTime series={seriesForChart(analytics.series, accounts)} subject={subject} />
      ) : (
        <ReturnOverTime
          series={seriesForChart(all.series, accounts)}
          scope={scope}
          subject={subject}
        />
      )}
      <Overview analytics={analytics} />
      <AboutNumbers notes={[USD_BOOK_COST_NOTE]} />
    </Flex>
  );
}

function MonthPanel({ analytics, scope }: { analytics: AnalyticsOutput; scope: YearScope }) {
  return <ThisMonth analytics={analytics} checkpoints={loadCheckpoints()} scope={scope} />;
}

/**
 * What is actually owned, combined across accounts. Reads the UNSCOPED
 * `all`: holdings are computed once, at each account's own latest BROKERAGE
 * statement, not per year, and the view itself says so when a year is
 * selected rather than silently ignoring the control.
 */
function HoldingsPanel({ all, scope }: { all: AnalyticsOutput; scope: YearScope }) {
  return <Holdings holdings={all.holdings} portfolioTotal={grandTotal(all)} scope={scope} />;
}

/**
 * The benchmark comparison sits first: the owner's request behind this
 * ticket was a deposit-netted return against a single fund, and that
 * question comes before the account-by-account return grid it sits above.
 */
function GrowthPanel({ analytics }: { analytics: AnalyticsOutput }) {
  const benchmark = loadBenchmark();
  const points = simulateBenchmark(analytics.series, benchmark.closes);
  const skipped = skippedPeriods(analytics.series, benchmark.closes);
  return (
    <Flex direction="column" gap="6">
      <BenchmarkChart points={points} skipped={skipped} symbol={benchmark.symbol} />
      <ReturnsChart returns={analytics.returns} series={analytics.series} />
      <CostGapChart series={analytics.series} />
    </Flex>
  );
}

/**
 * A chequing account carried coded `INT` rows on its BROKERAGE statements
 * through 2026-06. From 2026-07 it sends only a CASH statement, and a CASH
 * statement carries no activity code at all, so interest earned from that
 * point on does not appear here -- a real, recent gap, not the whole of
 * chequing's history, which the Income tab's own chequing line still states.
 */
const CHEQUING_INTEREST_NOTE =
  "From 2026-07, chequing statements carry no activity codes at all, so interest earned after " +
  "that point does not appear here.";

/**
 * A Canadian listed fund holding US stocks can have US withholding tax
 * deducted inside the fund itself, before it ever reaches the account --
 * that withholding never posts as its own row on a statement, so it cannot
 * appear in the withholding table or its totals at all.
 */
const FUND_WITHHOLDING_NOTE =
  "A Canadian listed fund holding US stocks can have withholding tax deducted inside the fund " +
  "itself, which never appears as a row on your statements.";

/**
 * One line per account whose statements state more in fees than any
 * FEE/REIMB activity row accounts for -- an account that bundles a trading
 * cost into a trade's own price rather than itemising it, computed live so
 * the figure can never go stale the way a typed one would.
 *
 * A negative gap (activity rows account for MORE than the statements state)
 * is a different kind of mismatch, not this one, and is worded as a surplus
 * rather than forced through the same "unstated cost" sentence, which would
 * otherwise print a nonsensical "about -$12.34 of unstated cost".
 */
export function feeGapNotes(analytics: AnalyticsOutput, year: number): string[] {
  const gaps = feeReconciliationGaps(analytics, year);
  return gaps.map((gap) =>
    gap.gap > 0
      ? "Some accounts bundle a trading cost into the price of what they buy rather than " +
        `stating it as a fee, so it is not itemised here. In ${year}, ${gap.label} carried ` +
        `about ${formatCurrency(gap.gap)} of this kind of unstated cost.`
      : `In ${year}, ${gap.label}'s FEE and REIMB activity rows total about ` +
        `${formatCurrency(Math.abs(gap.gap))} more than its statements state as fees, a ` +
        "surplus this dashboard cannot otherwise explain.",
  );
}

/**
 * What the portfolio pays and what it costs, plus -- underneath, in
 * `IncomeCosts`'s own section -- the personal taxable income view.
 * `IncomeCosts` reads the UNSCOPED `all` for the same reason
 * `ContributionsPanel` does: the year table states every year the corpus
 * covers, not only the scoped one.
 */
function IncomePanel({
  all,
  year,
  scope,
}: {
  all: AnalyticsOutput;
  year: number;
  scope: YearScope;
}) {
  return <IncomeCosts analytics={all} year={year} scope={scope} />;
}

/**
 * What is being put in, and how much room is left. `RegisteredView` reads
 * the UNSCOPED `all` for the same reason `FuturePanel` does -- a registered
 * wrapper's room is a fact about the calendar year, not about the account
 * selection or return chart the scoped `analytics` exists for.
 * `ContributionHistory` reads every year the corpus covers, not just `year`,
 * so it also reads off `all`.
 */
function ContributionsPanel({
  analytics,
  all,
  year,
}: {
  analytics: AnalyticsOutput;
  all: AnalyticsOutput;
  year: number;
}) {
  return (
    <Flex direction="column" gap="6">
      <RegisteredView analytics={all} year={year} />
      <ContributionsChart analytics={analytics} />
      <CashflowChart series={analytics.series} />
      <ContributionHistory rooms={all.rooms} series={all.series} />
    </Flex>
  );
}

interface FuturePanelProps {
  all: AnalyticsOutput;
  scope: YearScope;
  accountOptions: readonly AccountSeries[];
  accounts: Set<string>;
  onAccountsChange: (accounts: Set<string>) => void;
  subject: string;
}

function FuturePanel({
  all,
  scope,
  accountOptions,
  accounts,
  onAccountsChange,
  subject,
}: FuturePanelProps) {
  return (
    <Flex direction="column" gap="6">
      {/* The projection is a thirty-year forecast: a past year does not
          scope it, and re-basing it to that year's close would quietly
          produce a different forecast that looks just as authoritative.
          It reads the UNSCOPED payload and says so on the tab. The account
          selection is shared with Portfolio's own filter, not a second one. */}
      <ProjectionsView
        analytics={all}
        scopeNote={scope !== "all"}
        accountOptions={accountOptions}
        accounts={accounts}
        onAccountsChange={onAccountsChange}
        onReset={() => onAccountsChange(defaultSelection(all.series))}
        subject={subject}
      />
    </Flex>
  );
}

function DataPanel({
  report,
  scope,
}: {
  report: ReturnType<typeof loadReconciliation>;
  scope: YearScope;
}) {
  return (
    <Flex direction="column" gap="6">
      <Flex direction="column" gap="3">
        <Heading size="5" as="h2">
          Coverage
        </Heading>
        {/* Coverage describes the archive, not a year of it, so the scope
            does not apply. */}
        <DataStatus coverage={loadCoverage()} />
      </Flex>
      <Reconciliation report={report} scope={scope} />
      <Flex direction="column" gap="3">
        <Heading size="5" as="h2">
          Credit cards
        </Heading>
        <Cards statements={loadCards()} scope={scope} />
      </Flex>
    </Flex>
  );
}

/**
 * Everything that reads a committed artifact. It is a separate component
 * from `App` so that `ErrorBoundary` sits above the code that parses, and a
 * malformed `analytics.json` renders the rebuild instructions rather than
 * unmounting the whole page.
 */
function Dashboard() {
  const all = loadAnalytics();
  const report = loadReconciliation();
  const taxTable = loadTaxTable();
  const years = scopeYears(all);
  const latestYear = years[years.length - 1] ?? new Date().getUTCFullYear();
  const [{ tab, scope }, setHash] = useHashTab();
  const [chart, setChart] = useState<ChartMode>("value");
  const [accounts, setAccounts] = useState<Set<string>>(() => defaultSelection(all.series));
  const accountOptions = useMemo(() => chartableAccounts(all.series), [all]);
  const subject = chartSubject(all.series, accounts);

  // Clipped once here, never per chart: separate filters could disagree.
  const analytics = useMemo(
    () => ({
      ...all,
      series: clipSeries(all.series, scope),
      returns: clipReturns(all.returns, scope),
    }),
    [all, scope],
  );

  // Per year views follow the global scope; "All time" means the latest year.
  const year = scope === "all" ? latestYear : scope;
  const change = scope === "all" ? null : yearChange(all.series, scope);
  // Total, book value and gain share one series basis (see latestGroupGain);
  // grandTotal covers only a corpus with no priced period at all.
  const portfolioGain = latestGroupGain(analytics.series);
  const total = portfolioGain?.marketValue ?? grandTotal(analytics);
  const period = latestPeriod(analytics);
  const onScopeChange = (next: YearScope) => setHash({ scope: next });
  const summary = { total, period, figures: portfolioGain, years, scope, onScopeChange };

  const panels: Record<TabId, ReactNode> = {
    // Reads the UNSCOPED payload, like Plan: a month review needs the
    // statement before it to compute a baseline, which a year filter could
    // clip away.
    month: (
      <WithSummary {...summary}>
        <MonthPanel analytics={all} scope={scope} />
      </WithSummary>
    ),
    portfolio: (
      <PortfolioPanel
        analytics={analytics}
        all={all}
        change={change}
        portfolioGain={portfolioGain}
        total={total}
        period={period}
        years={years}
        scope={scope}
        onScopeChange={onScopeChange}
        accountOptions={accountOptions}
        accounts={accounts}
        onAccountsChange={setAccounts}
        subject={subject}
        chart={chart}
        onChartChange={setChart}
      />
    ),
    holdings: (
      <WithSummary {...summary}>
        <HoldingsPanel all={all} scope={scope} />
      </WithSummary>
    ),
    growth: (
      <WithSummary {...summary}>
        <GrowthPanel analytics={analytics} />
      </WithSummary>
    ),
    income: (
      <WithSummary
        {...summary}
        extraNotes={[CHEQUING_INTEREST_NOTE, FUND_WITHHOLDING_NOTE, ...feeGapNotes(all, year)]}
      >
        <IncomePanel all={all} year={year} scope={scope} />
      </WithSummary>
    ),
    contributions: (
      <WithSummary {...summary}>
        <ContributionsPanel analytics={analytics} all={all} year={year} />
      </WithSummary>
    ),
    // Both read the UNSCOPED `all`: a sale realized in January still
    // belongs to the year it happened in, which the global clip would
    // silently cut away on "All time" the same way Income's own tax view
    // reads `all` rather than the clipped `analytics`.
    nonRegistered: (
      <WithSummary {...summary} extraNotes={NON_REGISTERED_NOTES}>
        <NonRegistered analytics={all} year={year} scope={scope} taxTable={taxTable} />
      </WithSummary>
    ),
    corporate: (
      <WithSummary {...summary} extraNotes={CORPORATE_NOTES}>
        <Corporate analytics={all} year={year} scope={scope} taxTable={taxTable} />
      </WithSummary>
    ),
    future: (
      <WithSummary {...summary}>
        <FuturePanel
          all={all}
          scope={scope}
          accountOptions={accountOptions}
          accounts={accounts}
          onAccountsChange={setAccounts}
          subject={subject}
        />
      </WithSummary>
    ),
    data: (
      <WithSummary {...summary}>
        <DataPanel report={report} scope={scope} />
      </WithSummary>
    ),
  };

  return <Tabs panels={panels} tab={tab} onTabChange={(next) => setHash({ tab: next })} />;
}

export function App() {
  const [appearance, setAppearance] = useState<Appearance>("inherit");
  const systemAppearance = useSystemAppearance();
  const effectiveAppearance = appearance === "inherit" ? systemAppearance : appearance;

  function toggleAppearance() {
    setAppearance(effectiveAppearance === "light" ? "dark" : "light");
  }

  return (
    // `effectiveAppearance`, never `appearance`. Radix Themes ships no
    // `prefers-color-scheme` media query, so `"inherit"` at the root resolves
    // to light on every machine -- while the button below is labelled from
    // `effectiveAppearance` and does read the OS preference. Passing the raw
    // state opened a white page on a dark-mode machine under a button offering
    // to switch to light, whose first press then changed nothing visible.
    <Theme appearance={effectiveAppearance} accentColor="jade" grayColor="slate" radius="large">
      <main style={{ padding: "3rem", maxWidth: "72rem", margin: "0 auto" }}>
        <Flex justify="between" align="center" gap="3" mb="5" wrap="wrap">
          <Heading size="6" as="h1">
            Investments
          </Heading>
          <Button variant="soft" color="gray" onClick={toggleAppearance}>
            {effectiveAppearance === "light" ? "Switch to dark" : "Switch to light"}
          </Button>
        </Flex>
        <ErrorBoundary>
          <Dashboard />
        </ErrorBoundary>
      </main>
    </Theme>
  );
}
