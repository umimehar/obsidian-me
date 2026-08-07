import { describe, expect, test } from "bun:test";
import {
  compositeOver,
  contrastRatio,
  formatRgb,
  isLargeText,
  parseCssColor,
  relativeLuminance,
  requiredRatio,
} from "./color";

describe("parseCssColor", () => {
  test("reads the two forms Chromium actually serialises", () => {
    expect(parseCssColor("rgb(17, 24, 28)")).toEqual({ r: 17, g: 24, b: 28, a: 1 });
    expect(parseCssColor("rgba(0, 0, 0, 0.62)")).toEqual({ r: 0, g: 0, b: 0, a: 0.62 });
  });

  test("reads the space-separated form, which is what a modern stylesheet may hand back", () => {
    expect(parseCssColor("rgb(1 2 3 / 0.5)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
  });

  test("transparent is black at zero alpha, not an unreadable colour", () => {
    expect(parseCssColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  test("hex in three, six and eight digits", () => {
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("#102030")).toEqual({ r: 16, g: 32, b: 48, a: 1 });
    expect(parseCssColor("#00000080")?.a).toBeCloseTo(0.502, 3);
  });

  test("color(srgb ...) channels are 0..1 and scale up to bytes", () => {
    expect(parseCssColor("color(srgb 1 0 0.5)")).toEqual({ r: 255, g: 0, b: 127.5, a: 1 });
  });

  test("a wide-gamut colour is unreadable rather than misread as sRGB", () => {
    // Treating display-p3 channels as sRGB would produce a confident wrong
    // ratio. The caller turns null into a failure, so this stays honest.
    expect(parseCssColor("color(display-p3 0.9 0.2 0.2)")).toBeNull();
  });

  test("a named colour or a var() is unreadable, not silently white", () => {
    expect(parseCssColor("rebeccapurple")).toBeNull();
    expect(parseCssColor("var(--gray-a11)")).toBeNull();
    expect(parseCssColor("")).toBeNull();
  });
});

describe("compositeOver", () => {
  test("a fully opaque source replaces the backdrop", () => {
    const source = { r: 10, g: 20, b: 30, a: 1 };
    expect(compositeOver(source, { r: 255, g: 255, b: 255, a: 1 })).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 1,
    });
  });

  test("a fully transparent source leaves the backdrop alone", () => {
    const backdrop = { r: 255, g: 255, b: 255, a: 1 };
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0 }, backdrop)).toEqual(backdrop);
  });

  test("half alpha black on white is mid grey, and the result is opaque", () => {
    const result = compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
    expect(result.r).toBeCloseTo(127.5, 5);
    expect(result.a).toBe(1);
  });
});

describe("contrastRatio", () => {
  test("black on white is 21, the maximum", () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
  });

  test("a colour against itself is 1", () => {
    const grey = { r: 120, g: 120, b: 120, a: 1 };
    expect(contrastRatio(grey, grey)).toBeCloseTo(1, 10);
  });

  test("the order of the two colours does not change the answer", () => {
    const one = { r: 30, g: 90, b: 60, a: 1 };
    const other = { r: 240, g: 240, b: 235, a: 1 };
    expect(contrastRatio(one, other)).toBeCloseTo(contrastRatio(other, one), 10);
  });

  test("#767676 on white is the canonical 4.54, just over the AA floor", () => {
    const grey = { r: 0x76, g: 0x76, b: 0x76, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(contrastRatio(grey, white)).toBeCloseTo(4.54, 2);
  });

  test("the projections disclaimer without highContrast is 4.43, the failure phase 2c found", () => {
    // Not a hand-picked pair. Chromium resolved exactly these two colours for
    // the amber surface callout on the projections tab with `highContrast`
    // removed, and `bun run contrast` reported 4.43 against the 4.5 floor.
    // Pinning them here means the arithmetic behind that verdict has a test
    // that does not need a browser to run.
    const amberText = { r: 171, g: 100, b: 0, a: 1 };
    const amberSurface = { r: 254, g: 251, b: 233, a: 1 };
    expect(contrastRatio(amberText, amberSurface)).toBeCloseTo(4.43, 2);
  });
});

describe("isLargeText", () => {
  test("18pt is 24px, and 23px at a normal weight is not large", () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23.9, 400)).toBe(false);
  });

  test("14pt bold is 18.66px, and the same size unbold is not large", () => {
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 400)).toBe(false);
    expect(isLargeText(18.65, 700)).toBe(false);
  });

  test("a 12px badge is never large, whatever its weight", () => {
    expect(isLargeText(12, 500)).toBe(false);
    expect(isLargeText(12, 900)).toBe(false);
  });
});

describe("requiredRatio", () => {
  test("normal text needs 4.5 and large text needs 3.0", () => {
    expect(requiredRatio(12, 500)).toBe(4.5);
    expect(requiredRatio(32, 700)).toBe(3);
  });
});

test("formatRgb rounds to whole channels so a failure is pasteable", () => {
  expect(formatRgb({ r: 127.5, g: 0.4, b: 254.6, a: 1 })).toBe("rgb(128, 0, 255)");
});

test("relativeLuminance puts white at 1 and black at 0", () => {
  expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1, 10);
  expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBe(0);
});
