import { Text } from "@radix-ui/themes";
import type { CSSProperties, KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import type { FlowGraph, FlowLink, FlowNode } from "../../analytics/flows/graph";
import { formatCurrency, formatShare } from "../format";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle } from "./Tooltip";
import {
  LABEL_GAP,
  LABEL_LINE_HEIGHT,
  type PlacedLink,
  type PlacedNode,
  type SankeyBox,
  layoutSankey,
  minChartWidth,
  outerMargins,
  sankeyHeight,
} from "./sankeyLayout";
import { useSvgId } from "./svgId";
import { useMeasuredWidth } from "./useMeasuredWidth";

export interface SankeyProps {
  graph: FlowGraph;
  selected: string | null;
  onSelect: (key: string | null) => void;
}

/**
 * The width used before the container has been measured, and the floor a
 * measurement never falls below -- the narrow layout takes over below
 * 40rem (640px at the root font size), so the Sankey itself never has to
 * lay out any narrower than that in practice.
 */
const FALLBACK_WIDTH = 640;
const NODE_SHAPE = { nodeWidth: 16, nodeGap: 6 };
const TOP_FLOWS = 5;
/** A label whose block sits more than this many units from its node's own centre gets a leader line. */
const LEADER_THRESHOLD = 4;
const HALO_WIDTH = 3;

/** A band into any of these three is a cost or a loss to the outside, not a place money grows. */
const RED_TARGETS = new Set(["now:costs", "now:left", "now:unreconciled"]);

type Family = "jade" | "red" | "gray";

function linkFamily(link: FlowLink): Family {
  if (link.recycled) return "gray";
  if (RED_TARGETS.has(link.target)) return "red";
  return "jade";
}

/** Base step for a link's own tone, or the `a9` step once it is hovered, focused or pinned. */
function linkColor(link: FlowLink, active: boolean): string {
  const family = linkFamily(link);
  const step = active ? 9 : family === "gray" ? 5 : 6;
  return `var(--${family}-a${step})`;
}

/** A link's name, shared verbatim by its `aria-label` and its hover readout. */
function linkText(link: FlowLink, labels: Map<string, string>, totalIn: number): string {
  const source = labels.get(link.source) ?? link.source;
  const target = labels.get(link.target) ?? link.target;
  const share = totalIn > 0 ? link.value / totalIn : 0;
  return `${source} to ${target}, ${formatCurrency(link.value)}, ${formatShare(share)} of money in`;
}

/** The five largest flows, largest first, so a screen reader gets the chart's shape before any band. */
function summaryText(
  links: readonly FlowLink[],
  labels: Map<string, string>,
  totalIn: number,
): string {
  const top = [...links].sort((a, b) => b.value - a.value).slice(0, TOP_FLOWS);
  return top.map((l) => linkText(l, labels, totalIn)).join("; ");
}

function labelsOf(nodes: readonly FlowNode[]): Map<string, string> {
  return new Map(nodes.map((n) => [n.id, n.label]));
}

function handleKeyDown(
  event: KeyboardEvent<SVGPathElement>,
  key: string,
  onSelect: (k: string | null) => void,
): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(key);
  } else if (event.key === "Escape") {
    onSelect(null);
  }
}

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

interface NodeRectsProps {
  nodes: readonly PlacedNode[];
  highlighted: ReadonlySet<string>;
}

/** Every node's rectangle, brightened when it is one of the active band's two endpoints. */
function NodeRects({ nodes, highlighted }: NodeRectsProps) {
  return (
    <>
      {nodes.map((n) => (
        <rect
          key={n.id}
          data-flow-node={n.id}
          x={n.x0}
          y={n.y0}
          width={n.x1 - n.x0}
          height={n.y1 - n.y0}
          fill={highlighted.has(n.id) ? "var(--gray-a10)" : "var(--gray-a8)"}
        />
      ))}
    </>
  );
}

/** Where a node's label sits: column 0 in the left margin, columns 1-3 to the node's own right. */
function labelPosition(n: PlacedNode): { x: number; anchor: "start" | "end" } {
  if (n.column === 0) return { x: n.x0 - LABEL_GAP, anchor: "end" };
  return { x: n.x1 + LABEL_GAP, anchor: "start" };
}

