import { SegmentedControl } from "@radix-ui/themes";
import type { YearScope } from "./scope";

export interface YearFilterProps {
  years: readonly number[];
  scope: YearScope;
  onScopeChange: (scope: YearScope) => void;
}

/** The value `SegmentedControl` carries for "every year at once". */
const ALL = "all";

/**
 * The dashboard's one year control.
 *
 * It sits above the tabs beside the portfolio figures, not inside a panel,
 * because it scopes every panel: a control that lives on one tab but changes
 * six others is a control in the wrong place. The years come from the corpus
 * rather than the calendar, so a year with no statements is never offered.
 *
 * "All time" leads and is the default. A year is a lens over the same data,
 * never a different dataset, and the unfiltered view is the one that matches
 * what the corpus actually holds.
 */
export function YearFilter({ years, scope, onScopeChange }: YearFilterProps) {
  return (
    <SegmentedControl.Root
      size="1"
      value={scope === "all" ? ALL : String(scope)}
      onValueChange={(value) => {
        if (value === ALL) {
          onScopeChange("all");
          return;
        }
        const parsed = Number(value);
        // Guarded rather than trusted: the control's own values are safe, but
        // this is also the path a restored hash takes on first render.
        if (Number.isInteger(parsed)) onScopeChange(parsed);
      }}
      aria-label="Year"
      data-year-filter=""
    >
      <SegmentedControl.Item value={ALL}>All time</SegmentedControl.Item>
      {years.map((year) => (
        <SegmentedControl.Item key={year} value={String(year)}>
          {year}
        </SegmentedControl.Item>
      ))}
    </SegmentedControl.Root>
  );
}
