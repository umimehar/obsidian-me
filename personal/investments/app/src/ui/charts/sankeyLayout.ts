import type { Column, FlowGraph, FlowLink, FlowNode } from "../../analytics/flows/graph";
import { formatCurrency, formatShare } from "../format";

/** The box the layout is placed into, plus the two rendering constants columns share. */
export interface SankeyBox {
  width: number;
  height: number;
  nodeWidth: number;
  nodeGap: number;
  labelLeft: number;
  labelRight: number;
}

export interface PlacedNode extends FlowNode {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  labelY: number;
  /** The wrapped name (one or two lines) followed by the `amount · share` line -- the exact lines `Sankey.tsx` renders as `<tspan>`s. */
  labelLines: readonly string[];
  /** The widest of `labelLines`, estimated -- what `minChartWidth`/`labelOverlaps` size a margin or a box from. */
  labelWidth: number;
  /** `labelLines.length * LABEL_LINE_HEIGHT` -- two lines for an unwrapped name, three for a wrapped one. */
  labelHeight: number;
}

export interface PlacedLink extends FlowLink {
  key: string;
  path: string;
  width: number;
  /** The band's own midpoint -- the same point `path`'s bezier control points straddle -- the anchor the readout card is placed from. */
  midX: number;
  midY: number;
}

export interface SankeyLayout {
  nodes: PlacedNode[];
  links: PlacedLink[];
  height: number;
}

const COLUMNS: readonly Column[] = [0, 1, 2, 3];
const MIN_NODE_HEIGHT = 2;

/** A node label is two or three lines -- the (possibly wrapped) name, then `amount · share` -- at 12px. */
export const LABEL_LINE_HEIGHT = 13;
const LABEL_BLOCK_GAP = 6;

export const linkKey = (l: { source: string; target: string }): string =>
  `${l.source}->${l.target}`;

/** The gap between a node's edge and its label, shared by the layout-width floor and by `Sankey.tsx`'s own rendering. */
export const LABEL_GAP = 6;
const LABEL_FONT_SIZE = 12;
/**
 * A name longer than this wraps onto a second line at a word boundary
 * (`wrapName`). Short enough that "Spousal RRSP (spouse's asset)" (30
 * characters) and "Fees and withholding" (21) both wrap, long enough that
 * "Left Wealthsimple" (17) does not need to.
 */
const WRAP_THRESHOLD = 18;
/**
 * The average character width for the app's system sans-serif at
 * `LABEL_FONT_SIZE`, calibrated against the real running chart rather than
 * guessed: `tspan.getComputedTextLength()` on 19 distinct real node names
 * and 30 distinct `amount · share` lines from the 2026 corpus in Chromium
 * averaged 6.10px/char (name lines) and 6.05px/char (figure lines), with
 * "Chequing" the single highest outlier at 6.76 (a short word, so fixed
 * per-glyph kerning is not amortised over many characters). 6.3/12 = 0.525
 * keeps a small margin above that average without reintroducing the
 * ~200px of dead margin the old 0.62 (7.44px/char) produced on every
 * period, driven by one long name. Re-measure this the same way if the
 * font ever changes.
 */
const CHAR_WIDTH_FACTOR = 0.525;

function estimateTextWidth(text: string): number {
  return text.length * LABEL_FONT_SIZE * CHAR_WIDTH_FACTOR;
}

/**
 * A node's own name and its `amount · share` line -- one `formatCurrency`
 * call and one `formatShare` call for the whole node, never one per line.
 * The single string this returns for the name is what the accessible name
 * (aria-label, hover readout) is built from; it is never wrapped, so those
 * never change when `labelBlockOf` below wraps the DISPLAYED name for
 * layout purposes only.
 */
export function nodeLines(node: FlowNode, totalIn: number): readonly [string, string] {
  const share = totalIn > 0 ? node.value / totalIn : 0;
  return [node.label, `${formatCurrency(node.value)} · ${formatShare(share)}`];
}

