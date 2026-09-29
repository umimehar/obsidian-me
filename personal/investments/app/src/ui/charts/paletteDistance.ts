/**
 * CIEDE2000 colour distance, for `paletteDistance.test.ts`'s pairwise check
 * on `DestinationChart.PALETTE_HEX`. Pure and dependency free, the same
 * shape as `src/tools/contrast/color.ts`'s arithmetic: kept out of the
 * browser so it stays testable without one, and never imported by
 * `DestinationChart.tsx` itself, which paints from the CSS custom
 * properties only.
 */

export interface Lab {
  l: number;
  a: number;
  b: number;
}

function srgbToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** Hex (`"#rrggbb"`) to CIE L*a*b*, D65 white point, the standard sRGB path. */
export function hexToLab(hex: string): Lab {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const r = srgbToLinear((value >> 16) & 0xff);
  const g = srgbToLinear((value >> 8) & 0xff);
  const b = srgbToLinear(value & 0xff);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  return { l: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Hue difference between two already-primed a'/b' pairs, wrapped to (-180, 180]. */
function hueDelta(h1: number, h2: number): number {
  const raw = h2 - h1;
  if (Math.abs(raw) <= 180) return raw;
  return raw > 0 ? raw - 360 : raw + 360;
}

/** The mean hue two primed a'/b' pairs share, wrapped the same way `hueDelta` is. */
function hueMean(h1: number, h2: number): number {
  return Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + 360) / 2;
}

/**
 * CIEDE2000 (Sharma, Wu & Dalal 2005), the perceptual distance between two
 * Lab colours -- roughly 1 unit per just-noticeable difference, so 20+
 * reads as clearly, comfortably distinct rather than merely different in
 * a formula. kL = kC = kH = 1, the reference implementation's defaults.
 */
export function deltaE2000(one: Lab, other: Lab): number {
  const cBar = (Math.hypot(one.a, one.b) + Math.hypot(other.a, other.b)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + g) * one.a;
  const a2p = (1 + g) * other.a;
  const c1p = Math.hypot(a1p, one.b);
  const c2p = Math.hypot(a2p, other.b);
  const h1p = (toDeg(Math.atan2(one.b, a1p)) + 360) % 360;
  const h2p = (toDeg(Math.atan2(other.b, a2p)) + 360) % 360;

  const dL = other.l - one.l;
  const dC = c2p - c1p;
  const dhp = hueDelta(h1p, h2p);
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(toRad(dhp / 2));

  const lBar = (one.l + other.l) / 2;
  const cBarP = (c1p + c2p) / 2;
  const hBarP = hueMean(h1p, h2p);
  const t =
    1 -
    0.17 * Math.cos(toRad(hBarP - 30)) +
    0.24 * Math.cos(toRad(2 * hBarP)) +
    0.32 * Math.cos(toRad(3 * hBarP + 6)) -
    0.2 * Math.cos(toRad(4 * hBarP - 63));
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(toRad(2 * dTheta)) * rc;

  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

/** `deltaE2000(hexToLab(one), hexToLab(other))`, for callers with hex strings rather than Lab. */
export function hexDeltaE2000(one: string, other: string): number {
  return deltaE2000(hexToLab(one), hexToLab(other));
}
