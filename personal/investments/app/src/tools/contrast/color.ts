/**
 * The colour arithmetic behind the contrast check, kept out of the browser so
 * it can be unit tested without one.
 *
 * The browser only reports strings: a computed `color`, a computed `fill`, and
 * the `background-color` of every ancestor. Turning those into a ratio is the
 * part that can be wrong in a way nobody notices, so it lives here in pure
 * functions with tests rather than inside a `page.evaluate` callback.
 */

export interface Rgba {
  /** 0..255 */
  r: number;
  /** 0..255 */
  g: number;
  /** 0..255 */
  b: number;
  /** 0..1 */
  a: number;
}

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTIONAL = /^(rgba?|color)\((.*)\)$/i;

function hexPairs(digits: string): number[] | null {
  const expanded =
    digits.length === 3 || digits.length === 4
      ? [...digits].map((digit) => digit + digit).join("")
      : digits;
  if (expanded.length !== 6 && expanded.length !== 8) return null;
  const bytes: number[] = [];
  for (let index = 0; index < expanded.length; index += 2) {
    bytes.push(Number.parseInt(expanded.slice(index, index + 2), 16));
  }
  return bytes;
}

function fromHex(value: string): Rgba | null {
  const match = HEX.exec(value);
  if (match === null) return null;
  const bytes = hexPairs(match[1] ?? "");
  if (bytes === null) return null;
  const [r = 0, g = 0, b = 0, alpha] = bytes;
  return { r, g, b, a: alpha === undefined ? 1 : alpha / 255 };
}

/** The numbers inside `rgb(...)` / `color(srgb ...)`, in either comma or space form. */
function numbers(body: string): number[] {
  return body
    .split(/[,\s/]+/)
    .filter((part) => part.length > 0)
    .map(Number);
}

function fromRgbFunction(body: string): Rgba | null {
  const parts = numbers(body);
  const [r, g, b, a] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return { r, g, b, a: a === undefined ? 1 : a };
}

/**
 * `color(srgb r g b / a)`, whose channels are 0..1 rather than 0..255.
 *
 * Only the sRGB space is accepted. Chromium serialises Radix's P3 tokens back
 * as `rgb()` on this page, but if a future stylesheet does hand out a wide
 * gamut colour the right answer is to fail loudly rather than to misread the
 * channels as sRGB and report a confident wrong ratio.
 */
function fromColorFunction(body: string): Rgba | null {
  const trimmed = body.trim();
  if (!trimmed.toLowerCase().startsWith("srgb")) return null;
  const parts = numbers(trimmed.slice(4));
  const [r, g, b, a] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  return { r: r * 255, g: g * 255, b: b * 255, a: a === undefined ? 1 : a };
}

/**
 * A computed CSS colour string as channels, or `null` when this module cannot
 * be sure what the browser meant.
 *
 * `null` is a hard error at the call site, never a skipped element -- a parser
 * that silently drops what it does not understand is how a check ends up
 * sweeping less than it claims to.
 */
export function parseCssColor(value: string): Rgba | null {
  const trimmed = value.trim();
  if (trimmed === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (trimmed.startsWith("#")) return fromHex(trimmed);
  const match = FUNCTIONAL.exec(trimmed);
  if (match === null) return null;
  const body = match[2] ?? "";
  return match[1]?.toLowerCase() === "color" ? fromColorFunction(body) : fromRgbFunction(body);
}

/** `source` painted over `backdrop`, source-over. `backdrop` is assumed opaque. */
export function compositeOver(source: Rgba, backdrop: Rgba): Rgba {
  const alpha = Math.min(Math.max(source.a, 0), 1);
  return {
    r: source.r * alpha + backdrop.r * (1 - alpha),
    g: source.g * alpha + backdrop.g * (1 - alpha),
    b: source.b * alpha + backdrop.b * (1 - alpha),
    a: 1,
  };
}

function channelLuminance(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

/** The WCAG contrast ratio between two opaque colours, 1..21. */
export function contrastRatio(one: Rgba, other: Rgba): number {
  const first = relativeLuminance(one);
  const second = relativeLuminance(other);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * WCAG "large scale" text: 18pt, or 14pt bold. In CSS pixels at the default
 * 96dpi that is 24px, or 18.66px at weight 700 and up.
 *
 * Both numbers matter in the same direction. Calling 18.66px at weight 400
 * large would drop its requirement from 4.5 to 3.0 and let a genuine failure
 * through, which is the only way this check can be wrong and still be green.
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontWeight >= 700 ? fontSizePx >= 18.66 : fontSizePx >= 24;
}

/** The AA floor for text of this size and weight. */
export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5;
}

/** `rgb(r, g, b)` with channels rounded, for a failure a reader can paste into devtools. */
export function formatRgb(color: Rgba): string {
  const round = (channel: number) => Math.round(channel);
  return `rgb(${round(color.r)}, ${round(color.g)}, ${round(color.b)})`;
}