/**
 * Splits a name onto two lines at whichever word boundary minimizes the
 * wider of the two resulting lines, when the name alone would otherwise
 * exceed `WRAP_THRESHOLD`. A single-word name cannot be split and is left
 * alone.
 */
function wrapName(name: string): string[] {
  if (name.length <= WRAP_THRESHOLD) return [name];
  const words = name.split(" ");
  if (words.length < 2) return [name];
  let best: [string, string] = [name, ""];
  let bestMax = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const widest = Math.max(estimateTextWidth(line1), estimateTextWidth(line2));
    if (widest < bestMax) {
      bestMax = widest;
      best = [line1, line2];
    }
  }
  return best;
}

interface LabelBlock {
  lines: readonly string[];
  width: number;
  height: number;
}

/** A node's display lines -- its (possibly wrapped) name, then its figure line -- and the box they occupy. */
function labelBlockOf(node: FlowNode, totalIn: number): LabelBlock {
  const [name, figure] = nodeLines(node, totalIn);
  const lines = [...wrapName(name), figure];
  const width = Math.max(...lines.map(estimateTextWidth));
  return { lines, width, height: lines.length * LABEL_LINE_HEIGHT };
}

function widestLabelByColumn(graph: FlowGraph): Map<Column, number> {
  const widest = new Map<Column, number>();
  for (const n of graph.nodes) {
    const w = labelBlockOf(n, graph.totalIn).width;
    widest.set(n.column, Math.max(widest.get(n.column) ?? 0, w));
  }
  return widest;
}

/**
 * A small fixed cushion beyond the widest measured label, absorbing the
 * gap between the estimate and a handful of real outlier glyphs rather
 * than inflating `CHAR_WIDTH_FACTOR` itself for the whole corpus.
 */
const MARGIN_SLACK = 15;

/**
 * The outer margins sized from THIS graph's own widest wrapped labels in
 * columns 0 and 3, not a shared worst-case constant -- so a period whose
 * longest name is short does not carry the same ~290px margin a period
 * with "Spousal RRSP (spouse's asset)" needs.
 */
export function outerMargins(graph: FlowGraph): Pick<SankeyBox, "labelLeft" | "labelRight"> {
  const widest = widestLabelByColumn(graph);
  return {
    labelLeft: (widest.get(0) ?? 0) + LABEL_GAP + MARGIN_SLACK,
    labelRight: (widest.get(3) ?? 0) + LABEL_GAP + MARGIN_SLACK,
  };
}

/**
 * The narrowest total chart width at which no column's label block can
 * reach into the next column's own node -- the geometric floor
 * `labelOverlaps` exists to prove holds. Computed from the graph's OWN
 * wrapped labels, not a worst-case constant, so a period whose longest name
 * is short lays out no wider than it needs to.
 */
export function minChartWidth(
  graph: FlowGraph,
  box: Pick<SankeyBox, "nodeWidth" | "labelLeft" | "labelRight">,
): number {
  const widestByColumn = widestLabelByColumn(graph);
  // Columns 0-2 each hand a label off toward the next column's node; the
  // three inner gaps are laid out evenly (`columnX0`), so the tightest one
  // sets the shared span.
  const perGap = Math.max(
    ...([0, 1, 2] as const).map(
      (c) => box.nodeWidth + LABEL_GAP * 2 + (widestByColumn.get(c) ?? 0),
    ),
  );
  const span = perGap * 3;
  return box.labelLeft + span + box.nodeWidth + box.labelRight;
}

