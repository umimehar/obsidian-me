import { hasReducedMotionListener, prefersReducedMotion } from "motion/react";

/**
 * A `window.matchMedia` that answers the reduced-motion query with `reduce`.
 *
 * happy-dom's own `matchMedia` always reports `matches: false`, so
 * `useReducedMotion` can only ever see "no preference" without this.
 *
 * It also resets motion's own two module-level refs. `initPrefersReducedMotion`
 * reads `matchMedia` exactly once per process and caches the answer, so
 * without the reset only the first value any test asks for is ever observable
 * and the second direction silently reads the first one's answer. Both refs
 * are part of `motion/react`'s public exports.
 *
 * Kept in `src/` rather than in a test file because `Overview.test.tsx` and
 * `ValueOverTime.test.tsx` both need it, and two copies of a stub drift.
 *
 * Returns the original `matchMedia`, so a caller can restore it in `afterEach`.
 */
export function stubReducedMotion(reduce: boolean): typeof window.matchMedia {
  const original = window.matchMedia;
  hasReducedMotionListener.current = false;
  prefersReducedMotion.current = null;
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return original;
}

/**
 * Undoes `stubReducedMotion`. Resetting motion's refs matters as much as
 * restoring `matchMedia`: leaving them latched would carry this file's
 * answer into whichever test file renders next in the same process.
 */
export function restoreReducedMotion(original: typeof window.matchMedia): void {
  window.matchMedia = original;
  hasReducedMotionListener.current = false;
  prefersReducedMotion.current = null;
}
