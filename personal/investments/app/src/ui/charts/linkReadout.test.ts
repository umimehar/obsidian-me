import { describe, expect, test } from "bun:test";
import type { FlowGraph } from "../../analytics/flows/graph";
import { firstLinesText, linkReadout, readoutText } from "./linkReadout";

const GRAPH: FlowGraph = {
  nodes: [
    { id: "b1", column: 1, label: "Chequing", value: 5000 },
    { id: "c2a", column: 2, label: "TFSA", value: 3000 },
  ],
  links: [{ source: "b1", target: "c2a", value: 3000, recycled: false, rowIds: ["r1", "r2"] }],
  totalIn: 5000,
};

const LINK = GRAPH.links[0];
if (LINK === undefined) throw new Error("test fixture is missing its one link");

describe("linkReadout", () => {
  test("share of source divides by the SOURCE node's own value, not the destination's", () => {
    const lines = linkReadout(LINK, GRAPH);
    const shareSource = lines.find((l) => l.role === "shareSource");
    // 3000 / 5000 (Chequing's own value), not 3000 / 3000 (TFSA's).
    expect(shareSource?.text).toBe("60.0% of Chequing");
  });

  test("share of destination divides by the DESTINATION node's own value, not the source's", () => {
    const lines = linkReadout(LINK, GRAPH);
    const shareDestination = lines.find((l) => l.role === "shareDestination");
    // 3000 / 3000 (TFSA's own value), not 3000 / 5000 (Chequing's).
    expect(shareDestination?.text).toBe("100.0% of what reached TFSA");
  });

  test("share of a node is omitted when that node's own value is zero", () => {
    const graph: FlowGraph = {
      nodes: [
        { id: "a", column: 1, label: "A", value: 0 },
        { id: "b", column: 2, label: "B", value: 500 },
      ],
      links: [{ source: "a", target: "b", value: 500, recycled: false, rowIds: ["r1"] }],
      totalIn: 500,
    };
    const link = graph.links[0];
    if (link === undefined) throw new Error("fixture missing its link");
    const roles = linkReadout(link, graph).map((l) => l.role);
    expect(roles).not.toContain("shareSource");
    expect(roles).toContain("shareDestination");
  });

  test("a link with no rowIds reads as a cash/unreconciled band, not a row count", () => {
    const graph: FlowGraph = {
      nodes: [
        { id: "a", column: 1, label: "A", value: 500 },
        { id: "now:cash", column: 3, label: "Cash", value: 500 },
      ],
      links: [{ source: "a", target: "now:cash", value: 500, recycled: false, rowIds: [] }],
      totalIn: 500,
    };
    const link = graph.links[0];
    if (link === undefined) throw new Error("fixture missing its link");
    const rows = linkReadout(link, graph).find((l) => l.role === "rows");
    expect(rows?.text).toBe("From the statements' cash balances");
  });

  test("readoutText joins every line with '. ' and ends with a single '.'", () => {
    expect(readoutText(linkReadout(LINK, GRAPH))).toBe(
      "Chequing → TFSA. $3,000.00. 60.0% of all money in. 60.0% of Chequing. " +
        "100.0% of what reached TFSA. 2 statement rows · click to see them.",
    );
  });

  test("firstLinesText keeps only the header, amount and share-of-total lines", () => {
    expect(firstLinesText(linkReadout(LINK, GRAPH))).toBe(
      "Chequing → TFSA, $3,000.00, 60.0% of all money in",
    );
  });
});
