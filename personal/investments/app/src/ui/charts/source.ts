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

/** The stroke every legend swatch is outlined with, in user units. */
export const SWATCH_STROKE_WIDTH = 1;

/**
 * A legend swatch's rect, inset by half its stroke.
 *
 * A rect drawn at the full width and height of its own `<svg>` has its stroke
 * centred on that edge, so half the stroke falls outside the viewport and is
 * clipped away. On the solid swatch that only thins a border. On the derived
 * swatch it eats most of the dashes, which is the single thing that swatch
 * exists to show, and a legend whose swatch does not look like the mark it
 * names teaches the wrong grammar.
 *
 * Spread onto the rect, so the geometry and the stroke width cannot be set in
 * two places and disagree.
 */
export function swatchRect(width: number, height: number) {
  const inset = SWATCH_STROKE_WIDTH / 2;
  return {
    x: inset,
    y: inset,
    width: width - SWATCH_STROKE_WIDTH,
    height: height - SWATCH_STROKE_WIDTH,
    strokeWidth: SWATCH_STROKE_WIDTH,
  };
}

/** The long form, for a sentence inside an accessible summary. */
export const SOURCE_CLAUSE: Readonly<Record<FigureSource, string>> = {
  stated: "stated on Wealthsimple statements",
  derived: "derived here rather than stated on a statement",
};
