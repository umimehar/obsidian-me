import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FlowGraph, FlowLink, FlowNode } from "../../analytics/flows/graph";
import { expectNoCoarseForm } from "../testSupport/coarseForm";
import { Sankey } from "./Sankey";

afterEach(cleanup);

function node(id: string, column: 0 | 1 | 2 | 3, value: number, label: string): FlowNode {
  return { id, column, label, value };
}

function link(source: string, target: string, value: number, recycled = false): FlowLink {
  return { source, target, value, recycled, rowIds: [] };
}

/**
 * Five links, distinct values so their order is unambiguous, spanning every
 * column and including one band into `now:costs` for the red-stroke check.
 */
const GRAPH: FlowGraph = {
  nodes: [
    node("a0", 0, 5000, "Payroll deposited"),
    node("b1", 1, 5000, "Chequing"),
    node("c2a", 2, 3000, "TFSA"),
    node("c2b", 2, 2000, "RRSP"),
    node("d3a", 3, 4000, "Invested"),
    node("now:costs", 3, 1000, "Fees and withholding"),
  ],
  links: [
    link("a0", "b1", 5000),
    link("b1", "c2a", 3000),
    link("b1", "c2b", 2000),
    link("c2a", "d3a", 4000),
    link("c2b", "now:costs", 1000),
  ],
  totalIn: 5000,
};

function renderChart(
  selected: string | null = null,
  onSelect: (k: string | null) => void = () => {},
  graph: FlowGraph = GRAPH,
) {
  render(<Sankey graph={graph} selected={selected} onSelect={onSelect} />);
}

function band(key: string): Element {
  const el = document.querySelector(`[data-flow-link="${key}"]`);
  if (el === null) throw new Error(`no band for ${key}`);
  return el;
}

function nodeRect(id: string): Element {
  const el = document.querySelector(`[data-flow-node="${id}"]`);
  if (el === null) throw new Error(`no node rect for ${id}`);
  return el;
}

function labelText(id: string): string {
  return document.querySelector(`[data-flow-label="${id}"]`)?.textContent ?? "";
}

describe("node labels", () => {
  test("every node's label is two lines: the name, then amount and share", () => {
    renderChart();
    const el = document.querySelector('[data-flow-label="c2b"]');
    const tspans = [...(el?.querySelectorAll("tspan") ?? [])].map((t) => t.textContent);
    expect(tspans).toEqual(["RRSP", "$2,000.00 · 40.0%"]);
  });

  test("a column-0 node's label anchors end, in the left margin", () => {
    renderChart();
    const el = document.querySelector('[data-flow-label="a0"]');
    const rect = nodeRect("a0");
    expect(el?.getAttribute("text-anchor")).toBe("end");
    const tspanX = Number(el?.querySelector("tspan")?.getAttribute("x"));
    expect(tspanX).toBeLessThan(Number(rect.getAttribute("x")));
  });

  test("a column-3 node's label anchors start, in the right margin", () => {
    renderChart();
    const el = document.querySelector('[data-flow-label="d3a"]');
    const rect = nodeRect("d3a");
    expect(el?.getAttribute("text-anchor")).toBe("start");
    const tspanX = Number(el?.querySelector("tspan")?.getAttribute("x"));
    const rectRight = Number(rect.getAttribute("x")) + Number(rect.getAttribute("width"));
    expect(tspanX).toBeGreaterThan(rectRight);
  });

  test("a middle-column node's label sits in the gap to its right, over the bands", () => {
    renderChart();
    const el = document.querySelector('[data-flow-label="b1"]');
    const rect = nodeRect("b1");
    expect(el?.getAttribute("text-anchor")).toBe("start");
    const tspanX = Number(el?.querySelector("tspan")?.getAttribute("x"));
    const rectRight = Number(rect.getAttribute("x")) + Number(rect.getAttribute("width"));
    expect(tspanX).toBeGreaterThan(rectRight);
  });

  test("every label carries a background-coloured halo, painted under its own stroke", () => {
    renderChart();
    const el = document.querySelector('[data-flow-label="c2a"]');
    expect(el?.getAttribute("paint-order")).toBe("stroke");
    expect(el?.getAttribute("stroke")).toBe("var(--color-background)");
  });
});

