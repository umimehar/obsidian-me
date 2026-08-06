/**
 * The stated/derived grammar, in one place, because more than one chart draws
 * it and the words are the load-bearing part.
 *
 * A figure Wealthsimple printed and a figure this project reconstructed are
 * never drawn the same way, and never described in two different sets of
 * words either: a reader who has learnt what "derived here" means on the
 * returns chart must find the same phrase meaning the same thing on the
 * contributions chart.
 */
export type FigureSource = "stated" | "derived";

/** The dash a derived line carries. One constant, so a legend swatch cannot drift from the chart. */
export const DERIVED_DASH = "5 4";

/** The short form, for a badge beside a heading. */
export const SOURCE_BADGE: Readonly<Record<FigureSource, string>> = {
  stated: "Stated on statements",
  derived: "Derived here",
};

/** The long form, for a sentence inside an accessible summary. */
export const SOURCE_CLAUSE: Readonly<Record<FigureSource, string>> = {
  stated: "stated on Wealthsimple statements",
  derived: "derived here rather than stated on a statement",
};
