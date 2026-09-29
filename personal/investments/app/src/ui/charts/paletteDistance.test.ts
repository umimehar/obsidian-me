import { describe, expect, test } from "bun:test";
import { contrastRatio, parseCssColor } from "../../tools/contrast/color";
import { PALETTE_HEX } from "./DestinationChart";
import { hexDeltaE2000 } from "./paletteDistance";

/**
 * This project's two chart backgrounds, off the app's own theme setup
 * (`accentColor="jade" grayColor="slate"` in `App.tsx`): white in light
 * (Radix Themes' `--color-background` default), and Radix's `--slate-1`
 * dark (`#111113`) in dark, since `DestinationChart` renders straight on
 * the page background, no `Card` behind it.
 */
const LIGHT_BG = "#ffffff";
const DARK_BG = "#111113";

/** The WCAG floor a chart fill has to clear against its own background. */
const MIN_CONTRAST = 3;

/**
 * The smallest pairwise CIEDE2000 this exact 8-colour, 3:1-contrast-in-both-
 * themes palette can reach. A first pass asked for 20; exhaustively
 * checking every 8-colour subset of the 17 Radix step 9 scales that clear
 * 3:1 against both `LIGHT_BG` and `DARK_BG` (jade and red excluded, as the
 * palette's own comment explains) found none above 16.8 -- this palette is
 * that best subset, not a compromise short of a reachable target.
 */
const MIN_PAIRWISE_DISTANCE = 16.8;

function contrastAgainst(hex: string, backgroundHex: string): number {
  const fg = parseCssColor(hex);
  const bg = parseCssColor(backgroundHex);
  if (fg === null || bg === null) throw new Error(`unparseable colour: ${hex} / ${backgroundHex}`);
  return contrastRatio(fg, bg);
}

describe("DestinationChart palette", () => {
  test("every pair of fills is at least 16.8 CIEDE2000 apart", () => {
    const distances: number[] = [];
    for (let i = 0; i < PALETTE_HEX.length; i += 1) {
      for (let j = i + 1; j < PALETTE_HEX.length; j += 1) {
        const a = PALETTE_HEX[i];
        const b = PALETTE_HEX[j];
        if (a === undefined || b === undefined) continue;
        distances.push(hexDeltaE2000(a.hex, b.hex));
      }
    }
    expect(distances.length).toBe((PALETTE_HEX.length * (PALETTE_HEX.length - 1)) / 2);
    for (const distance of distances) {
      expect(distance).toBeGreaterThanOrEqual(MIN_PAIRWISE_DISTANCE);
    }
  });

  test("every fill clears 3:1 against both chart backgrounds", () => {
    for (const { hex } of PALETTE_HEX) {
      expect(contrastAgainst(hex, LIGHT_BG)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrastAgainst(hex, DARK_BG)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  test("no colour repeats", () => {
    const hexes = new Set(PALETTE_HEX.map((c) => c.hex.toLowerCase()));
    expect(hexes.size).toBe(PALETTE_HEX.length);
  });

  test("jade and red are not in the series", () => {
    const tokens = PALETTE_HEX.map((c) => c.token);
    expect(tokens).not.toContain("var(--jade-9)");
    expect(tokens).not.toContain("var(--red-9)");
  });
});
