import { describe, expect, test } from "bun:test";
import { SWATCH_STROKE_WIDTH, swatchRect } from "./source";

describe("a legend swatch's stroke stays inside its own viewport", () => {
  /**
   * Found in a browser, not by this suite before it existed: the swatch rects
   * were drawn at the full 28x12 of their `<svg>`, so the stroke, centred on
   * the edge, hung half outside the viewport and was clipped. The derived
   * swatch's dashes are what that erased, and those dashes are the whole
   * reason the swatch is drawn at all.
   */
  test("the rect is inset by half the stroke on every side", () => {
    const rect = swatchRect(28, 12);
    expect(rect.x).toBe(SWATCH_STROKE_WIDTH / 2);
    expect(rect.y).toBe(SWATCH_STROKE_WIDTH / 2);
    expect(rect.x + rect.width).toBe(28 - SWATCH_STROKE_WIDTH / 2);
    expect(rect.y + rect.height).toBe(12 - SWATCH_STROKE_WIDTH / 2);
  });

  test("the stroke it declares is the stroke it leaves room for", () => {
    const rect = swatchRect(28, 12);
    expect(rect.strokeWidth).toBe(SWATCH_STROKE_WIDTH);
    // The outer edge of the stroke, not the rect's own edge, is what must fit.
    expect(rect.x - rect.strokeWidth / 2).toBe(0);
    expect(rect.x + rect.width + rect.strokeWidth / 2).toBe(28);
  });

  test("it holds at other sizes, since the inset is not a hardcoded 0.5", () => {
    const rect = swatchRect(40, 20);
    expect(rect.width).toBe(40 - SWATCH_STROKE_WIDTH);
    expect(rect.height).toBe(20 - SWATCH_STROKE_WIDTH);
  });
});
