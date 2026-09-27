import { Button, Flex, Heading, SegmentedControl, Text, Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AnalyticsOutput } from "../analytics/build";
import { latestGroupGain } from "../analytics/groupGain";
import { Cards } from "./Cards";
import { GroupGainLine, Overview } from "./Overview";
import { Reconciliation } from "./Reconciliation";
import { Tabs } from "./Tabs";
import { YearFilter } from "./YearFilter";
import { CashflowChart } from "./charts/CashflowChart";
import { ContributionsChart } from "./charts/ContributionsChart";
import { CostGapChart } from "./charts/CostGapChart";
import { ReturnOverTime } from "./charts/ReturnOverTime";
import { ReturnsChart } from "./charts/ReturnsChart";
import { ValueOverTime } from "./charts/ValueOverTime";
import { grandTotal, latestPeriod, loadAnalytics, loadCards, loadReconciliation } from "./data";
import { formatCurrency, formatRate, formatSignedCurrency } from "./format";
import { ProjectionsView } from "./projections/ProjectionsView";
import { type YearChange, clipReturns, clipSeries, scopeYears, yearChange } from "./scope";
import { ErrorBoundary } from "./states/ErrorBoundary";
import { type TabId, useHashTab } from "./useHashTab";
import { RegisteredView } from "./wrappers/RegisteredView";
import { TaxView } from "./wrappers/TaxView";
import { YearSelect } from "./wrappers/YearSelect";

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

/** The years the corpus actually covers, oldest first -- never the calendar's. */
function yearsCovered(analytics: AnalyticsOutput): number[] {
  return Object.keys(analytics.rooms)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

/** The year picker shared by the wrappers and tax panels, so the two views always report the same year. */
function YearScopedPanel({
  years,
  year,
  onYearChange,
  children,
}: {
  years: readonly number[];
  year: number;
  onYearChange: (year: number) => void;
  children: ReactNode;
}) {
  return (
    <Flex direction="column" gap="4">
      <YearSelect years={years} year={year} onYearChange={onYearChange} />
      {children}
    </Flex>
  );
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

  const panels: Record<TabId, ReactNode> = {
    overview: <Overview analytics={analytics} />,
    growth: (
      <Flex direction="column" gap="6">
        <ReturnsChart returns={analytics.returns} series={analytics.series} />
        <ContributionsChart analytics={analytics} />
        <CashflowChart series={analytics.series} />
        <CostGapChart series={analytics.series} />
      </Flex>
    ),
    wrappers: <RegisteredView analytics={all} year={year} />,
    tax: <TaxView analytics={all} year={year} />,
    cards: <Cards statements={loadCards()} scope={scope} />,
    // The projection is a thirty-year forecast: a past year does not scope
    // it, and re-basing it to that year's close would quietly produce a
    // different forecast that looks just as authoritative. It reads the
    // UNSCOPED payload and says so on the tab.
    projections: <ProjectionsView analytics={all} scopeNote={scope !== "all"} />,
    reconciliation: <Reconciliation report={report} scope={scope} />,
  };

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
        <YearFilter
          years={years}
          scope={scope}
          onScopeChange={(next) => setHash({ scope: next })}
        />
        <ChartModeToggle mode={chart} onModeChange={setChart} />
      </Flex>
      {chart === "value" ? (
        <ValueOverTime series={analytics.series} />
      ) : (
        <ReturnOverTime series={all.series} scope={scope} />
      )}
      <Tabs panels={panels} tab={tab} onTabChange={(next) => setHash({ tab: next })} />
    </Flex>
  );
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
      <main style={{ padding: "3rem", maxWidth: "48rem", margin: "0 auto" }}>
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
