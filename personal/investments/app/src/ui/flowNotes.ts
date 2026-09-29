import type { FlowSummary } from "../analytics/flows/summary";

const FX_SPREAD_NOTE =
  "FX conversion spread is not stated in the statements; costs include only stated fees and withholding.";

/**
 * The Flow tab's note block, each line present only when the thing it names
 * is nonzero for the period: unpaired transfer legs, lagged pairs, in-kind
 * transfers with no cash value, symbols the asset class table does not
 * list, and the FX spread caveat -- shown only when the period actually
 * carries a stated cost, so a period with nothing to caveat says nothing.
 */
export function buildFlowNotes(summary: FlowSummary, inKindCount: number): string[] {
  const notes: string[] = [];
  if (summary.unpairedLegs > 0) {
    const noun = summary.unpairedLegs === 1 ? "leg" : "legs";
    notes.push(`${summary.unpairedLegs} transfer ${noun} not paired.`);
  }
  if (summary.laggedPairs > 0) {
    const noun = summary.laggedPairs === 1 ? "pair" : "pairs";
    notes.push(`${summary.laggedPairs} ${noun} matched a day or more apart.`);
  }
  if (inKindCount > 0) {
    const noun = inKindCount === 1 ? "transfer has" : "transfers have";
    notes.push(`${inKindCount} in kind ${noun} no cash value on the statement.`);
  }
  if (summary.unlistedSymbols.length > 0) {
    notes.push(
      `Counted as equities, not listed in the asset class table: ${summary.unlistedSymbols.join(", ")}.`,
    );
  }
  if (summary.costs > 0) notes.push(FX_SPREAD_NOTE);
  return notes;
}
