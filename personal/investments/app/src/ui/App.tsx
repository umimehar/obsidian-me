import { Flex, Theme } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import type { AnalyticsOutput } from "../analytics/build";
import { Overview } from "./Overview";
import { loadAnalytics } from "./data";
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

export function App() {
  const [appearance, setAppearance] = useState<Appearance>("inherit");
  const systemAppearance = useSystemAppearance();
  const effectiveAppearance = appearance === "inherit" ? systemAppearance : appearance;
  const analytics = loadAnalytics();
  const years = yearsCovered(analytics);
  const latestYear = years[years.length - 1] ?? new Date().getUTCFullYear();
  const [year, setYear] = useState(latestYear);

  function toggleAppearance() {
    setAppearance(effectiveAppearance === "light" ? "dark" : "light");
  }

  return (
    <Theme appearance={appearance} accentColor="jade" grayColor="slate" radius="large">
      <main style={{ padding: "3rem", maxWidth: "40rem", margin: "0 auto" }}>
        <button type="button" onClick={toggleAppearance}>
          {effectiveAppearance === "light" ? "Switch to dark" : "Switch to light"}
        </button>
        <Flex direction="column" gap="6">
          <Overview analytics={analytics} />
          <YearSelect years={years} year={year} onYearChange={setYear} />
          <RegisteredView analytics={analytics} year={year} />
          <TaxView analytics={analytics} year={year} />
        </Flex>
      </main>
    </Theme>
  );
}
