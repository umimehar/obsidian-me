import { describe, expect, test } from "bun:test";
import {
  type Sample,
  backgroundMatchesTheme,
  countsByPlacement,
  failures,
  formatFailure,
  formatSummary,
  measureSample,
  tightest,
  worstRatio,
} from "./audit";
import type { RawSample } from "./collect";

const AT = { tab: "overview", theme: "light" } as const;

/** A run of text on an opaque white page, with whatever paint the test cares about. */
function sample(overrides: Partial<RawSample> = {}): RawSample {
  return {
    selector: "main > div > span.rt-Text",
    text: "$241,739.67",
    fontSizePx: 12,
    fontWeight: 500,
    paint: "rgb(0, 0, 0)",
    paintProperty: "color",
    layers: [
      { background: "rgba(0, 0, 0, 0)", opacity: 1 },
      { background: "rgb(255, 255, 255)", opacity: 1 },
    ],
    ...overrides,
  };
}

describe("measureSample", () => {
  test("black on white is 21 and passes", () => {
    const result = measureSample(sample(), AT);
    if (result.kind !== "measured") throw new Error(result.reason);
    expect(result.ratio).toBeCloseTo(21, 5);
    expect(result.pass).toBe(true);
    expect(result.background).toBe("rgb(255, 255, 255)");
  });

  test("an alpha background is composited against what is behind it, not read as opaque", () => {
    // The whole point of the ancestor walk. Radix's soft surfaces are alpha
    // steps; reading rgba(0,0,0,0.5) as a colour gives black and a wrong ratio.
    const result = measureSample(
      sample({
        paint: "rgb(255, 255, 255)",
        layers: [
          { background: "rgba(0, 0, 0, 0.5)", opacity: 1 },
          { background: "rgb(255, 255, 255)", opacity: 1 },
        ],
      }),
      AT,
    );
    if (result.kind !== "measured") throw new Error(result.reason);
    expect(result.background).toBe("rgb(128, 128, 128)");
    expect(result.ratio).toBeCloseTo(3.98, 2);
  });

  test("a transparent ancestor is walked through to the opaque one above it", () => {
    const result = measureSample(
      sample({
        layers: [
          { background: "rgba(0, 0, 0, 0)", opacity: 1 },
          { background: "rgba(0, 0, 0, 0)", opacity: 1 },
          { background: "rgba(0, 0, 0, 0)", opacity: 1 },
          { background: "rgb(17, 17, 19)", opacity: 1 },
        ],
      }),
      AT,
    );
    if (result.kind !== "measured") throw new Error(result.reason);
    expect(result.background).toBe("rgb(17, 17, 19)");
  });

  test("an alpha foreground is composited too, so it is the colour a reader sees", () => {
    const result = measureSample(sample({ paint: "rgba(0, 0, 0, 0.5)" }), AT);
    if (result.kind !== "measured") throw new Error(result.reason);
    expect(result.foreground).toBe("rgb(128, 128, 128)");
  });

  test("an ancestor's opacity scales both the text and the surfaces under it", () => {
    const result = measureSample(
      sample({
        layers: [
          { background: "rgba(0, 0, 0, 0)", opacity: 1 },
          { background: "rgb(0, 0, 0)", opacity: 0.5 },
          { background: "rgb(255, 255, 255)", opacity: 1 },
        ],
      }),
      AT,
    );
    if (result.kind !== "measured") throw new Error(result.reason);
    expect(result.background).toBe("rgb(128, 128, 128)");
    expect(result.foreground).toBe("rgb(64, 64, 64)");
  });

  test("a 12px badge weight needs 4.5, and a ratio under it fails", () => {
    // The shape of the three failures phase 2c found in Chrome: 12px soft
    // badges between 4.2 and 4.5. The class-name proxy in App.a11y.test.tsx
    // cannot see a ratio at all; this is what that proxy stands in for.
    const result = measureSample(sample({ paint: "rgb(135, 135, 135)" }), AT);
    if (result.kind !== "measured") throw new Error(result.reason);
    expect(result.required).toBe(4.5);
    expect(result.large).toBe(false);
    expect(result.ratio).toBeLessThan(4.5);
    expect(result.pass).toBe(false);
  });

  test("the same colour at 32px passes, because large text only needs 3.0", () => {
    const result = measureSample(sample({ paint: "rgb(135, 135, 135)", fontSizePx: 32 }), AT);
    if (result.kind !== "measured") throw new Error(result.reason);
    expect(result.required).toBe(3);
    expect(result.pass).toBe(true);
  });

  test("a colour that will not parse is unresolved, never a silent pass", () => {
    const result = measureSample(sample({ paint: "color(display-p3 0.9 0.2 0.2)" }), AT);
    expect(result.kind).toBe("unresolved");
  });

  test("text with no opaque background anywhere above it is unresolved", () => {
    // Otherwise it would be measured against an assumed white canvas, which in
    // the dark theme is the one assumption that turns a failure into a pass.
    const result = measureSample(
      sample({ layers: [{ background: "rgba(0, 0, 0, 0)", opacity: 1 }] }),
      AT,
    );
    expect(result.kind).toBe("unresolved");
    if (result.kind !== "unresolved") return;
    expect(result.reason).toContain("no opaque background");
  });
});

