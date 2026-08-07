import { Button, Flex, Heading, Text, Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { AnalyticsOutput } from "../analytics/build";
import { Overview } from "./Overview";
import { Reconciliation } from "./Reconciliation";
import { Tabs } from "./Tabs";
import { CashflowChart } from "./charts/CashflowChart";
import { ContributionsChart } from "./charts/ContributionsChart";
import { ReturnsChart } from "./charts/ReturnsChart";
import { ValueOverTime } from "./charts/ValueOverTime";
import { grandTotal, latestPeriod, loadAnalytics, loadReconciliation } from "./data";
import { formatCurrency } from "./format";
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

/** A tab with nothing built yet. A named heading rather than a blank region, so the tab does not read as broken. */
function EmptyPanel({ title, note }: { title: string; note: string }) {
  return (
    <Flex direction="column" gap="2">
      <Heading size="5" as="h2">
        {title}
      </Heading>
      <Text size="2" color="gray">
        {note}
      </Text>
    </Flex>
  );
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
  const total = grandTotal(analytics);
  const period = latestPeriod(analytics);

  const panels: Record<TabId, ReactNode> = {
    overview: <Overview analytics={analytics} />,
    growth: (
      <Flex direction="column" gap="6">
        <ReturnsChart returns={analytics.returns} series={analytics.series} />
        <ContributionsChart analytics={analytics} />
        <CashflowChart series={analytics.series} />
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
    projections: (
      <EmptyPanel
        title="Projections"
        note="A thirty year registered-room projection is coming in a later task."
      />
    ),
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
    <Theme appearance={appearance} accentColor="jade" grayColor="slate" radius="large">
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