export interface LabelBox {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A node's ESTIMATED rendered label box, in the same units as `PlacedNode`'s own coordinates -- what `labelOverlaps` checks pairs of against each other, and what the band readout card's own placement (`readoutPlacement.ts`) checks itself against so it never covers the label it names. */
export function labelBoxOf(n: PlacedNode): LabelBox {
  const rightAnchored = n.column !== 0;
  const edge = rightAnchored ? n.x1 + LABEL_GAP : n.x0 - LABEL_GAP;
  return {
    id: n.id,
    x0: rightAnchored ? edge : edge - n.labelWidth,
    x1: rightAnchored ? edge + n.labelWidth : edge,
    y0: n.labelY - n.labelHeight / 2,
    y1: n.labelY + n.labelHeight / 2,
  };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Every pair of node labels whose ESTIMATED rendered boxes overlap, for a
 * caller to assert against at a given width. `minChartWidth` is the
 * geometric floor this is meant to always come back empty above; run
 * directly on a layout built at a narrower width, it is exactly how the
 * collision this whole module exists to prevent gets caught before it
 * ships rather than after a reviewer's screenshot finds it.
 */
export function labelOverlaps(layout: SankeyLayout): [string, string][] {
  const boxes = layout.nodes.map((n) => labelBoxOf(n));
  const pairs: [string, string][] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a !== undefined && b !== undefined && boxesOverlap(a, b)) pairs.push([a.id, b.id]);
    }
  }
  return pairs;
}

/**
 * `max(640, 44 × largest column's node count)`, the box height a caller
 * passes back in. 640 (TCK-0016) is the floor for the default view -- the
 * owner's own call over 800 or a node-count formula, made because the
 * shorter 420px floor this replaced read as a cramped chart next to the
 * rest of the tab. A dense group by still grows past it exactly as before.
 */
export function sankeyHeight(graph: FlowGraph): number {
  const counts = new Map<Column, number>();
  for (const n of graph.nodes) counts.set(n.column, (counts.get(n.column) ?? 0) + 1);
  const largest = Math.max(0, ...counts.values());
  return Math.max(640, 44 * largest);
}

/** A column's left edge, evenly spaced between `labelLeft` and `width − labelRight − nodeWidth`. */
function columnX0(box: SankeyBox, column: Column): number {
  const span = box.width - box.labelRight - box.nodeWidth - box.labelLeft;
  return box.labelLeft + (column / (COLUMNS.length - 1)) * span;
}

function byColumn(nodes: readonly FlowNode[]): Map<Column, FlowNode[]> {
  const map = new Map<Column, FlowNode[]>();
  for (const n of nodes) {
    const list = map.get(n.column) ?? [];
    list.push(n);
    map.set(n.column, list);
  }
  return map;
}

/**
 * One column's own bound on `k`, with every node that would be floored to
 * `MIN_NODE_HEIGHT` removed from the pool first: its fixed height is
 * subtracted from the available space and its value from the total, so the
 * `k` returned is the largest that still fits every node -- floored ones
 * included -- inside `height`. Computing `available / total` in one shot,
 * the way the shared scale used to, ignored the floor entirely: a column
 * with one huge node and many tiny ones would floor the tiny ones to 2px
 * each, and those floors alone could push the column past `height` even
 * though the arithmetic "proved" it fit.
 */
function columnK(nodes: readonly FlowNode[], height: number, nodeGap: number): number {
  let space = height - nodeGap * (nodes.length - 1);
  let pool = nodes;
  for (let pass = 0; pass <= nodes.length; pass++) {
    const total = pool.reduce((s, n) => s + n.value, 0);
    if (total <= 0) return space > 0 ? Number.POSITIVE_INFINITY : 0;
    const k = space / total;
    const floored = pool.filter((n) => n.value * k < MIN_NODE_HEIGHT);
    if (floored.length === 0) return k;
    space -= floored.length * MIN_NODE_HEIGHT;
    pool = pool.filter((n) => n.value * k >= MIN_NODE_HEIGHT);
    if (pool.length === 0) return 0;
  }
  return 0;
}

/** The one vertical scale every column shares: the tightest column's own bound. */
function verticalScale(columns: Map<Column, FlowNode[]>, box: SankeyBox): number {
  let k = Number.POSITIVE_INFINITY;
  for (const nodes of columns.values()) {
    if (nodes.length === 0) continue;
    const colK = columnK(nodes, box.height, box.nodeGap);
    if (colK > 0 && Number.isFinite(colK)) k = Math.min(k, colK);
  }
  return Number.isFinite(k) ? k : 0;
}

