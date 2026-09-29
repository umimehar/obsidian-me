import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

export interface MeasuredWidth<T extends HTMLElement> {
  ref: RefObject<T | null>;
  width: number;
}

/**
 * A container's own content width in CSS pixels, read live off a
 * `ResizeObserver`.
 *
 * A chart laid out at a fixed viewBox width wider than its rendered CSS
 * width scales every unit down, including its font sizes: the Sankey's own
 * `1152` viewBox rendering into a ~1040px wide card painted its 11px labels
 * at 9.93px, a WCAG failure no `bun run contrast` sweep can see because the
 * *computed* font size it reads is still 11. Measuring the real width and
 * laying out at exactly that width, so one viewBox unit is one CSS pixel,
 * is the only fix that holds at every container width rather than one
 * guessed constant.
 *
 * Returns `fallback` before the first measurement lands -- server side, in
 * a test with no `ResizeObserver`, or the very first paint -- and whenever
 * the observed width would otherwise be zero (a `display: none` ancestor,
 * for instance), so a caller's layout math never divides by zero.
 */
export function useMeasuredWidth<T extends HTMLElement>(fallback: number): MeasuredWidth<T> {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const measured = entry.contentRect.width;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