describe("failures", () => {
  const measured = (ratio: number): Sample => ({
    kind: "measured",
    tab: "growth",
    theme: "light",
    selector: "span",
    text: "x",
    fontSizePx: 12,
    fontWeight: 400,
    foreground: "rgb(0, 0, 0)",
    background: "rgb(255, 255, 255)",
    ratio,
    required: 4.5,
    large: false,
    pass: ratio >= 4.5,
  });

  test("collects the failing ratios and the unresolved samples together", () => {
    const unresolved: Sample = {
      kind: "unresolved",
      tab: "tax",
      theme: "dark",
      selector: "span",
      text: "y",
      reason: "nope",
    };
    const bad = failures([measured(4.49), measured(9), unresolved]);
    expect(bad).toHaveLength(2);
  });

  test("exactly the required ratio passes; a hair under does not", () => {
    expect(failures([measured(4.5)])).toHaveLength(0);
    expect(failures([measured(4.4999)])).toHaveLength(1);
  });
});

describe("worstRatio and countsByPlacement", () => {
  const at = (theme: "light" | "dark", tab: string, ratio: number): Sample => ({
    kind: "measured",
    tab,
    theme,
    selector: "span",
    text: "x",
    fontSizePx: 12,
    fontWeight: 400,
    foreground: "rgb(0, 0, 0)",
    background: "rgb(255, 255, 255)",
    ratio,
    required: 4.5,
    large: false,
    pass: true,
  });

  test("the worst ratio is per theme, not across both", () => {
    const samples = [at("light", "overview", 5.2), at("dark", "overview", 7.74)];
    expect(worstRatio(samples, "light")).toBeCloseTo(5.2, 5);
    expect(worstRatio(samples, "dark")).toBeCloseTo(7.74, 5);
  });

  test("a theme with no samples reports null rather than a flattering number", () => {
    expect(worstRatio([at("light", "overview", 5.2)], "dark")).toBeNull();
  });

  test("counts are keyed by theme and tab, so an empty tab is visible", () => {
    const counts = countsByPlacement([
      at("light", "overview", 9),
      at("light", "overview", 8),
      at("dark", "tax", 9),
    ]);
    expect(counts.get("light/overview")).toBe(2);
    expect(counts.get("dark/tax")).toBe(1);
  });

  test("tightest reports the narrowest margins first, within one theme", () => {
    const samples = [
      at("light", "tax", 9),
      at("light", "overview", 5.2),
      at("light", "growth", 5.66),
      at("dark", "overview", 4.6),
    ];
    expect(tightest(samples, "light", 2).map((sample) => sample.ratio)).toEqual([5.2, 5.66]);
  });
});

describe("backgroundMatchesTheme", () => {
  test("a white page is the light theme and a near-black one is dark", () => {
    expect(backgroundMatchesTheme("light", { r: 255, g: 255, b: 255, a: 1 })).toBe(true);
    expect(backgroundMatchesTheme("dark", { r: 17, g: 17, b: 19, a: 1 })).toBe(true);
  });

  test("a white page is not the dark theme, which is how a stuck toggle is caught", () => {
    // Without this the run could sweep the light theme twice and report a clean
    // dark theme it never rendered.
    expect(backgroundMatchesTheme("dark", { r: 255, g: 255, b: 255, a: 1 })).toBe(false);
    expect(backgroundMatchesTheme("light", { r: 17, g: 17, b: 19, a: 1 })).toBe(false);
  });
});

describe("formatting", () => {
  test("a failure names the ratio, the requirement, the colours, the tab and the theme", () => {
    const text = formatFailure({
      kind: "measured",
      tab: "projections",
      theme: "light",
      selector: "div.rt-CalloutText",
      text: "Projections are not advice",
      fontSizePx: 14,
      fontWeight: 400,
      foreground: "rgb(143, 79, 0)",
      background: "rgb(254, 243, 221)",
      ratio: 4.43,
      required: 4.5,
      large: false,
      pass: false,
    });
    expect(text).toContain("4.43 < 4.50");
    expect(text).toContain("div.rt-CalloutText");
    expect(text).toContain("Projections are not advice");
    expect(text).toContain("light theme, projections tab");
    expect(text).toContain("rgb(143, 79, 0) on rgb(254, 243, 221)");
    expect(text).toContain("14.00px/400");
  });

  test("an unresolved sample says why, not just that it failed", () => {
    const text = formatFailure({
      kind: "unresolved",
      tab: "growth",
      theme: "dark",
      selector: "text[data-year-label]",
      text: "2025",
      reason: 'fill "none" did not parse',
    });
    expect(text).toContain("UNRESOLVED");
    expect(text).toContain("did not parse");
    expect(text).toContain("dark theme, growth tab");
  });

  test("the summary reports both themes even when one was never swept", () => {
    const summary = formatSummary([
      {
        kind: "measured",
        tab: "overview",
        theme: "light",
        selector: "span",
        text: "x",
        fontSizePx: 12,
        fontWeight: 400,
        foreground: "rgb(0, 0, 0)",
        background: "rgb(255, 255, 255)",
        ratio: 5.2,
        required: 4.5,
        large: false,
        pass: true,
      },
    ]);
    expect(summary).toContain("light/overview");
    expect(summary).toContain("1 text runs");
    expect(summary).toContain("worst light");
    expect(summary).toContain("no samples");
  });
});
