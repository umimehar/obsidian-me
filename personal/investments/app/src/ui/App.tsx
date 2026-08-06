import { Button, Flex, Heading, Theme } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import type { AnalyticsOutput } from "../analytics/build";
import { Overview } from "./Overview";
import { Reconciliation } from "./Reconciliation";
import { loadAnalytics, loadReconciliation } from "./data";
import { ErrorBoundary } from "./states/ErrorBoundary";
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

  return (
    <Flex direction="column" gap="6">
      <Overview analytics={analytics} />
      <YearSelect years={years} year={year} onYearChange={setYear} />
      <RegisteredView analytics={analytics} year={year} />
      <TaxView analytics={analytics} year={year} />
      <Reconciliation report={report} />
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
