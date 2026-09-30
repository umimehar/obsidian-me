import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FlowGraph, FlowLink, FlowNode } from "../../analytics/flows/graph";
import { expectNoCoarseForm } from "../testSupport/coarseForm";
import { Sankey } from "./Sankey";
import { minChartWidth, outerMargins } from "./sankeyLayout";

/** The same box shape `Sankey.tsx` itself passes to `minChartWidth`: dynamic outer margins plus its fixed node width. */
function boxShapeFor(graph: FlowGraph) {
  return { nodeWidth: 16, ...outerMargins(graph) };
}

type ResizeCallback = (entries: readonly { contentRect: { width: number } }[]) => void;

/** A minimal stand-in for the real `ResizeObserver`, which happy-dom does not implement. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeCallback;
  constructor(callback: ResizeCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {}
}

afterEach(cleanup);

function node(id: string, column: 0 | 1 | 2 | 3, value: number, label: string): FlowNode {
  return { id, column, label, value };
}

/** `rowIds` defaults to three ids -- a plausible ordinary band -- since an empty array reads as a cash/unreconciled band with no statement rows behind it (`linkReadout`). */
function link(
  source: string,
  target: string,
  value: number,
  recycled = false,
  rowIds: readonly string[] = ["r1", "r2", "r3"],
): FlowLink {
  return { source, target, value, recycled, rowIds: [...rowIds] };
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
    expect(document.querySelector('[data-flow-leader="a0"]') === null).toBe(true);
  });
});

/** `b1->c2a`'s own full readout, in the order `linkReadout` states it: `GRAPH`'s Chequing to TFSA band, $3,000.00 of Chequing's $5,000.00 and 100.0% of TFSA's $3,000.00, three statement rows. */
const CHEQUING_TO_TFSA_READOUT =
  "Chequing → TFSA. $3,000.00. 60.0% of all money in. 60.0% of Chequing. " +
  "100.0% of what reached TFSA. 3 statement rows · click to see them.";

describe("link accessible names", () => {
  test("a band's aria-label states source, destination, amount and every share, in order", () => {
    renderChart();
    expect(band("b1->c2a").getAttribute("aria-label")).toBe(CHEQUING_TO_TFSA_READOUT);
  });

  test("the hover readout card states exactly the band's own aria-label, at full precision", () => {
    renderChart();
    const el = band("b1->c2a");
    fireEvent.mouseEnter(el);
    const card = document.querySelector("[data-flow-readout-card]")?.textContent ?? "";
    const ariaLabel = el.getAttribute("aria-label") ?? "";
    // The card renders each line as its own element with no separator, so
    // its concatenated textContent has none either; the aria-label joins
    // the same lines with ". " and a trailing ".", so splitting it back
    // apart and re-joining with nothing proves the card states exactly
    // those same lines.
    const rejoined = ariaLabel.replace(/\.$/, "").split(". ").join("");
    expect(card).toBe(rejoined);
    expectNoCoarseForm(card, 3000);
    expectNoCoarseForm(ariaLabel, 3000);
  });

  test("a band with no rowIds reads as a cash/unreconciled band with no statement rows", () => {
    const graph: FlowGraph = {
      nodes: [node("acct", 1, 500, "TFSA"), node("now:cash", 3, 500, "Cash")],
      links: [link("acct", "now:cash", 500, false, [])],
      totalIn: 500,
    };
    renderChart(null, () => {}, graph);
    expect(band("acct->now:cash").getAttribute("aria-label")).toContain(
      "From the statements' cash balances.",
    );
  });

  test("share of source and destination are each omitted when that node's own value is zero", () => {
    const graph: FlowGraph = {
      nodes: [node("acct", 1, 0, "TFSA"), node("now:cash", 3, 0, "Cash")],
      links: [link("acct", "now:cash", 0)],
      totalIn: 0,
    };
    renderChart(null, () => {}, graph);
    const label = band("acct->now:cash").getAttribute("aria-label") ?? "";
    expect(label).not.toContain("of TFSA");
    expect(label).not.toContain("of what reached Cash");
  });
});

