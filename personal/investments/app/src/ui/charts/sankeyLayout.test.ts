import { describe, expect, test } from "bun:test";
import { buildFlowGraph } from "../../analytics/flows/graph";
import type { FlowGraph, FlowLink, FlowNode } from "../../analytics/flows/graph";
import { yearPeriod } from "../../analytics/flows/period";
import { loadFlows } from "../data";
import { type SankeyBox, layoutSankey, linkKey, sankeyHeight } from "./sankeyLayout";

const BOX: SankeyBox = {
  width: 1152,
  height: 420,
  nodeWidth: 16,
  nodeGap: 8,
  labelLeft: 120,
  labelRight: 120,
};

function node(id: string, column: 0 | 1 | 2 | 3, value: number, label = id): FlowNode {
  return { id, column, label, value };
}

function link(source: string, target: string, value: number): FlowLink {
  return { source, target, value, recycled: false, rowIds: [] };
}

function graph(nodes: FlowNode[], links: FlowLink[]): FlowGraph {
  return { nodes, links, totalIn: links.reduce((s, l) => s + l.value, 0) };
}

describe("layoutSankey: the shared scale", () => {
  test("a single link between two nodes gets width value × the column's own k", () => {
    const g = graph([node("a", 0, 100), node("b", 3, 100)], [link("a", "b", 100)]);
    const layout = layoutSankey(g, BOX);
    const k = BOX.height / 100;
    expect(layout.links[0]?.width).toBeCloseTo(100 * k, 5);
  });

  test("three columns of different totals and counts share one k", () => {
    const g = graph(
      [
        node("a", 0, 100),
        node("hub", 1, 100),
        node("c1", 2, 60),
        node("c2", 2, 40),
        node("d", 3, 100),
      ],
      [
        link("a", "hub", 100),
        link("hub", "c1", 60),
        link("hub", "c2", 40),
        link("c1", "d", 60),
        link("c2", "d", 40),
      ],
    );
    const layout = layoutSankey(g, BOX);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    // Same k means height / value is constant across every node in the graph.
    const ratios = [...byId.values()].map((n) => (n.y1 - n.y0) / n.value);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0] ?? 0, 5);
  });
});

describe("layoutSankey: a node's edges", () => {
  test("a hub node's outgoing link widths sum to its own height", () => {
    const g = graph(
      [node("a", 0, 150), node("hub", 1, 150), node("c1", 2, 90), node("c2", 2, 60)],
      [link("a", "hub", 150), link("hub", "c1", 90), link("hub", "c2", 60)],
    );
    const layout = layoutSankey(g, BOX);
    const hub = layout.nodes.find((n) => n.id === "hub");
    const outWidths = layout.links
      .filter((l) => l.source === "hub")
      .reduce((s, l) => s + l.width, 0);
    expect(outWidths).toBeCloseTo((hub?.y1 ?? 0) - (hub?.y0 ?? 0), 5);
  });
});

describe("layoutSankey: labels", () => {
  test("twenty tiny nodes in one column stay at least 28 apart and inside the box", () => {
    // A box just tall enough to fit 20 labels 28 apart (532), with enough
    // slack that the downward pass is still needed (natural spacing is
    // under 28) and the upward pass still keeps every label inside [0, H].
    const box: SankeyBox = { ...BOX, height: 540 };
    const nodes = Array.from({ length: 20 }, (_, i) => node(`n${i}`, 2, 0.01, `N${i}`));
    const links = nodes.map((n) => link("src", n.id, n.value));
    const g = graph([node("src", 0, 0.12), ...nodes], links);
    const layout = layoutSankey(g, box);
    const labels = layout.nodes
      .filter((n) => n.column === 2)
      .sort((a, b) => a.labelY - b.labelY)
      .map((n) => n.labelY);
    for (let i = 1; i < labels.length; i++) {
      const prev = labels[i - 1];
      const cur = labels[i];
      if (prev === undefined || cur === undefined) continue;
      expect(cur - prev).toBeGreaterThanOrEqual(28 - 1e-6);
    }
    for (const y of labels) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(box.height);
    }
  });
});

describe("layoutSankey: spanning links", () => {
  test("a link from column 0 to column 2 starts at column 0's x1 and ends at column 2's x0", () => {
    const g = graph([node("a", 0, 100), node("mid", 2, 100)], [link("a", "mid", 100)]);
    const layout = layoutSankey(g, BOX);
    const a = layout.nodes.find((n) => n.id === "a");
    const mid = layout.nodes.find((n) => n.id === "mid");
    const l = layout.links[0];
    const [endX] = (l?.path.split(" ").pop() ?? "").split(",");
    expect(l?.path.startsWith(`M ${a?.x1},`)).toBe(true);
    expect(Number(endX)).toBeCloseTo(mid?.x0 ?? Number.NaN, 5);
  });
});

describe("layoutSankey: the empty graph", () => {
  test("yields no nodes and no throw", () => {
    const layout = layoutSankey({ nodes: [], links: [], totalIn: 0 }, BOX);
    expect(layout.nodes).toEqual([]);
    expect(layout.links).toEqual([]);
    expect(layout.height).toBe(BOX.height);
  });
});

describe("linkKey", () => {
  test("joins source and target with an arrow", () => {
    expect(linkKey({ source: "a", target: "b" })).toBe("a->b");
  });
});

describe("against the real 2026 corpus", () => {
  test("labels do not overlap for every column of the real graph, grouped by account type", () => {
    const flows = loadFlows();
    const accounts = new Set(flows.accounts.map((a) => a.accountId));
    const g = buildFlowGraph(flows, yearPeriod(2026), "accountType", accounts);
    const box: SankeyBox = { ...BOX, height: sankeyHeight(g) };
    const layout = layoutSankey(g, box);
    for (const column of [0, 1, 2, 3] as const) {
      const labels = layout.nodes
        .filter((n) => n.column === column)
        .sort((a, b) => a.labelY - b.labelY)
        .map((n) => n.labelY);
      for (let i = 1; i < labels.length; i++) {
        const prev = labels[i - 1];
        const cur = labels[i];
        if (prev === undefined || cur === undefined) continue;
        expect(cur - prev).toBeGreaterThanOrEqual(28 - 1e-6);
      }
    }
  });
});