interface NodeLabelsProps {
  nodes: readonly PlacedNode[];
}

/**
 * Every node's label -- its (possibly word-wrapped) name, then the
 * `amount · share` line, two or three `<tspan>`s from `n.labelLines`,
 * centred on `n.labelY` and spaced `LABEL_LINE_HEIGHT` apart -- painted
 * after the bands so it reads over them, with a background-coloured halo
 * (`paint-order: stroke`) for legibility against whatever band tone
 * happens to sit underneath. A label `resolveLabels` pushed more than
 * `LEADER_THRESHOLD` units from its node's own centre gets a leader line
 * back to the node's edge, so a reader does not lose track of which
 * rectangle a displaced label belongs to.
 */
function NodeLabels({ nodes }: NodeLabelsProps) {
  return (
    <>
      {nodes.map((n) => {
        const { x, anchor } = labelPosition(n);
        const centreY = (n.y0 + n.y1) / 2;
        const edgeX = n.column === 3 ? n.x0 : n.x1;
        const displaced = Math.abs(n.labelY - centreY) > LEADER_THRESHOLD;
        const lineCount = n.labelLines.length;
        return (
          <g key={n.id}>
            {displaced ? (
              <line
                data-flow-leader={n.id}
                x1={edgeX}
                y1={centreY}
                x2={x}
                y2={n.labelY}
                stroke="var(--gray-a8)"
                strokeWidth={1}
              />
            ) : null}
            <text
              data-flow-label={n.id}
              textAnchor={anchor}
              fontSize={12}
              fill="var(--gray-12)"
              paintOrder="stroke"
              stroke="var(--color-background)"
              strokeWidth={HALO_WIDTH}
              strokeLinejoin="round"
            >
              {n.labelLines.map((line, i) => (
                <tspan
                  // The label's own lines, painted top to bottom: never
                  // reordered and never repeated, so the index is a stable key.
                  // biome-ignore lint/suspicious/noArrayIndexKey: fine, see above
                  key={i}
                  x={x}
                  y={n.labelY + (i - (lineCount - 1) / 2) * LABEL_LINE_HEIGHT}
                  dy="0.32em"
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </>
  );
}

interface LinksProps {
  links: readonly PlacedLink[];
  labels: Map<string, string>;
  totalIn: number;
  activeKey: string | null;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onHover: (key: string | null) => void;
}

/** Every band: a stroke coloured and dimmed by hover/selection state, focusable and clickable. */
function Links({ links, labels, totalIn, activeKey, selected, onSelect, onHover }: LinksProps) {
  return (
    <>
      {links.map((l) => {
        const active = activeKey === l.key;
        return (
          <path
            key={l.key}
            data-flow-link={l.key}
            d={l.path}
            stroke={linkColor(l, active)}
            strokeWidth={Math.max(1, l.width)}
            fill="none"
            opacity={activeKey === null || active ? 1 : 0.35}
            tabIndex={0}
            role="button"
            aria-pressed={selected === l.key}
            aria-label={linkText(l, labels, totalIn)}
            onMouseEnter={() => onHover(l.key)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(l.key)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(l.key)}
            onKeyDown={(event) => handleKeyDown(event, l.key, onSelect)}
          />
        );
      })}
    </>
  );
}

/** The band a caller's hover or pinned selection points at, and its readout string. */
function activeLinkText(
  layout: { links: readonly PlacedLink[] },
  activeKey: string | null,
  labels: Map<string, string>,
  totalIn: number,
): { link: PlacedLink | null; text: string | null } {
  if (activeKey === null) return { link: null, text: null };
  const link = layout.links.find((l) => l.key === activeKey) ?? null;
  return { link, text: link === null ? null : linkText(link, labels, totalIn) };
}

/** The path's starting x, `M x1,sy ...`, for the tooltip's horizontal anchor. */
function pathStartX(path: string): number {
  return Number(path.split(" ")[1]?.split(",")[0] ?? 0);
}

const EMPTY_HIGHLIGHT: ReadonlySet<string> = new Set();

/**
 * A hand rolled Sankey of the period's money flow: four fixed columns laid
 * out by `layoutSankey`, rendered as focusable, clickable bands. Every node
 * and link label comes from `nodeLines`/`linkText`, each one call to
 * `formatCurrency` and `formatShare`, so the hover readout can never say a
 * different figure than the band's own `aria-label`. d3-sankey was rejected
 * for this fixed four-column graph; see `sankeyLayout.ts`.
 */
export function Sankey({ graph, selected, onSelect }: SankeyProps) {
  const summaryId = useSvgId("flow-summary");
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const { ref: containerRef, width: measuredWidth } =
    useMeasuredWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const height = useMemo(() => sankeyHeight(graph), [graph]);
  // Outer margins sized from column 0's and column 3's own widest wrapped
  // label, never a constant sized for the single longest name this project
  // has ever seen -- see `outerMargins`.
  const margins = useMemo(() => outerMargins(graph), [graph]);
  const boxShape = useMemo(() => ({ ...NODE_SHAPE, ...margins }), [margins]);
  // Never narrower than the graph's own labels need -- see `minChartWidth`.
  // Below that floor the chart gets its own horizontally scrollable region
  // rather than squeezing labels back into collision, and the page itself
  // never scrolls for it.
  const layoutWidth = useMemo(
    () => Math.max(measuredWidth, minChartWidth(graph, boxShape)),
    [graph, measuredWidth, boxShape],
  );
  const needsScroll = layoutWidth > measuredWidth;
  const box: SankeyBox = useMemo(
    () => ({ ...boxShape, width: layoutWidth, height }),
    [boxShape, layoutWidth, height],
  );
  const layout = useMemo(() => layoutSankey(graph, box), [graph, box]);
  const labels = useMemo(() => labelsOf(graph.nodes), [graph.nodes]);
  const summary = useMemo(
    () => summaryText(graph.links, labels, graph.totalIn),
    [graph.links, labels, graph.totalIn],
  );

  if (graph.nodes.length === 0) {
    return <p>No money flow for this period.</p>;
  }

  const activeKey = hoverKey ?? selected;
  const { link: activeLink, text: activeText } = activeLinkText(
    layout,
    activeKey,
    labels,
    graph.totalIn,
  );
  const lines = activeText === null ? [] : [activeText];
  const highlighted: ReadonlySet<string> =
    activeLink === null ? EMPTY_HIGHLIGHT : new Set([activeLink.source, activeLink.target]);
  // A hover always wins the floating readout, near the pointer, because it
  // is transient. A PIN with nothing currently hovered gets a plain line
  // above the chart instead: the floating box sits at the plot's own top
  // edge, which for a pinned band with no hover in progress hid that
  // band's own target label -- exactly the thing a reader pinned the band
  // to keep looking at.
  const hovering = hoverKey !== null;
  const showPinnedLine = !hovering && selected !== null && activeText !== null;
  const showFloatingTooltip = hovering && activeLink !== null;

  return (
    <div style={{ position: "relative" }}>
      {showPinnedLine ? (
        <Text
          size="2"
          color="gray"
          as="p"
          mb="2"
          data-flow-pinned-readout=""
          style={{ margin: 0, marginBottom: 8 }}
        >
          {activeText}
        </Text>
      ) : null}
      <div ref={containerRef} style={{ position: "relative" }}>
        <div style={{ overflowX: needsScroll ? "auto" : "visible" }}>
          <svg
            viewBox={`0 0 ${layoutWidth} ${height}`}
            // biome-ignore lint/a11y/useSemanticElements: an interactive chart, not a form's fieldset
            role="group"
            aria-label="Money flow"
            aria-describedby={summaryId}
            style={{
              width: needsScroll ? layoutWidth : "100%",
              height: "auto",
              display: "block",
            }}
          >
            <NodeRects nodes={layout.nodes} highlighted={highlighted} />
            <Links
              links={layout.links}
              labels={labels}
              totalIn={graph.totalIn}
              activeKey={activeKey}
              selected={selected}
              onSelect={onSelect}
              onHover={setHoverKey}
            />
            <NodeLabels nodes={layout.nodes} />
          </svg>
        </div>
        <p id={summaryId} style={VISUALLY_HIDDEN}>
          {summary}
        </p>
        <CursorAnnouncement lines={lines} />
        {showFloatingTooltip && activeLink !== null ? (
          <div style={{ ...tooltipAnchorStyle(pathStartX(activeLink.path), layoutWidth), top: 0 }}>
            <ChartTooltip lines={lines} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
