import type { CSSProperties, KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import type { FlowGraph, FlowLink, FlowNode } from "../../analytics/flows/graph";
import { formatCurrency, formatShare } from "../format";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle } from "./Tooltip";
import {
  type PlacedLink,
  type PlacedNode,
  type SankeyBox,
  layoutSankey,
  sankeyHeight,
} from "./sankeyLayout";
import { useSvgId } from "./svgId";

export interface SankeyProps {
  graph: FlowGraph;
  selected: string | null;
  onSelect: (key: string | null) => void;
}

const WIDTH = 1152;
const BOX_BASE: Omit<SankeyBox, "height"> = {
  width: WIDTH,
  nodeWidth: 16,
  nodeGap: 6,
  labelLeft: 160,
  labelRight: 160,
};
const TOP_FLOWS = 5;

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

/** A node's label: its name, its amount and its share of the period's total in, one formatter call each. */
function nodeText(node: FlowNode, totalIn: number): string {
  const share = totalIn > 0 ? node.value / totalIn : 0;
  return `${node.label} · ${formatCurrency(node.value)} · ${formatShare(share)}`;
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

function NodeRects({ nodes, totalIn }: { nodes: readonly PlacedNode[]; totalIn: number }) {
  return (
    <>
      {nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.x0} y={n.y0} width={n.x1 - n.x0} height={n.y1 - n.y0} fill="var(--gray-a8)" />
          <text
            x={n.column === 3 ? n.x0 - 6 : n.x1 + 6}
            y={n.labelY}
            dy="0.32em"
            textAnchor={n.column === 3 ? "end" : "start"}
            fontSize={11}
            fill="var(--gray-12)"
          >
            {nodeText(n, totalIn)}
          </text>
        </g>
      ))}
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

/**
 * A hand rolled Sankey of the period's money flow: four fixed columns laid
 * out by `layoutSankey`, rendered as focusable, clickable bands. Every node
 * and link label comes from `nodeText`/`linkText`, each one call to
 * `formatCurrency` and `formatShare`, so the hover readout can never say a
 * different figure than the band's own `aria-label`. d3-sankey was rejected
 * for this fixed four-column graph; see `sankeyLayout.ts`.
 */
export function Sankey({ graph, selected, onSelect }: SankeyProps) {
  const summaryId = useSvgId("flow-summary");
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const height = useMemo(() => sankeyHeight(graph), [graph]);
  const box: SankeyBox = useMemo(() => ({ ...BOX_BASE, height }), [height]);
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

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        // biome-ignore lint/a11y/useSemanticElements: an interactive chart, not a form's fieldset
        role="group"
        aria-label="Money flow"
        aria-describedby={summaryId}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <NodeRects nodes={layout.nodes} totalIn={graph.totalIn} />
        <Links
          links={layout.links}
          labels={labels}
          totalIn={graph.totalIn}
          activeKey={activeKey}
          selected={selected}
          onSelect={onSelect}
          onHover={setHoverKey}
        />
      </svg>
      <p id={summaryId} style={VISUALLY_HIDDEN}>
        {summary}
      </p>
      <CursorAnnouncement lines={lines} />
      {activeLink === null ? null : (
        <div style={{ ...tooltipAnchorStyle(pathStartX(activeLink.path), WIDTH), top: 0 }}>
          <ChartTooltip lines={lines} />
        </div>
      )}
    </div>
  );
}