/** One column's nodes, stacked top down in the graph's own order. Label starts at the node's centre. */
function stackColumn(
  nodes: readonly FlowNode[],
  x0: number,
  nodeWidth: number,
  k: number,
  nodeGap: number,
  totalIn: number,
): PlacedNode[] {
  let y = 0;
  const placed: PlacedNode[] = [];
  for (const n of nodes) {
    const height = Math.max(MIN_NODE_HEIGHT, n.value * k);
    const y0 = y;
    const y1 = y0 + height;
    const block = labelBlockOf(n, totalIn);
    placed.push({
      ...n,
      x0,
      x1: x0 + nodeWidth,
      y0,
      y1,
      labelY: (y0 + y1) / 2,
      labelLines: block.lines,
      labelWidth: block.width,
      labelHeight: block.height,
    });
    y = y1 + nodeGap;
  }
  return placed;
}

/** The minimum vertical gap between two labels' centres, from their own (possibly different) block heights. */
function requiredLabelGap(a: PlacedNode, b: PlacedNode): number {
  return (a.labelHeight + b.labelHeight) / 2 + LABEL_BLOCK_GAP;
}

/**
 * Downward pass then upward pass, the classic two-pass label declutter: push
 * each label at least far enough below the previous one to clear both their
 * blocks, then pull the column back inside `height` from the bottom up so no
 * label sits below the box and the minimum gap still holds.
 *
 * The clamp is on the whole text BLOCK, not the label's own y: a label
 * anchored at `height` still draws its last line below the box, clipped.
 * Bounding the last label to `height − its own half-height` keeps its block
 * inside, and the upward pass starts from that already-clamped position
 * rather than from the unclamped overflow, so every label above it ends up
 * inside the box too.
 */
function resolveLabels(nodes: PlacedNode[], height: number): void {
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const cur = nodes[i];
    if (prev === undefined || cur === undefined) continue;
    const gap = requiredLabelGap(prev, cur);
    if (cur.labelY - prev.labelY < gap) cur.labelY = prev.labelY + gap;
  }
  const last = nodes[nodes.length - 1];
  if (last !== undefined) {
    const bottomBound = height - last.labelHeight / 2;
    if (last.labelY > bottomBound) last.labelY = bottomBound;
  }
  for (let i = nodes.length - 2; i >= 0; i--) {
    const next = nodes[i + 1];
    const cur = nodes[i];
    if (next === undefined || cur === undefined) continue;
    const gap = requiredLabelGap(cur, next);
    if (next.labelY - cur.labelY < gap) cur.labelY = next.labelY - gap;
  }
}

function pushTo(map: Map<string, FlowLink[]>, key: string, link: FlowLink): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [link]);
  else list.push(link);
}

/** Links on one node edge, sorted by the caller and stacked top down, each `value × k` tall. */
function bandOffsets(links: readonly FlowLink[], k: number): Map<FlowLink, number> {
  let y = 0;
  const offsets = new Map<FlowLink, number>();
  for (const l of links) {
    offsets.set(l, y + (l.value * k) / 2);
    y += l.value * k;
  }
  return offsets;
}

