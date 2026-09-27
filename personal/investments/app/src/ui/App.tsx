import { Button, Flex, Grid, Heading, SegmentedControl, Text, Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AnalyticsOutput } from "../analytics/build";
import { latestGroupGain } from "../analytics/groupGain";
import { AccountFilter } from "./AccountFilter";
import { Cards } from "./Cards";
import { DataStatus } from "./DataStatus";
import { GroupGainLine, Overview } from "./Overview";
import { Reconciliation } from "./Reconciliation";
import { SummaryStrip } from "./SummaryStrip";
import { Tabs } from "./Tabs";
import { YearFilter } from "./YearFilter";
import {
  chartSubject,
  chartableAccounts,
  defaultSelection,
  isDefaultSelection,
  seriesForChart,
} from "./chartAccounts";
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
  loadCards,
  loadCoverage,
  loadReconciliation,
} from "./data";
import { formatCurrency, formatRate, formatSignedCurrency } from "./format";
import { ProjectionsView } from "./projections/ProjectionsView";
import { type YearChange, clipReturns, clipSeries, scopeYears, yearChange } from "./scope";
import { ErrorBoundary } from "./states/ErrorBoundary";
import { type TabId, useHashTab } from "./useHashTab";
import { RegisteredView } from "./wrappers/RegisteredView";
import { TaxView } from "./wrappers/TaxView";

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

/**
 * Everything that reads a committed artifact. It is a separate component
 * from `App` so that `ErrorBoundary` sits above the code that parses, and a
 * malformed `analytics.json` renders the rebuild instructions rather than
 * unmounting the whole page.
 */
function Dashboard() {
  const all = loadAnalytics();
  const report = loadReconciliation();
  const years = scopeYears(all);
  const latestYear = years[years.length - 1] ?? new Date().getUTCFullYear();
  const [{ tab, scope }, setHash] = useHashTab();
  const [chart, setChart] = useState<ChartMode>("value");
  const [accounts, setAccounts] = useState<Set<string>>(() => defaultSelection(all.series));
  const accountOptions = useMemo(() => chartableAccounts(all.series), [all]);
  const subject = chartSubject(all.series, accounts);

  /**
   * The whole dashboard reads a SCOPED analytics payload, clipped once here
   * rather than filtered in each of the eight places that consume it. Every
   * chart, rollup and gain below derives from `series` and needs no idea that
   * a filter exists; eight separate filters would be eight that can disagree.
   */
  const analytics = useMemo(
    () => ({
      ...all,
      series: clipSeries(all.series, scope),
      returns: clipReturns(all.returns, scope),
    }),
    [all, scope],
  );

  // The registered-room and tax views are inherently per-year, so the global
  // scope drives them: one year control, not two that look alike. On "All
  // time" they fall back to the corpus's latest year, which is what they
  // showed before this filter existed.
  const year = scope === "all" ? latestYear : scope;
  const change = scope === "all" ? null : yearChange(all.series, scope);
  /**
   * The headline total, its book value and its gain all read from one
   * `latestGroupGain(analytics.series)` call -- the same series-basis
   * `PortfolioPoint` the group cards use, not `grandTotal` (which sums each
   * account's own latest stated market value, a different basis: see
   * `latestGroupGain`'s own docstring). The two agree today, to the cent,
   * because every counted account's latest statement is the same period
   * (`groupGain.test.ts` pins that agreement). They stop agreeing the day
   * one account's statement lags another's -- `grandTotal` would still
   * count that account's stale figure, the series point would not until it
   * reports again -- and a total sourced from one while its own gain is
   * sourced from the other would then be subtracting numbers that were
   * never on the same basis. Falling back to `grandTotal` only covers the
   * pathological case `latestGroupGain` returns null for: a corpus with no
   * period at all carrying both a market value and a book cost, which the
   * real committed data never is.
   */
  const portfolioGain = latestGroupGain(analytics.series);
  const total = portfolioGain?.marketValue ?? grandTotal(analytics);
  const period = latestPeriod(analytics);

  const yearFilter = (
    <YearFilter years={years} scope={scope} onScopeChange={(next) => setHash({ scope: next })} />
  );

  /**
   * Every tab but Portfolio carries this strip rather than the full hero:
   * the year scope has to stay reachable everywhere, but the hero chart
   * repeating above every panel was one of the things the owner asked fixed.
   */
  function withSummary(children: ReactNode): ReactNode {
    return (
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center" gap="3" wrap="wrap">
          <SummaryStrip total={total} period={period} figures={portfolioGain} />
          {yearFilter}
        </Flex>
        {children}
      </Flex>
    );
  }

  const panels: Record<TabId, ReactNode> = {
    // TCK-0004 fills this in and adds "month" to TABS; it is unreachable
    // until then.
    month: null,
    portfolio: (
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
          {yearFilter}
          <Flex align="center" gap="3">
            <AccountFilter
              accounts={accountOptions}
              selected={accounts}
              subject={subject}
              isDefault={isDefaultSelection(all.series, accounts)}
              onSelectedChange={setAccounts}
              onReset={() => setAccounts(defaultSelection(all.series))}
            />
            <ChartModeToggle mode={chart} onModeChange={setChart} />
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
        <Flex direction="column" gap="3">
          <Heading size="5" as="h2">
            Income and tax
          </Heading>
          <TaxView analytics={all} year={year} />
        </Flex>
      </Flex>
    ),
    growth: withSummary(
      <Flex direction="column" gap="6">
        <ReturnsChart returns={analytics.returns} series={analytics.series} />
        <ContributionsChart analytics={analytics} />
        <CashflowChart series={analytics.series} />
        <CostGapChart series={analytics.series} />
      </Flex>,
    ),
    plan: withSummary(
      <Flex direction="column" gap="6">
        <RegisteredView analytics={all} year={year} />
        {/* The projection is a thirty-year forecast: a past year does not
            scope it, and re-basing it to that year's close would quietly
            produce a different forecast that looks just as authoritative.
            It reads the UNSCOPED payload and says so on the tab. */}
        <ProjectionsView analytics={all} scopeNote={scope !== "all"} />
      </Flex>,
    ),
    data: withSummary(
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
      </Flex>,
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
