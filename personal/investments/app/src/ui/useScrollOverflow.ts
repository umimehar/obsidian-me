import { useEffect, useState } from "react";

/**
 * True once the element `scrollEl` points at has more content than it can
 * show without scrolling -- `scrollHeight > clientHeight`, read directly off
 * the real DOM. `FlowTable`'s own row count once sized its windowed region
 * from an assumed row height (`ROW_HEIGHT_PX = 33`); the real rendered row
 * is 36px, and the drift silently hid a period's last row with no "Scroll
 * for more" hint to say so. Measuring rather than estimating cannot drift.
 *
 * `contentEl`, when different from `scrollEl`, is the element whose OWN box
 * actually grows or shrinks as rows are added or removed -- a `<table>`
 * inside a height-capped `ScrollArea` viewport, say. The capped `scrollEl`
 * itself never changes size once at its cap, so a `ResizeObserver` watching
 * only it would never re-fire when a shorter period's table has fewer rows;
 * watching the content element instead catches exactly that.
 */
export function useScrollOverflow(
  scrollEl: HTMLElement | null,
  contentEl: HTMLElement | null = scrollEl,
): boolean {
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    if (scrollEl === null || contentEl === null || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflowing(scrollEl.scrollHeight > scrollEl.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(contentEl);
    if (contentEl !== scrollEl) observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl, contentEl]);

  return overflowing;
}