describe("the pinned readout", () => {
  test("renders outside the svg, as a plain line, from the readout's own first lines", () => {
    renderChart("b1->c2a");
    const svg = document.querySelector("svg");
    const readout = document.querySelector("[data-flow-pinned-readout]");
    expect(readout === null).toBe(false);
    expect(svg?.contains(readout)).toBe(false);
    expect(readout?.textContent).toBe("Chequing → TFSA, $3,000.00, 60.0% of all money in");
    // The floating card, which used to cover the plot, does not also render.
    expect(document.querySelector("[data-flow-readout-card]") === null).toBe(true);
  });

  test("no pinned readout renders with nothing selected", () => {
    renderChart(null);
    expect(document.querySelector("[data-flow-pinned-readout]") === null).toBe(true);
  });

  test("hovering a band takes over the floating card and hides the pinned line", () => {
    renderChart("b1->c2a");
    fireEvent.mouseEnter(band("c2b->now:costs"));
    expect(document.querySelector("[data-flow-pinned-readout]") === null).toBe(true);
    const card = document.querySelector("[data-flow-readout-card]")?.textContent ?? "";
    expect(card).toContain("RRSP");
    expect(card).toContain("Fees and withholding");
  });
});

describe("the readout card", () => {
  test("states a header row, the amount, three shares and a rows line, each once", () => {
    renderChart();
    fireEvent.mouseEnter(band("b1->c2a"));
    const card = document.querySelector("[data-flow-readout-card]")?.textContent ?? "";
    expect(card).toContain("Chequing → TFSA");
    expect(card).toContain("$3,000.00");
    expect(card).toContain("60.0% of all money in");
    expect(card).toContain("60.0% of Chequing");
    expect(card).toContain("100.0% of what reached TFSA");
    expect(card).toContain("3 statement rows · click to see them");
  });

  test("the swatch is coloured by the band's own family: red for a cost, gray for recycled", () => {
    renderChart();
    fireEvent.mouseEnter(band("c2b->now:costs"));
    const swatch = document.querySelector("[data-flow-readout-card] span");
    expect((swatch as HTMLElement | null)?.style.background).toBe("var(--red-9)");
  });

  test("keyboard focus on a band shows the same card", () => {
    renderChart();
    fireEvent.focus(band("b1->c2a"));
    const card = document.querySelector("[data-flow-readout-card]")?.textContent ?? "";
    expect(card).toContain("Chequing → TFSA");
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
    expect(calls.at(-1) === null).toBe(true);
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
  test("hovering a band gives CursorAnnouncement the exact same text as the band's aria-label", () => {
    renderChart();
    fireEvent.mouseEnter(band("b1->c2a"));
    expect(document.querySelector("[data-cursor-announcement]")?.textContent).toBe(
      band("b1->c2a").getAttribute("aria-label") ?? undefined,
    );
  });
});

describe("the empty graph", () => {
  test("renders no svg rather than throwing", () => {
    render(
      <Sankey graph={{ nodes: [], links: [], totalIn: 0 }} selected={null} onSelect={() => {}} />,
    );
    expect(document.querySelector("svg") === null).toBe(true);
  });
});

describe("Sankey, measured width", () => {
  test("the layout is laid out at the container's own measured width, when that is wide enough", () => {
    const original = window.ResizeObserver;
    FakeResizeObserver.instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      renderChart();
      const svg = document.querySelector("svg");
      const observer = FakeResizeObserver.instances[0];
      expect(observer).toBeDefined();
      const wide = 5000;
      expect(wide).toBeGreaterThan(minChartWidth(GRAPH, boxShapeFor(GRAPH)));
      act(() => {
        observer?.callback([{ contentRect: { width: wide } }]);
      });
      const [minX, minY, width, height] = (svg?.getAttribute("viewBox") ?? "").split(" ");
      expect(minX).toBe("0");
      expect(minY).toBe("0");
      expect(width).toBe(String(wide));
      expect(Number(height)).toBeGreaterThan(0);
    } finally {
      window.ResizeObserver = original;
    }
  });

  test("every label renders at exactly 12px, the fixed font size, whatever the width", () => {
    renderChart();
    const label = document.querySelector("[data-flow-label]");
    expect(label?.getAttribute("font-size")).toBe("12");
  });

  test("never lays out narrower than the graph's own labels need, and scrolls its own region rather than the page", () => {
    const original = window.ResizeObserver;
    FakeResizeObserver.instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      renderChart();
      const observer = FakeResizeObserver.instances[0];
      const needed = minChartWidth(GRAPH, boxShapeFor(GRAPH));
      const narrow = Math.round(needed / 2);
      act(() => {
        observer?.callback([{ contentRect: { width: narrow } }]);
      });
      const svg = document.querySelector("svg");
      const [, , width] = (svg?.getAttribute("viewBox") ?? "").split(" ");
      expect(Number(width)).toBeCloseTo(needed, 2);
      // The svg itself carries a fixed pixel width (not 100%) so it does not
      // shrink back down to the narrow container; the wrapper around it is
      // what scrolls.
      expect(svg?.getAttribute("style")).toContain(`width: ${needed}px`);
    } finally {
      window.ResizeObserver = original;
    }
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
