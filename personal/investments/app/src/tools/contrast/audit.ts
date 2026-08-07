import type { RawLayer, RawSample } from "./collect";
import {
  type Rgba,
  compositeOver,
  contrastRatio,
  formatRgb,
  isLargeText,
  parseCssColor,
  relativeLuminance,
  requiredRatio,
} from "./color";

export type Theme = "light" | "dark";

/** Which tab and theme a sample was taken on. Half of what makes a failure actionable. */
export interface Placement {
  tab: string;
  theme: Theme;
}

export interface Measurement extends Placement {
  kind: "measured";
  selector: string;
  text: string;
  fontSizePx: number;
  fontWeight: number;
  /** The paint composited over its own background, which is what a reader sees. */
  foreground: string;
  /** The opaque colour behind the text, after every alpha layer above it. */
  background: string;
  ratio: number;
  required: number;
  large: boolean;
  pass: boolean;
}

/**
 * A sample whose colours this check could not resolve. Never silently dropped:
 * an unresolved sample is a hole in the sweep, so it fails the run the same way
 * a low ratio does.
 */
export interface Unresolved extends Placement {
  kind: "unresolved";
  selector: string;
  text: string;
  reason: string;
}

export type Sample = Measurement | Unresolved;

/** What the browser paints where nothing else does. */
const CANVAS: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/**
 * The opacity each layer is actually drawn at: its own, times every opacity
 * above it. `opacity` applies to a whole subtree, so an ancestor at 0.5 halves
 * both its own background and the text inside it.
 */
function effectiveOpacities(layers: readonly RawLayer[]): number[] {
  const scales = new Array<number>(layers.length).fill(1);
  let running = 1;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const own = layers[index]?.opacity;
    running *= own === undefined || !Number.isFinite(own) ? 1 : own;
    scales[index] = running;
  }
  return scales;
}

interface Backdrop {
  color: Rgba;
  /** True once some layer is fully opaque, so the canvas colour cannot affect the answer. */
  grounded: boolean;
}

/**
 * What sits behind a run of text, composited back to front.
 *
 * Radix paints most surfaces in alpha steps -- `--gray-a2`, `--jade-a3` -- so
 * reading only the immediate parent's `background-color` gives a translucent
 * colour that no contrast formula accepts. This walks the whole ancestor chain
 * and blends it.
 */
function resolveBackdrop(layers: readonly RawLayer[], scales: readonly number[]): Backdrop | null {
  let color = CANVAS;
  let grounded = false;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const raw = layers[index]?.background;
    if (raw === undefined) return null;
    const parsed = parseCssColor(raw);
    if (parsed === null) return null;
    const alpha = parsed.a * (scales[index] ?? 1);
    if (alpha >= 1) grounded = true;
    color = compositeOver({ ...parsed, a: alpha }, color);
  }
  return { color, grounded };
}

function unresolved(raw: RawSample, at: Placement, reason: string): Unresolved {
  return { kind: "unresolved", ...at, selector: raw.selector, text: raw.text, reason };
}

/** One collected run of text, turned into a ratio and a verdict. */
export function measureSample(raw: RawSample, at: Placement): Sample {
  const scales = effectiveOpacities(raw.layers);
  const backdrop = resolveBackdrop(raw.layers, scales);
  if (backdrop === null) {
    return unresolved(raw, at, "an ancestor background-color did not parse");
  }
  if (!backdrop.grounded) {
    return unresolved(raw, at, "no opaque background anywhere above it");
  }
  const paint = parseCssColor(raw.paint);
  if (paint === null) {
    return unresolved(raw, at, `${raw.paintProperty} "${raw.paint}" did not parse`);
  }
  const foreground = compositeOver({ ...paint, a: paint.a * (scales[0] ?? 1) }, backdrop.color);
  const ratio = contrastRatio(foreground, backdrop.color);
  const required = requiredRatio(raw.fontSizePx, raw.fontWeight);
  return {
    kind: "measured",
    ...at,
    selector: raw.selector,
    text: raw.text,
    fontSizePx: raw.fontSizePx,
    fontWeight: raw.fontWeight,
    foreground: formatRgb(foreground),
    background: formatRgb(backdrop.color),
    ratio,
    required,
    large: isLargeText(raw.fontSizePx, raw.fontWeight),
    pass: ratio >= required,
  };
}