describe("leader lines", () => {
  test("a label pushed away from its node's own centre gets a leader line back to it", () => {
    // A dominant node plus fifteen tiny ones: `sankeyHeight`'s 44px-per-node
    // budget is generous for equal-value columns, but a huge node still
    // consumes almost all of it, floors the tiny ones to MIN_NODE_HEIGHT,
    // and forces the label declutter to push their labels well away from
    // their own two-pixel-tall rectangles.
    const tiny = Array.from({ length: 15 }, (_, i) => node(`n${i}`, 2, 0.001, `N${i}`));
    const links = [link("src", "big", 999), ...tiny.map((n) => link("src", n.id, 0.001))];
    const graph: FlowGraph = {
      nodes: [node("src", 0, 999.015, "Src"), node("big", 2, 999, "Big"), ...tiny],
      links,
      totalIn: 999.015,
    };
    renderChart(null, () => {}, graph);
    const leaders = document.querySelectorAll("[data-flow-leader]");
    expect(leaders.length).toBeGreaterThan(0);
  });

  test("an isolated node with room to itself gets no leader line", () => {
    renderChart();
    expect(document.querySelector('[data-flow-leader="a0"]')).toBeNull();
  });
});

describe("link accessible names", () => {
  test("a band's aria-label states source, target, amount and share of money in", () => {
    renderChart();
    expect(band("b1->c2a").getAttribute("aria-label")).toBe(
      "Chequing to TFSA, $3,000.00, 60.0% of money in",
    );
  });

  test("the hover readout is exactly the band's own aria-label, at full precision", () => {
    renderChart();
    const el = band("b1->c2a");
    fireEvent.mouseEnter(el);
    const tooltip = document.querySelector("[data-chart-tooltip]")?.textContent ?? "";
    const ariaLabel = el.getAttribute("aria-label") ?? "";
    expect(tooltip).toBe(ariaLabel);
    expectNoCoarseForm(tooltip, 3000);
    expectNoCoarseForm(ariaLabel, 3000);
  });
});

describe("keyboard", () => {
  test("Enter on a focused band pins it", () => {
    const calls: (string | null)[] = [];
    renderChart(null, (key) => calls.push(key));
    fireEvent.keyDown(band("b1->c2a"), { key: "Enter" });
    expect(calls.at(-1)).toBe("b1->c2a");
  });

  test("Space on a focused band pins it too", () => {
    const calls: (string | null)[] = [];
    renderChart(null, (key) => calls.push(key));
    fireEvent.keyDown(band("c2b->now:costs"), { key: " " });
    expect(calls.at(-1)).toBe("c2b->now:costs");
  });

  test("Escape clears the selection", () => {
    const calls: (string | null)[] = [];
    renderChart("pinned", (key) => calls.push(key));
    fireEvent.keyDown(band("a0->b1"), { key: "Escape" });
    expect(calls.at(-1)).toBeNull();
  });
});

describe("tab order", () => {
  test("the first focusable band's source sits in column 0", () => {
    renderChart();
    const first = document.querySelector('[role="button"][tabindex="0"]');
    const key = first?.getAttribute("data-flow-link") ?? "";
    const [source] = key.split("->");
    expect(source).toBe("a0");
  });
});

describe("the accessible summary", () => {
  test("lists the five largest flows, largest first", () => {
    renderChart();
    const summary = screen
      .getByRole("group", { name: "Money flow" })
      .getAttribute("aria-describedby");
    const el = summary === null ? null : document.getElementById(summary);
    const text = el?.textContent ?? "";
    const parts = text.split("; ");
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe("Payroll deposited to Chequing, $5,000.00, 100.0% of money in");
    expect(parts[1]).toBe("TFSA to Invested, $4,000.00, 80.0% of money in");
    expect(parts[2]).toBe("Chequing to TFSA, $3,000.00, 60.0% of money in");
    expect(parts[3]).toBe("Chequing to RRSP, $2,000.00, 40.0% of money in");
    expect(parts[4]).toBe("RRSP to Fees and withholding, $1,000.00, 20.0% of money in");
  });
});

