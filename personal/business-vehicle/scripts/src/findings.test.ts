import { describe, expect, test } from "bun:test";
import { bySeverity, findingsHtml } from "./findings";
import type { Finding } from "./types";

const sample: Finding[] = [
  {
    id: "a",
    severity: "low",
    title: "Low one",
    detail: "d",
    why: "w",
    action: "a",
    sources: ["s"],
  },
  {
    id: "b",
    severity: "high",
    title: "High one",
    detail: "d",
    why: "w",
    action: "a",
    sources: ["s"],
  },
  {
    id: "c",
    severity: "medium",
    title: "Mid one",
    detail: "d",
    why: "w",
    action: "a",
    sources: ["s"],
  },
];

describe("bySeverity", () => {
  test("orders high before medium before low", () => {
    expect(bySeverity(sample).map((f) => f.id)).toEqual(["b", "c", "a"]);
  });

  test("keeps the original order within one severity", () => {
    const two: Finding[] = [
      { ...(sample[1] as Finding), id: "first" },
      { ...(sample[1] as Finding), id: "second" },
    ];
    expect(bySeverity(two).map((f) => f.id)).toEqual(["first", "second"]);
  });

  test("does not mutate the array it was given", () => {
    const order = sample.map((f) => f.id);
    bySeverity(sample);
    expect(sample.map((f) => f.id)).toEqual(order);
  });
});

describe("findingsHtml", () => {
  test("renders every finding with its severity, action and sources", () => {
    const html = findingsHtml(sample);
    for (const f of sample) {
      expect(html).toContain(f.title);
      expect(html).toContain(f.severity);
    }
    expect(html.match(/class="card"/g)?.length).toBe(3);
  });

  test("escapes markup in the finding text", () => {
    const html = findingsHtml([
      {
        id: "x",
        severity: "high",
        title: "<script>",
        detail: "d",
        why: "w",
        action: "a",
        sources: [],
      },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("says so plainly when there is nothing to report", () => {
    expect(findingsHtml([])).toContain("Nothing outstanding");
  });

  test("can render only the highest severity when asked", () => {
    expect(findingsHtml(sample, { only: "high" }).match(/class="card"/g)?.length).toBe(1);
  });
});
