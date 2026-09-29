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

/** The module's own two-line label spacing and half block height (`sankeyLayout.ts`). */
const MIN_LABEL_GAP = 32;
const HALF_LABEL_BLOCK = 13;

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
  test("twenty tiny nodes in one column stay at least 32 apart, whole block inside the box", () => {
    // A box just tall enough to fit 20 label BLOCKS 32 apart (608, plus one
    // block's own height), with enough slack that the downward pass is
    // still needed (natural spacing is under 32) and the upward pass still
    // keeps every label's whole two-line block inside [0, H].
    const box: SankeyBox = { ...BOX, height: 635, nodeGap: 2 };
    const nodes = Array.from({ length: 20 }, (_, i) => node(`n${i}`, 2, 0.01, `N${i}`));
    const links = nodes.map((n) => link("src", n.id, n.value));
    const g = graph([node("src", 0, 0.2), ...nodes], links);
    const layout = layoutSankey(g, box);
    const labels = layout.nodes
      .filter((n) => n.column === 2)
      .sort((a, b) => a.labelY - b.labelY)
      .map((n) => n.labelY);
    for (let i = 1; i < labels.length; i++) {
      const prev = labels[i - 1];
      const cur = labels[i];
      if (prev === undefined || cur === undefined) continue;
      expect(cur - prev).toBeGreaterThanOrEqual(MIN_LABEL_GAP - 1e-6);
    }
    for (const y of labels) {
      expect(y - HALF_LABEL_BLOCK).toBeGreaterThanOrEqual(-1e-6);
      expect(y + HALF_LABEL_BLOCK).toBeLessThanOrEqual(box.height + 1e-6);
    }
  });

  test("the bottom label's own two-line block does not get clipped by the box's edge", () => {
    // Reproduces the reviewer's screenshot: a crowded column whose natural
    // downward push lands the last label's block past the box's bottom
    // edge unless the clamp accounts for the block's own half height.
    const box: SankeyBox = { ...BOX, height: 200, nodeGap: 2 };
    const nodes = Array.from({ length: 8 }, (_, i) => node(`n${i}`, 2, 0.001, `N${i}`));
    const links = nodes.map((n) => link("src", n.id, n.value));
    const g = graph([node("src", 0, 0.008), ...nodes], links);
    const layout = layoutSankey(g, box);
    const last = layout.nodes
      .filter((n) => n.column === 2)
      .sort((a, b) => a.labelY - b.labelY)
      .at(-1);
    expect(last).toBeDefined();
    expect((last?.labelY ?? 0) + HALF_LABEL_BLOCK).toBeLessThanOrEqual(box.height + 1e-6);
  });
});

describe("layoutSankey: node heights never overflow the box", () => {
  test("a huge node beside many tiny ones (each floored to MIN_NODE_HEIGHT) still fits inside the box", () => {
    // Before the fix, k was computed as available/total with no regard for
    // the floor: nine tiny nodes clamped to 2px each ate 18px the k-based
    // arithmetic never accounted for, pushing the column's own bottom past
    // the box.
    const box: SankeyBox = { ...BOX, height: 420, nodeGap: 4 };
    const tiny = Array.from({ length: 9 }, (_, i) => node(`t${i}`, 2, 0.0001, `T${i}`));
    const nodes = [node("big", 2, 90, "Big"), ...tiny];
    const links = nodes.map((n) => link("src", n.id, n.value));
    const g = graph([node("src", 0, 90.0009), ...nodes], links);
    const layout = layoutSankey(g, box);
    for (const n of layout.nodes) {
      expect(n.y0).toBeGreaterThanOrEqual(-1e-6);
      expect(n.y1).toBeLessThanOrEqual(box.height + 1e-6);
    }
  });
});

describe("layoutSankey: tab order", () => {
  test("links are ordered by source column, then source y0, then target y0", () => {
    // Insertion order is deliberately not the reading order: the last link
    // pushed (c1's) sources from column 0, ahead of the column-1 hub links.
    const g = graph(
      [
        node("hub", 1, 100),
        node("c1", 2, 40),
        node("c2", 2, 60),
        node("a", 0, 100),
        node("d", 3, 100),
      ],
      [link("hub", "c2", 60), link("hub", "c1", 40), link("a", "hub", 100)],
    );
    const layout = layoutSankey(g, BOX);
    const columns = layout.links.map((l) => layout.nodes.find((n) => n.id === l.source)?.column);
    expect(columns).toEqual([...columns].sort());
    expect(layout.links[0]?.source).toBe("a");
  });
});

describe("layoutSankey: incoming bands are ordered by the source's own y0", () => {
  test("a node with two incoming links stacks them in the same order as their sources", () => {
    const g = graph(
      [node("s1", 0, 10), node("s2", 0, 90), node("d", 3, 100)],
      [link("s2", "d", 90), link("s1", "d", 10)],
    );
    const layout = layoutSankey(g, BOX);
    const s1 = layout.nodes.find((n) => n.id === "s1");
    const s2 = layout.nodes.find((n) => n.id === "s2");
    const l1 = layout.links.find((l) => l.source === "s1");
    const l2 = layout.links.find((l) => l.source === "s2");
    // s1 (value 10) is stacked above s2 (value 90) since nodes stack in the
    // graph's own order, so its incoming band on "d" must sit above s2's.
    expect((s1?.y0 ?? 0) < (s2?.y0 ?? 0)).toBe(true);
    const l1End = Number(l1?.path.split(" ").pop()?.split(",")[1]);
    const l2End = Number(l2?.path.split(" ").pop()?.split(",")[1]);
    expect(l1End).toBeLessThan(l2End);
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
        expect(cur - prev).toBeGreaterThanOrEqual(MIN_LABEL_GAP - 1e-6);
      }
    }
  });
});
