import type { Column, FlowGraph, FlowLink, FlowNode } from "../../analytics/flows/graph";

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
}

export interface PlacedLink extends FlowLink {
  key: string;
  path: string;
  width: number;
}

export interface SankeyLayout {
  nodes: PlacedNode[];
  links: PlacedLink[];
  height: number;
}

const COLUMNS: readonly Column[] = [0, 1, 2, 3];
const MIN_LABEL_GAP = 28;
const MIN_NODE_HEIGHT = 2;

export const linkKey = (l: { source: string; target: string }): string =>
  `${l.source}->${l.target}`;

/** `max(420, 44 × largest column's node count)`, the box height a caller passes back in. */
export function sankeyHeight(graph: FlowGraph): number {
  const counts = new Map<Column, number>();
  for (const n of graph.nodes) counts.set(n.column, (counts.get(n.column) ?? 0) + 1);
  const largest = Math.max(0, ...counts.values());
  return Math.max(420, 44 * largest);
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

/** The one vertical scale every column shares: the tightest column's own bound. */
function verticalScale(columns: Map<Column, FlowNode[]>, box: SankeyBox): number {
  let k = Number.POSITIVE_INFINITY;
  for (const nodes of columns.values()) {
    if (nodes.length === 0) continue;
    const total = nodes.reduce((s, n) => s + n.value, 0);
    if (total <= 0) continue;
    const available = box.height - box.nodeGap * (nodes.length - 1);
    k = Math.min(k, available / total);
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
): PlacedNode[] {
  let y = 0;
  const placed: PlacedNode[] = [];
  for (const n of nodes) {
    const height = Math.max(MIN_NODE_HEIGHT, n.value * k);
    const y0 = y;
    const y1 = y0 + height;
    placed.push({ ...n, x0, x1: x0 + nodeWidth, y0, y1, labelY: (y0 + y1) / 2 });
    y = y1 + nodeGap;
  }
  return placed;
}

/**
 * Downward pass then upward pass, the classic two-pass label declutter: push
 * each label at least `MIN_LABEL_GAP` below the previous one, then pull the
 * column back inside `height` from the bottom up so no label sits below the
 * box and the minimum gap still holds.
 */
function resolveLabels(nodes: PlacedNode[], height: number): void {
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const cur = nodes[i];
    if (prev === undefined || cur === undefined) continue;
    if (cur.labelY - prev.labelY < MIN_LABEL_GAP) cur.labelY = prev.labelY + MIN_LABEL_GAP;
  }
  const last = nodes[nodes.length - 1];
  if (last !== undefined && last.labelY > height) last.labelY = height;
  for (let i = nodes.length - 2; i >= 0; i--) {
    const next = nodes[i + 1];
    const cur = nodes[i];
    if (next === undefined || cur === undefined) continue;
    if (next.labelY - cur.labelY < MIN_LABEL_GAP) cur.labelY = next.labelY - MIN_LABEL_GAP;
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
  };
}

function placeLinks(
  nodesById: Map<string, PlacedNode>,
  links: readonly FlowLink[],
  k: number,
): PlacedLink[] {
  const { sy, ty } = bandCentres(nodesById, links, k);
  return links.map((l) => buildPlacedLink(l, nodesById, sy.get(l) ?? 0, ty.get(l) ?? 0, k));
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
    );
    resolveLabels(placed, box.height);
    for (const n of placed) nodesById.set(n.id, n);
    nodes.push(...placed);
  }
  return { nodes, links: placeLinks(nodesById, graph.links, k), height: box.height };
}
