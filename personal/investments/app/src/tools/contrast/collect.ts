/**
 * The one function that runs inside the page.
 *
 * It measures nothing. It reports strings -- the computed paint of every
 * rendered run of text, and the background and opacity of every ancestor above
 * it -- and `audit.ts` does the arithmetic in Bun where it can be tested.
 *
 * It has to be self-contained: Playwright serialises it with `toString` and
 * evaluates it in the page, so anything it references from module scope would
 * be undefined at run time. That is why the helpers are nested rather than
 * exported siblings.
 */

/** One ancestor's contribution to what sits behind a run of text. */
export interface RawLayer {
  /** The computed `background-color`, as the browser serialised it. */
  background: string;
  /** The computed `opacity` of this element, 0..1. It scales everything at and below it. */
  opacity: number;
}

/** One run of text, with everything needed to resolve its contrast off-page. */
export interface RawSample {
  /** A short ancestor path, enough to find the element in devtools. */
  selector: string;
  /** The text itself, truncated. The fastest way for a reader to recognise what failed. */
  text: string;
  fontSizePx: number;
  fontWeight: number;
  /** The computed `color`, or `fill` for SVG text. */
  paint: string;
  paintProperty: "color" | "fill";
  /** Index 0 is the element itself; the last entry is `<html>`. */
  layers: RawLayer[];
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Every rendered run of text on the page right now, one entry per element that
 * owns the text directly.
 *
 * "Owns directly" is what stops a figure being counted once for its `<span>`
 * and again for each of the six wrappers above it, all with the same colour.
 *
 * `rootSelector` narrows the sweep to one subtree and its own text. It exists
 * for the hover states: a tooltip is the only thing that changed, so sweeping
 * the whole page again for each of thirty-odd charts would re-measure the same
 * static text thirty times and say nothing new. The ancestor walk still runs
 * to `<html>` from inside the subtree, so a scoped sample resolves its
 * backdrop exactly as an unscoped one does. A selector that matches nothing
 * returns no samples, which the caller must treat as a hole in the sweep
 * rather than as a clean result.
 */
export function collectSamples(rootSelector?: string): RawSample[] {
  function ownText(element: Element): string {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === 3) text += node.textContent ?? "";
    }
    return text.trim().replace(/\s+/g, " ");
  }

  /**
   * SVG paints text with `fill`, not `color`, and its `<title>` and `<desc>`
   * carry text that is never drawn. Only `<text>` and `<tspan>` are drawn.
   */
  function isDrawnText(element: Element): boolean {
    if (element.namespaceURI !== SVG_NAMESPACE) return true;
    return element.tagName === "text" || element.tagName === "tspan";
  }

  /**
   * Rendered and big enough to read. The 2px floor drops the 1px clipped boxes
   * that screen-reader-only text is parked in, whose contrast is meaningless
   * because nothing paints them.
   */
  function isRendered(element: Element, style: CSSStyleDeclaration): boolean {
    if (style.display === "none" || style.visibility !== "visible") return false;
    if (Number.parseFloat(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2;
  }

  function shortSelector(element: Element): string {
    const tag = element.tagName.toLowerCase();
    const id = element.id === "" ? "" : "#" + element.id;
    const classes = Array.from(element.classList)
      .slice(0, 2)
      .map((name) => "." + name)
      .join("");
    const data = element.getAttributeNames().find((name) => name.startsWith("data-"));
    return tag + id + classes + (data === undefined ? "" : "[" + data + "]");
  }

  function describe(element: Element): string {
    const parts: string[] = [];
    let node: Element | null = element;
    for (let depth = 0; node !== null && depth < 4; depth += 1) {
      parts.unshift(shortSelector(node));
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function layersFor(element: Element): RawLayer[] {
    const layers: RawLayer[] = [];
    let node: Element | null = element;
    while (node !== null) {
      const style = getComputedStyle(node);
      layers.push({
        background: style.backgroundColor,
        opacity: Number.parseFloat(style.opacity),
      });
      node = node.parentElement;
    }
    return layers;
  }

  const samples: RawSample[] = [];
  const roots =
    rootSelector === undefined
      ? [document.documentElement]
      : Array.from(document.querySelectorAll(rootSelector));
  const scope: Element[] = [];
  for (const root of roots) {
    // The root itself can own text, so it is swept alongside its descendants.
    scope.push(root, ...Array.from(root.querySelectorAll("*")));
  }
  for (const element of scope) {
    if (!isDrawnText(element)) continue;
    const text = ownText(element);
    if (text === "") continue;
    const style = getComputedStyle(element);
    if (!isRendered(element, style)) continue;
    const svg = element.namespaceURI === SVG_NAMESPACE;
    samples.push({
      selector: describe(element),
      text: text.slice(0, 60),
      fontSizePx: Number.parseFloat(style.fontSize),
      fontWeight: Number.parseInt(style.fontWeight, 10),
      paint: svg ? style.fill : style.color,
      paintProperty: svg ? "fill" : "color",
      layers: layersFor(element),
    });
  }
  return samples;
}
