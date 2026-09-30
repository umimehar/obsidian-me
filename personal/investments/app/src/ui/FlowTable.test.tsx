import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FlowGraph, FlowLink, FlowNode } from "../analytics/flows/graph";
import { FlowTable } from "./FlowTable";
import { linkKey } from "./charts/sankeyLayout";
import { formatCurrency, formatShare } from "./format";

afterEach(cleanup);

type ResizeCallback = () => void;

/**
 * A minimal stand-in for the real `ResizeObserver`, which happy-dom does not
 * implement -- the same pattern `DestinationChart.test.tsx` and
 * `Sankey.test.tsx` already use. `useScrollOverflow` never reads the
 * callback's own entries, only re-measures `scrollHeight`/`clientHeight` off
 * the DOM when it fires, so this fake need not fabricate any.
 */
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

/**
 * happy-dom's `scrollHeight`/`clientHeight` are always 0, so a real overflow
 * is stubbed by hand: `scrollHeight` above `clientHeight` is what
 * `useScrollOverflow` treats as "this region scrolls", the same real
 * measurement a browser makes, not a row count compared against a guessed
 * capacity.
 */
function stubScrollMetrics(el: Element, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
}

/**
 * Stubs the scroll metrics of whichever element is the real scrolling one
 * for the rendered variant -- `[data-flow-table]` itself in the narrow
 * case, `.rt-ScrollAreaViewport` inside it in the wide one, per
 * `useScrollOverflow`'s own comment on `contentEl` versus `scrollEl` -- then
 * fires every pending fake observer inside `act` so the resulting
 * `setOverflowing` call is flushed before the caller's own assertions run.
 */
function triggerOverflowMeasurement(scrollHeight: number, clientHeight: number): void {
  const root = document.querySelector("[data-flow-table]");
  const scrollEl = root?.querySelector(".rt-ScrollAreaViewport") ?? root;
  if (scrollEl !== null && scrollEl !== undefined) {
    stubScrollMetrics(scrollEl, scrollHeight, clientHeight);
  }
  act(() => {
    for (const observer of FakeResizeObserver.instances) observer.callback();
  });
}

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

/** More flows than either variant's own windowed region can show without scrolling. */
function longGraph(count: number): FlowGraph {
  const nodes: FlowNode[] = [node("src", 0, count * 100, "Payroll deposited")];
  const links: FlowLink[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = `dest${i}`;
    nodes.push(node(id, 1, 100, `Account ${i}`));
    links.push(link("src", id, 100));
  }
  return { nodes, links, totalIn: count * 100 };
}

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

  test("a caption states the row count and sort order", () => {
    renderTable();
    const caption = document.querySelector("[data-flow-table-caption]");
    expect(caption?.textContent).toBe("3 flows, largest first");
  });

  test("every header cell is pinned so the header never scrolls out of view", () => {
    renderTable();
    const cells = [...document.querySelectorAll("thead th")];
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect((cell as HTMLElement).style.position).toBe("sticky");
    }
  });

  test("a 6-row period shows every row and no hint once measured as fitting", () => {
    const original = window.ResizeObserver;
    FakeResizeObserver.instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      render(
        <Theme>
          <FlowTable graph={longGraph(6)} selected={null} onSelect={() => {}} />
        </Theme>,
      );
      expect(document.querySelectorAll("[data-flow-table-row]")).toHaveLength(6);
      // scrollHeight <= clientHeight: the real measurement a short table
      // gets once its box has room for every row.
      triggerOverflowMeasurement(200, 300);
      expect(document.querySelector("[data-flow-table-scroll-hint]") === null).toBe(true);
    } finally {
      window.ResizeObserver = original;
    }
  });

  test("a scroll hint appears once the region is measured as overflowing", () => {
    const original = window.ResizeObserver;
    FakeResizeObserver.instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      render(
        <Theme>
          <FlowTable graph={longGraph(40)} selected={null} onSelect={() => {}} />
        </Theme>,
      );
      const caption = document.querySelector("[data-flow-table-caption]");
      expect(caption?.textContent).toBe("40 flows, largest first");
      expect(document.querySelector("[data-flow-table-scroll-hint]") === null).toBe(true);
      // scrollHeight > clientHeight: real content taller than the capped box.
      triggerOverflowMeasurement(1400, 360);
      expect(document.querySelector("[data-flow-table-scroll-hint]")?.textContent).toBe(
        "Scroll for more.",
      );
    } finally {
      window.ResizeObserver = original;
    }
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
    expect(document.querySelector("table") === null).toBe(true);
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

  test("a caption states the row count", () => {
    renderNarrow();
    expect(document.querySelector("[data-flow-table-caption]")?.textContent).toBe(
      "3 flows, largest first",
    );
  });

  test("a 6-row period shows every row and no hint once measured as fitting", () => {
    const original = window.ResizeObserver;
    FakeResizeObserver.instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      render(
        <Theme>
          <FlowTable graph={longGraph(6)} selected={null} onSelect={() => {}} narrow={true} />
        </Theme>,
      );
      expect(document.querySelectorAll("[data-flow-table-row]")).toHaveLength(6);
      triggerOverflowMeasurement(200, 300);
      expect(document.querySelector("[data-flow-table-scroll-hint]") === null).toBe(true);
    } finally {
      window.ResizeObserver = original;
    }
  });

  test("a scroll hint appears once the narrow region is measured as overflowing", () => {
    const original = window.ResizeObserver;
    FakeResizeObserver.instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      render(
        <Theme>
          <FlowTable graph={longGraph(40)} selected={null} onSelect={() => {}} narrow={true} />
        </Theme>,
      );
      expect(document.querySelector("[data-flow-table-scroll-hint]") === null).toBe(true);
      triggerOverflowMeasurement(1400, 360);
      expect(document.querySelector("[data-flow-table-scroll-hint]")?.textContent).toBe(
        "Scroll for more.",
      );
    } finally {
      window.ResizeObserver = original;
    }
  });
});
