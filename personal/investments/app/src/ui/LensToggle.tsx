import { SegmentedControl } from "@radix-ui/themes";
import type { Lens } from "../analytics/rollup";

export interface LensToggleProps {
  lens: Lens;
  onLensChange: (lens: Lens) => void;
}

const LENS_OPTIONS: ReadonlyArray<{ value: Lens; label: string }> = [
  { value: "registration", label: "By registration" },
  { value: "account", label: "By account" },
  { value: "purpose", label: "By purpose" },
];

const LENS_VALUES: ReadonlySet<string> = new Set<Lens>(["registration", "account", "purpose"]);

/** A type-checked narrowing of Radix's `string` callback value, never an unchecked cast. */
function isLens(value: string): value is Lens {
  return LENS_VALUES.has(value);
}

/**
 * Switches which of the three rollups (`analytics.rollups[lens]`) the
 * overview renders. It never recomputes a rollup itself -- all three are
 * already built into `analytics.json` -- so this is purely a selector.
 */
export function LensToggle({ lens, onLensChange }: LensToggleProps) {
  return (
    <SegmentedControl.Root
      value={lens}
      onValueChange={(value) => {
        if (isLens(value)) onLensChange(value);
      }}
      aria-label="Group accounts by"
    >
      {LENS_OPTIONS.map((option) => (
        <SegmentedControl.Item key={option.value} value={option.value}>
          {option.label}
        </SegmentedControl.Item>
      ))}
    </SegmentedControl.Root>
  );
}
