import { Text } from "@radix-ui/themes";
import type { latestGroupGain } from "../analytics/groupGain";
import { formatCurrency, formatGainWithShare } from "./format";

export interface SummaryStripProps {
  total: number;
  period: string | null;
  figures: ReturnType<typeof latestGroupGain>;
}

/**
 * The portfolio figures every tab but Portfolio itself carries above its own
 * panel, so the year scope and the headline total stay reachable without the
 * hero chart repeating on every tab. One line, from the same
 * `formatCurrency`/`formatGainWithShare` calls the Portfolio tab's own
 * headline uses, so the two can never disagree in wording or precision.
 */
export function SummaryStrip({ total, period, figures }: SummaryStripProps) {
  return (
    <Text size="2" color="gray" data-summary-strip="">
      Portfolio {formatCurrency(total)}
      {period === null ? "" : ` as of ${period}`}
      {figures === null
        ? ""
        : ` · ${formatGainWithShare(figures.gain, figures.bookCost)} against book cost`}
    </Text>
  );
}
