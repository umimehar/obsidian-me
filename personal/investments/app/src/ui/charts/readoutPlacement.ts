import type { LabelBox } from "./sankeyLayout";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface CardPlacement {
  left: number;
  top: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function rectAt(left: number, top: number, size: Size): Rect {
  return { x0: left, y0: top, x1: left + size.width, y1: top + size.height };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** A candidate box pulled fully inside `bounds`, never made larger than it. */
function clampToBounds(left: number, top: number, size: Size, bounds: Size): CardPlacement {
  return {
    left: Math.min(Math.max(left, 0), Math.max(0, bounds.width - size.width)),
    top: Math.min(Math.max(top, 0), Math.max(0, bounds.height - size.height)),
  };
}

const GAP = 12;

export interface PlaceReadoutCardArgs {
  /** The hovered or focused band's own midpoint, in the chart's own coordinate units. */
  anchor: Point;
  cardSize: Size;
  /** The chart's own plotted region -- the SVG's `viewBox` extent, since the card renders inside it. */
  bounds: Size;
  /** The active band's two node labels, the only boxes the card must never cover. */
  avoid: readonly LabelBox[];
}

/**
 * Where the readout card sits for the currently hovered or focused band: to
 * the anchor's right by default, or its left when the anchor sits in the
 * bounds' own right half -- the same "flip near an edge" rule
 * `tooltipAnchorStyle` already applies to the flat-line tooltip, so a card
 * opened near the chart's right edge does not hang off it. Both sides are
 * clamped fully inside `bounds` first, then checked against `avoid`; the
 * first side that clears both node labels wins, and if neither does, the
 * preferred side is still returned rather than leaving the card unplaced --
 * a card can always be dismissed by moving the pointer, an occluded label
 * cannot recover on its own.
 */
export function placeReadoutCard(args: PlaceReadoutCardArgs): CardPlacement {
  const { anchor, cardSize, bounds, avoid } = args;
  const preferRight = anchor.x <= bounds.width - anchor.x;
  const sides: readonly ("right" | "left")[] = preferRight ? ["right", "left"] : ["left", "right"];
  const candidates = sides.map((side) => {
    const left = side === "right" ? anchor.x + GAP : anchor.x - GAP - cardSize.width;
    const top = anchor.y - cardSize.height / 2;
    return clampToBounds(left, top, cardSize, bounds);
  });
  const clear = candidates.find(
    (candidate) =>
      !avoid.some((box) => intersects(rectAt(candidate.left, candidate.top, cardSize), box)),
  );
  return clear ?? candidates[0] ?? { left: 0, top: 0 };
}
