import { Button, Flex, Heading, Text, Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { AnalyticsOutput } from "../analytics/build";
import { latestGroupGain } from "../analytics/groupGain";
import { GroupGainLine, Overview } from "./Overview";
import { Reconciliation } from "./Reconciliation";
import { Tabs } from "./Tabs";
import { CashflowChart } from "./charts/CashflowChart";
import { ContributionsChart } from "./charts/ContributionsChart";
import { CostGapChart } from "./charts/CostGapChart";
import { ReturnsChart } from "./charts/ReturnsChart";
import { ValueOverTime } from "./charts/ValueOverTime";
import { grandTotal, latestPeriod, loadAnalytics, loadReconciliation } from "./data";
import { formatCurrency } from "./format";
import { ProjectionsView } from "./projections/ProjectionsView";
import { ErrorBoundary } from "./states/ErrorBoundary";
import type { TabId } from "./useHashTab";
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

/**
 * Everything that reads a committed artifact. It is a separate component
 * from `App` so that `ErrorBoundary` sits above the code that parses, and a
 * malformed `analytics.json` renders the rebuild instructions rather than
 * unmounting the whole page.
 */
function Dashboard() {
  const analytics = loadAnalytics();
  const report = loadReconciliation();
  const years = yearsCovered(analytics);
  const latestYear = years[years.length - 1] ?? new Date().getUTCFullYear();
  const [year, setYear] = useState(latestYear);
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
    wrappers: (
      <YearScopedPanel years={years} year={year} onYearChange={setYear}>
        <RegisteredView analytics={analytics} year={year} />
      </YearScopedPanel>
    ),
    tax: (
      <YearScopedPanel years={years} year={year} onYearChange={setYear}>
        <TaxView analytics={analytics} year={year} />
      </YearScopedPanel>
    ),
    projections: <ProjectionsView analytics={analytics} />,
    reconciliation: <Reconciliation report={report} />,
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
      </Flex>
      <ValueOverTime series={analytics.series} />
      <Tabs panels={panels} />
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
