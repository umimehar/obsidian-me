import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FlowGraph, FlowLink, FlowNode } from "../analytics/flows/graph";
import { FlowTable } from "./FlowTable";
import { linkKey } from "./charts/sankeyLayout";
import { formatCurrency, formatShare } from "./format";

afterEach(cleanup);

function node(id: string, column: 0 | 1 | 2 | 3, value: number, label: string): FlowNode {
  return { id, column, label, value };
}

function link(source: string, target: string, value: number): FlowLink {
  return { source, target, value, recycled: false, rowIds: [] };
}

const GRAPH: FlowGraph = {
  nodes: [
    node("a0", 0, 5000, "Payroll deposited"),
    node("b1", 1, 5000, "Chequing"),
    node("c2a", 2, 3000, "TFSA"),
    node("c2b", 2, 2000, "RRSP"),
  ],
  links: [link("a0", "b1", 5000), link("b1", "c2a", 3000), link("b1", "c2b", 2000)],
  totalIn: 5000,
};

function renderTable(
  selected: string | null = null,
  onSelect: (k: string | null) => void = () => {},
) {
  render(
    <Theme>
      <FlowTable graph={GRAPH} selected={selected} onSelect={onSelect} />
    </Theme>,
  );
}

describe("FlowTable", () => {
  test("every link is a row, sorted by amount, largest first", () => {
    renderTable();
    const rows = [...document.querySelectorAll("[data-flow-table-row]")];
    expect(rows.map((r) => r.getAttribute("data-flow-table-row"))).toEqual([
      linkKey({ source: "a0", target: "b1" }),
      linkKey({ source: "b1", target: "c2a" }),
      linkKey({ source: "b1", target: "c2b" }),
    ]);
  });

  test("each row states the source label, destination label, amount and share of money in", () => {
    renderTable();
    const row = document.querySelector(
      `[data-flow-table-row="${linkKey({ source: "b1", target: "c2a" })}"]`,
    );
    expect(row?.textContent).toContain("Chequing");
    expect(row?.textContent).toContain("TFSA");
    expect(row?.textContent).toContain(formatCurrency(3000));
    expect(row?.textContent).toContain(formatShare(3000 / 5000));
  });

  test("clicking a row selects that link", () => {
    const picked: { key: string | null } = { key: null };
    renderTable(null, (key) => {
      picked.key = key;
    });
    fireEvent.click(screen.getAllByRole("button")[1] as HTMLElement);
    expect(picked.key).toBe(linkKey({ source: "b1", target: "c2a" }));
  });

  test("the selected row is marked pressed", () => {
    renderTable(linkKey({ source: "b1", target: "c2b" }));
    const row = document.querySelector(
      `[data-flow-table-row="${linkKey({ source: "b1", target: "c2b" })}"]`,
    );
    expect(row?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("FlowTable, narrow", () => {
  function renderNarrow(
    selected: string | null = null,
    onSelect: (k: string | null) => void = () => {},
  ) {
    render(
      <Theme>
        <FlowTable graph={GRAPH} selected={selected} onSelect={onSelect} narrow={true} />
      </Theme>,
    );
  }

  test("renders no table element at all, only rows", () => {
    renderNarrow();
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelectorAll("[data-flow-table-row]")).toHaveLength(3);
  });

  test("each row is two lines: From -> To, then amount and share", () => {
    renderNarrow();
    const row = document.querySelector(
      `[data-flow-table-row="${linkKey({ source: "b1", target: "c2a" })}"]`,
    );
    expect(row?.textContent).toContain("Chequing → TFSA");
    expect(row?.textContent).toContain(`${formatCurrency(3000)} · ${formatShare(3000 / 5000)}`);
  });

  test("clicking a narrow row still selects that link", () => {
    const picked: { key: string | null } = { key: null };
    renderNarrow(null, (key) => {
      picked.key = key;
    });
    fireEvent.click(screen.getAllByRole("button")[0] as HTMLElement);
    expect(picked.key).toBe(linkKey({ source: "a0", target: "b1" }));
  });
});
