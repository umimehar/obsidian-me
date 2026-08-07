/**
 * Test-only helpers shared by more than one chart's tests.
 *
 * Kept out of the charts' own source so a mistake here can never ship, but
 * out of any single chart's test file too, so a second chart does not carry
 * its own drifting copy.
 */

/**
 * The y a gridline's own scale places a labelled tick at, read off the DOM
 * rather than recomputed. A chart's marks and its `Gridlines` are drawn from
 * the same `scales` object, but by separate code paths, so anchoring a
 * mark's position or height to a tick's position -- rather than only to
 * another mark on the same chart -- is what catches a mutation that scales
 * every mark by one constant factor: that leaves every mark-to-mark ratio
 * unchanged, but leaves a mark disagreeing with the axis it is drawn against.
 */
export function tickY(label: string): number {
  const text = [...document.querySelectorAll("svg text")].find(
    (node) => node.textContent === label,
  );
  if (text === undefined) throw new Error(`expected a ${label} tick`);
  const transform = text.parentElement?.getAttribute("transform") ?? "";
  const y = Number(/translate\(0,([\d.]+)\)/.exec(transform)?.[1]);
  if (Number.isNaN(y)) throw new Error(`could not read the ${label} tick's position`);
  return y;
}
