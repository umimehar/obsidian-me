import { SegmentedControl } from "@radix-ui/themes";

export interface YearSelectProps {
  /** Oldest first, as the room and income maps are keyed. */
  years: readonly number[];
  year: number;
  onYearChange: (year: number) => void;
}

/**
 * Picks the calendar year the room and tax views report. The years come
 * from the corpus itself rather than the calendar, so a year with no
 * statements is never offered and the current year is never assumed.
 */
export function YearSelect({ years, year, onYearChange }: YearSelectProps) {
  return (
    <SegmentedControl.Root
      value={String(year)}
      onValueChange={(value) => {
        const parsed = Number(value);
        if (Number.isInteger(parsed)) onYearChange(parsed);
      }}
      aria-label="Tax year"
    >
      {years.map((candidate) => (
        <SegmentedControl.Item key={candidate} value={String(candidate)}>
          {candidate}
        </SegmentedControl.Item>
      ))}
    </SegmentedControl.Root>
  );
}