/** Everything that is wrong: a ratio under its floor, or a sample that could not be read. */
export function failures(samples: readonly Sample[]): Sample[] {
  return samples.filter((sample) => sample.kind === "unresolved" || !sample.pass);
}

/** The lowest ratio measured in one theme, or `null` if that theme has no measurements. */
export function worstRatio(samples: readonly Sample[], theme: Theme): number | null {
  let worst: number | null = null;
  for (const sample of samples) {
    if (sample.kind !== "measured" || sample.theme !== theme) continue;
    if (worst === null || sample.ratio < worst) worst = sample.ratio;
  }
  return worst;
}

/** How many runs of text were swept on each tab, per theme. Keyed `"<theme>/<tab>"`. */
export function countsByPlacement(samples: readonly Sample[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sample of samples) {
    const key = `${sample.theme}/${sample.tab}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Whether the page's own background is the one this theme is supposed to have.
 *
 * The guard against the worst failure this check could have: sweeping the light
 * theme twice and reporting a clean dark theme it never looked at. The dark
 * theme is only reachable through the app's toggle -- `appearance="inherit"`
 * resolves to light whatever the OS prefers -- so "did the toggle take effect"
 * has to be asserted rather than assumed.
 */
export function backgroundMatchesTheme(theme: Theme, background: Rgba): boolean {
  const luminance = relativeLuminance(background);
  return theme === "light" ? luminance > 0.5 : luminance < 0.2;
}

function round(value: number): string {
  return value.toFixed(2);
}

/**
 * One failure, in full. A reader has to be able to act on this without opening
 * the page: what, where, what it measured, and what it needed.
 */
export function formatFailure(sample: Sample): string {
  const where = `${sample.theme} theme, ${sample.tab} tab`;
  if (sample.kind === "unresolved") {
    return [
      `  UNRESOLVED  ${sample.selector}`,
      `              "${sample.text}"`,
      `              ${where} -- ${sample.reason}`,
    ].join("\n");
  }
  const size = `${round(sample.fontSizePx)}px/${sample.fontWeight}${sample.large ? " (large)" : ""}`;
  return [
    `  ${round(sample.ratio)} < ${round(sample.required)}  ${sample.selector}`,
    `              "${sample.text}"`,
    `              ${where}, ${size}`,
    `              foreground ${sample.foreground} on ${sample.background}`,
  ].join("\n");
}

/**
 * The tightest measurements in one theme, worst first.
 *
 * Printed on a passing run as well as a failing one: a margin that has quietly
 * fallen from 5.20 to 4.55 is the warning that the next colour change breaks
 * something, and a summary that only ever says "pass" never shows it.
 */
export function tightest(samples: readonly Sample[], theme: Theme, limit: number): Measurement[] {
  const measured = samples.filter(
    (sample): sample is Measurement => sample.kind === "measured" && sample.theme === theme,
  );
  return measured.sort((one, other) => one.ratio - other.ratio).slice(0, limit);
}

/** The per-tab sweep sizes and the worst ratio in each theme. */
export function formatSummary(samples: readonly Sample[]): string {
  const lines: string[] = [];
  const counts = countsByPlacement(samples);
  for (const [key, count] of [...counts].sort()) {
    lines.push(`  ${key.padEnd(24)} ${count} text runs`);
  }
  for (const theme of ["light", "dark"] as const) {
    const worst = worstRatio(samples, theme);
    lines.push(`  worst ${theme.padEnd(18)} ${worst === null ? "no samples" : round(worst)}`);
    for (const sample of tightest(samples, theme, 3)) {
      lines.push(`    ${round(sample.ratio)}  ${sample.tab}  ${sample.selector}  "${sample.text}"`);
    }
  }
  return lines.join("\n");
}