/** Every link's band centre on its source's right edge (`sy`) and target's left edge (`ty`). */
function bandCentres(
  nodesById: Map<string, PlacedNode>,
  links: readonly FlowLink[],
  k: number,
): { sy: Map<FlowLink, number>; ty: Map<FlowLink, number> } {
  const outgoing = new Map<string, FlowLink[]>();
  const incoming = new Map<string, FlowLink[]>();
  for (const l of links) {
    pushTo(outgoing, l.source, l);
    pushTo(incoming, l.target, l);
  }
  const sy = new Map<FlowLink, number>();
  const ty = new Map<FlowLink, number>();
  for (const [source, list] of outgoing) {
    const node = nodesById.get(source);
    if (node === undefined) continue;
    list.sort((a, b) => (nodesById.get(a.target)?.y0 ?? 0) - (nodesById.get(b.target)?.y0 ?? 0));
    for (const [l, offset] of bandOffsets(list, k)) sy.set(l, node.y0 + offset);
  }
  for (const [target, list] of incoming) {
    const node = nodesById.get(target);
    if (node === undefined) continue;
    list.sort((a, b) => (nodesById.get(a.source)?.y0 ?? 0) - (nodesById.get(b.source)?.y0 ?? 0));
    for (const [l, offset] of bandOffsets(list, k)) ty.set(l, node.y0 + offset);
  }
  return { sy, ty };
}

function buildPlacedLink(
  l: FlowLink,
  nodesById: Map<string, PlacedNode>,
  sy: number,
  ty: number,
  k: number,
): PlacedLink {
  const x1 = nodesById.get(l.source)?.x1 ?? 0;
  const x0 = nodesById.get(l.target)?.x0 ?? 0;
  const mx = (x1 + x0) / 2;
  return {
    ...l,
    key: linkKey(l),
    width: l.value * k,
    path: `M ${x1},${sy} C ${mx},${sy} ${mx},${ty} ${x0},${ty}`,
    midX: mx,
    midY: (sy + ty) / 2,
  };
}

/**
 * Reading order for keyboard tab stops: by the source's column first (so
 * Tab moves left to right through the chart), then the source's own
 * vertical position, then the target's -- the same order a sighted reader's
 * eye would scan the bands in. Without this, DOM order is whatever
 * `aggregate`'s `Map` happened to iterate the links in, which can start a
 * keyboard user anywhere in the chart.
 */
function tabOrder(nodesById: Map<string, PlacedNode>, a: FlowLink, b: FlowLink): number {
  const as = nodesById.get(a.source);
  const bs = nodesById.get(b.source);
  const at = nodesById.get(a.target);
  const bt = nodesById.get(b.target);
  return (
    (as?.column ?? 0) - (bs?.column ?? 0) ||
    (as?.y0 ?? 0) - (bs?.y0 ?? 0) ||
    (at?.y0 ?? 0) - (bt?.y0 ?? 0)
  );
}

function placeLinks(
  nodesById: Map<string, PlacedNode>,
  links: readonly FlowLink[],
  k: number,
): PlacedLink[] {
  const { sy, ty } = bandCentres(nodesById, links, k);
  return links
    .map((l) => buildPlacedLink(l, nodesById, sy.get(l) ?? 0, ty.get(l) ?? 0, k))
    .sort((a, b) => tabOrder(nodesById, a, b));
}

/**
 * A pure projection of a `FlowGraph` onto rectangles and paths: one vertical
 * scale for every column (the tightest column's own bound), nodes stacked
 * top down in the graph's own order, and links drawn as a bezier stroke from
 * their source's right edge to their target's left edge, spanning columns
 * directly when the graph's link does. No dependency: d3-sankey was
 * rejected as unneeded machinery for a fixed four-column graph.
 */
export function layoutSankey(graph: FlowGraph, box: SankeyBox): SankeyLayout {
  const columns = byColumn(graph.nodes);
  const k = verticalScale(columns, box);
  const nodesById = new Map<string, PlacedNode>();
  const nodes: PlacedNode[] = [];
  for (const column of COLUMNS) {
    const placed = stackColumn(
      columns.get(column) ?? [],
      columnX0(box, column),
      box.nodeWidth,
      k,
      box.nodeGap,
      graph.totalIn,
    );
    resolveLabels(placed, box.height);
    for (const n of placed) nodesById.set(n.id, n);
    nodes.push(...placed);
  }
  return { nodes, links: placeLinks(nodesById, graph.links, k), height: box.height };
}
