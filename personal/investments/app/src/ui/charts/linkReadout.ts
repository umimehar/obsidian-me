import type { FlowGraph, FlowLink } from "../../analytics/flows/graph";
import { formatCurrency, formatShare } from "../format";

/** A band into any of these three is a cost or a loss to the outside, not a place money grows. */
const RED_TARGETS = new Set(["now:costs", "now:left", "now:unreconciled"]);

export type LinkFamily = "jade" | "red" | "gray";

/** A link's colour family: gray for anything recycled, red for a cost or a loss, jade otherwise. */
export function linkFamily(link: FlowLink): LinkFamily {
  if (link.recycled) return "gray";
  if (RED_TARGETS.has(link.target)) return "red";
  return "jade";
}

/** Base step for a link's own tone, or the `a9` step once it is hovered, focused or pinned. */
export function linkColor(link: FlowLink, active: boolean): string {
  const family = linkFamily(link);
  const step = active ? 9 : family === "gray" ? 5 : 6;
  return `var(--${family}-a${step})`;
}

/** The readout card's swatch colour: the band's own family at a solid, legible step -- not the dimmer translucent stroke step `linkColor` paints the band itself with. */
export function linkSwatchColor(link: FlowLink): string {
  return `var(--${linkFamily(link)}-9)`;
}

export type ReadoutRole =
  | "header"
  | "amount"
  | "shareTotal"
  | "shareSource"
  | "shareDestination"
  | "rows";

/** One line of a band's readout, tagged with the role that decides how the card renders it. */
export interface ReadoutLine {
  role: ReadoutRole;
  text: string;
}

function nodeLabelAndValue(id: string, graph: FlowGraph): { label: string; value: number } {
  const found = graph.nodes.find((n) => n.id === id);
  return { label: found?.label ?? id, value: found?.value ?? 0 };
}

/**
 * The ordered lines a hovered or focused band's readout states: the source
 * and destination, the amount, its share of all money in, its share of its
 * source and destination nodes, then how many statement rows sit behind it.
 *
 * The one place these figures are computed. The readout card, a band's
 * `aria-label` and its live announcement all render this same array, in
 * this same order (`readoutText` joins it into the one sentence the latter
 * two need), so none of the three can state a different figure than another
 * -- exactly the property `readoutSuffix` already holds for every other
 * chart's tooltip. Every figure is one `formatCurrency` or `formatShare`
 * call.
 *
 * `shareSource`/`shareDestination` are omitted when the node's own value is
 * zero, since a share of nothing is not a figure this project states.
 * `rows` reads the cash-balance sentence instead of a row count for a link
 * with no `rowIds` -- `now:cash` and `now:unreconciled` are populated from
 * each statement's own balances (`graph.ts`'s `cashTotalsLinks`), never
 * from individual rows.
 */
export function linkReadout(link: FlowLink, graph: FlowGraph): readonly ReadoutLine[] {
  const source = nodeLabelAndValue(link.source, graph);
  const destination = nodeLabelAndValue(link.target, graph);
  const shareOfTotal = graph.totalIn > 0 ? link.value / graph.totalIn : 0;

  const lines: ReadoutLine[] = [
    { role: "header", text: `${source.label} → ${destination.label}` },
    { role: "amount", text: formatCurrency(link.value) },
    { role: "shareTotal", text: `${formatShare(shareOfTotal)} of all money in` },
  ];
  if (source.value !== 0) {
    lines.push({
      role: "shareSource",
      text: `${formatShare(link.value / source.value)} of ${source.label}`,
    });
  }
  if (destination.value !== 0) {
    lines.push({
      role: "shareDestination",
      text: `${formatShare(link.value / destination.value)} of what reached ${destination.label}`,
    });
  }
  lines.push(
    link.rowIds.length === 0
      ? { role: "rows", text: "From the statements' cash balances" }
      : { role: "rows", text: `${link.rowIds.length} statement rows · click to see them` },
  );
  return lines;
}

/** Every line's text, joined into the one sentence `aria-label` and `CursorAnnouncement` speak. */
export function readoutText(lines: readonly ReadoutLine[]): string {
  return `${lines.map((l) => l.text).join(". ")}.`;
}

/**
 * The pinned readout's own plain line above the chart (TCK-0013): the
 * card's first three lines -- source and destination, the amount, and the
 * share of all money in -- joined into one sentence, from the exact same
 * strings the card itself renders.
 */
export function firstLinesText(lines: readonly ReadoutLine[]): string {
  return lines
    .filter((l) => l.role === "header" || l.role === "amount" || l.role === "shareTotal")
    .map((l) => l.text)
    .join(", ");
}