describe("tone", () => {
  test("a band into now:costs carries the red stroke variable", () => {
    renderChart();
    expect(band("c2b->now:costs").getAttribute("stroke")).toBe("var(--red-a6)");
  });

  test("an ordinary band carries the jade stroke variable", () => {
    renderChart();
    expect(band("a0->b1").getAttribute("stroke")).toBe("var(--jade-a6)");
  });

  test("a recycled band carries the gray stroke variable, even into an ordinary target", () => {
    const graph: FlowGraph = {
      nodes: [node("src:income", 0, 500, "Portfolio income"), node("c2a", 2, 500, "TFSA")],
      links: [link("src:income", "c2a", 500, true)],
      totalIn: 500,
    };
    renderChart(null, () => {}, graph);
    expect(band("src:income->c2a").getAttribute("stroke")).toBe("var(--gray-a5)");
  });
});

describe("hover and focus highlight the band's two nodes", () => {
  test("hovering a band brightens its source and target rectangles, and no others", () => {
    renderChart();
    fireEvent.mouseEnter(band("b1->c2a"));
    expect(nodeRect("b1").getAttribute("fill")).toBe("var(--gray-a10)");
    expect(nodeRect("c2a").getAttribute("fill")).toBe("var(--gray-a10)");
    expect(nodeRect("c2b").getAttribute("fill")).toBe("var(--gray-a8)");
  });

  test("focusing a band (keyboard) brightens its two nodes the same way", () => {
    renderChart();
    fireEvent.focus(band("c2a->d3a"));
    expect(nodeRect("c2a").getAttribute("fill")).toBe("var(--gray-a10)");
    expect(nodeRect("d3a").getAttribute("fill")).toBe("var(--gray-a10)");
  });
});

describe("dimming", () => {
  test("an inactive band dims to 0.35 opacity once another band is active", () => {
    renderChart();
    fireEvent.mouseEnter(band("b1->c2a"));
    expect(band("b1->c2a").getAttribute("opacity")).toBe("1");
    expect(band("c2a->d3a").getAttribute("opacity")).toBe("0.35");
  });

  test("no band is dimmed while nothing is active", () => {
    renderChart();
    expect(band("a0->b1").getAttribute("opacity")).toBe("1");
    expect(band("b1->c2a").getAttribute("opacity")).toBe("1");
  });
});

describe("aria-pressed", () => {
  test("a band matching the selected key is pressed, the rest are not", () => {
    renderChart("b1->c2a");
    expect(band("b1->c2a").getAttribute("aria-pressed")).toBe("true");
    expect(band("b1->c2b").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("the live readout", () => {
  test("hovering a band gives CursorAnnouncement the band's own text", () => {
    renderChart();
    fireEvent.mouseEnter(band("b1->c2a"));
    expect(document.querySelector("[data-cursor-announcement]")?.textContent).toBe(
      "Chequing to TFSA, $3,000.00, 60.0% of money in.",
    );
  });
});

describe("the empty graph", () => {
  test("renders no svg rather than throwing", () => {
    render(
      <Sankey graph={{ nodes: [], links: [], totalIn: 0 }} selected={null} onSelect={() => {}} />,
    );
    expect(document.querySelector("svg")).toBeNull();
  });
});

describe("no act warnings", () => {
  test("hover, focus, keyboard and click interactions raise none", () => {
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      renderChart();
      const el = band("b1->c2a");
      fireEvent.mouseEnter(el);
      fireEvent.focus(el);
      fireEvent.keyDown(el, { key: "Enter" });
      fireEvent.keyDown(el, { key: "Escape" });
      fireEvent.blur(el);
      fireEvent.mouseLeave(el);
      fireEvent.click(el);
    } finally {
      console.error = original;
    }
    expect(errors.map((args) => args.join(" ")).join(" ")).not.toMatch(/not wrapped in act/i);
  });
});
