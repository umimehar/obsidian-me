import { useReducedMotion } from "motion/react";

export interface Reveal {
  /** The clip rect's starting width. Equal to the full width when there is to be no reveal at all. */
  initialWidth: number;
  /** Seconds. Zero, never a smaller non-zero: a fast wipe is still a wipe. */
  duration: number;
}

/**
 * The reveal's timing, as a value rather than as two ternaries inline in the
 * JSX. Reduced motion *skips* the animation: the clip starts at full width
 * and takes no time, so the chart is simply drawn. Shortening the duration
 * instead would still move, which is the thing the preference asks not to
 * happen. Kept exported and pure because motion applies its final value
 * immediately under happy-dom, so this rule is not observable from the
 * rendered DOM and would otherwise be untestable.
 *
 * Shared by every chart that wipes itself in, so the portfolio chart and the
 * per-group sparklines cannot end up with two different reduced-motion rules.
 */
export function revealMotion(prefersReducedMotion: boolean, innerWidth: number): Reveal {
  if (prefersReducedMotion) return { initialWidth: innerWidth, duration: 0 };
  return { initialWidth: 0, duration: 1.1 };
}

/**
 * `revealMotion` wired to the OS preference. Exported for the same reason as
 * `useCardMotion`: `useReducedMotion` reads `matchMedia`, which a test can
 * stub, so the wiring is pinned and not only the rule behind it.
 */
export function useRevealMotion(innerWidth: number): Reveal {
  return revealMotion(useReducedMotion() === true, innerWidth);
}
