import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FlowGraph, FlowLink, FlowNode } from "../../analytics/flows/graph";
import { expectNoCoarseForm } from "../testSupport/coarseForm";
import { Sankey } from "./Sankey";

afterEach(cleanup);

function node(id: string, column: 0 | 1 | 2 | 3, value: number, label: string): FlowNode {
  return { id, column, label, value };
}

function link(source: string, target: string, value: number): FlowLink {
  return { source, target, value, recycled: false, rowIds: [] };
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
) {
  render(<Sankey graph={GRAPH} selected={selected} onSelect={onSelect} />);
}

function band(key: string): Element {
  const el = document.querySelector(`[data-flow-link="${key}"]`);
  if (el === null) throw new Error(`no band for ${key}`);
  return el;
}

describe("node labels", () => {
  test("every node's text is its name, amount and share, from formatCurrency and formatShare", () => {
    renderChart();
    const texts = [...document.querySelectorAll("text")].map((el) => el.textContent);
    expect(texts).toContain("Payroll deposited · $5,000.00 · 100.0%");
    expect(texts).toContain("RRSP · $2,000.00 · 40.0%");
    expect(texts).toContain("Fees and withholding · $1,000.00 · 20.0%");
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
