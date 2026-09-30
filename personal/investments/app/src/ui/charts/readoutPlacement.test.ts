import { describe, expect, test } from "bun:test";
import { placeReadoutCard } from "./readoutPlacement";
import type { LabelBox } from "./sankeyLayout";

const CARD = { width: 100, height: 50 };
const BOUNDS = { width: 800, height: 400 };

function box(id: string, x0: number, y0: number, x1: number, y1: number): LabelBox {
  return { id, x0, y0, x1, y1 };
}

describe("placeReadoutCard", () => {
  test("sits to the anchor's right by default, when the anchor is in the left half", () => {
    const placement = placeReadoutCard({
      anchor: { x: 100, y: 100 },
      cardSize: CARD,
      bounds: BOUNDS,
      avoid: [],
    });
    expect(placement.left).toBeGreaterThan(100);
  });

  test("flips to the anchor's left when the anchor is in the right half", () => {
    const placement = placeReadoutCard({
      anchor: { x: 700, y: 100 },
      cardSize: CARD,
      bounds: BOUNDS,
      avoid: [],
    });
    expect(placement.left).toBeLessThan(700);
  });

  test("stays fully inside the chart's own bounds, near an edge", () => {
    const placement = placeReadoutCard({
      anchor: { x: 5, y: 5 },
      cardSize: CARD,
      bounds: BOUNDS,
      avoid: [],
    });
    expect(placement.left).toBeGreaterThanOrEqual(0);
    expect(placement.top).toBeGreaterThanOrEqual(0);
    expect(placement.left + CARD.width).toBeLessThanOrEqual(BOUNDS.width);
    expect(placement.top + CARD.height).toBeLessThanOrEqual(BOUNDS.height);
  });

  test("picks the side clear of the two node labels when the preferred side would cover one", () => {
    // The preferred (right) side would land the card on top of the source
    // label sitting just to the anchor's right; the left side is clear.
    const rightLabel = box("source", 110, 80, 260, 120);
    const placement = placeReadoutCard({
      anchor: { x: 100, y: 100 },
      cardSize: CARD,
      bounds: BOUNDS,
      avoid: [rightLabel],
    });
    expect(placement.left).toBeLessThan(100);
  });

  test("never overlaps either of the two node labels when a clear side exists", () => {
    const sourceLabel = box("source", 0, 80, 90, 120);
    const destLabel = box("dest", 780, 80, 800, 120);
    const placement = placeReadoutCard({
      anchor: { x: 400, y: 100 },
      cardSize: CARD,
      bounds: BOUNDS,
      avoid: [sourceLabel, destLabel],
    });
    const cardBox = {
      x0: placement.left,
      y0: placement.top,
      x1: placement.left + CARD.width,
      y1: placement.top + CARD.height,
    };
    for (const label of [sourceLabel, destLabel]) {
      const overlaps =
        cardBox.x0 < label.x1 &&
        label.x0 < cardBox.x1 &&
        cardBox.y0 < label.y1 &&
        label.y0 < cardBox.y1;
      expect(overlaps).toBe(false);
    }
  });
});
