import { Theme } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { grandTotal, latestPeriod, loadAnalytics } from "./data";

type Appearance = "inherit" | "light" | "dark";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}

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

export function App() {
  const [appearance, setAppearance] = useState<Appearance>("inherit");
  const systemAppearance = useSystemAppearance();
  const effectiveAppearance = appearance === "inherit" ? systemAppearance : appearance;
  const analytics = loadAnalytics();
  const total = grandTotal(analytics);
  const period = latestPeriod(analytics);

  function toggleAppearance() {
    setAppearance(effectiveAppearance === "light" ? "dark" : "light");
  }

  return (
    <Theme appearance={appearance} accentColor="jade" grayColor="slate" radius="large">
      <main style={{ padding: "3rem", maxWidth: "40rem", margin: "0 auto" }}>
        <button type="button" onClick={toggleAppearance}>
          {effectiveAppearance === "light" ? "Switch to dark" : "Switch to light"}
        </button>
        <h1>Portfolio total</h1>
        <p style={{ fontSize: "2.5rem", fontWeight: 600 }}>{formatCurrency(total)}</p>
        {period !== null ? <p>As of {period}</p> : <p>No period data yet</p>}
      </main>
    </Theme>
  );
}
