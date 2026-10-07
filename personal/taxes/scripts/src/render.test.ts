import { describe, expect, test } from "bun:test";
import { bars, xOf } from "./clocks";
import { plainDate, relativeDays, shortDate } from "./format";
import { prose } from "./layout";
import { dueHtml } from "./pages/index";
import { chains } from "./pages/rules";
import { groupByYear } from "./pages/timeline";
import { sortItems } from "./status";
import type { Decision, Filing, OpenItem, TimelineEvent } from "./types";
import { leakProblems } from "./validate";

const filing = (over: Partial<Filing>): Filing => ({
  id: "f",
  kind: "T2",
  scope: "corporate",
  title: "T2",
  period_start: "2025-01-01",
  period_end: "2025-12-31",
  status: "filed",
  plain: "",
  lines: [],
  notes: [],
  sources: [],
  ...over,
});

describe("three clocks geometry", () => {
  test("maps the ends of the axis to 0 and the width, and clamps outside dates", () => {
    expect(xOf("2024-01-01", "2024-01-01", "2026-01-01", 100)).toBe(0);
    expect(xOf("2026-01-01", "2024-01-01", "2026-01-01", 100)).toBe(100);
    expect(xOf("2030-01-01", "2024-01-01", "2026-01-01", 100)).toBe(100);
    expect(xOf("2025-01", "2024-01-01", "2026-01-01", 100)).toBeCloseTo(50, 0);
    expect(xOf("2025", "2024-01-01", "2026-01-01", 100)).toBeCloseTo(50, 0);
  });

  test("puts each kind of return in its own lane and skips kinds without one", () => {
    const out = bars(
      [filing({ kind: "HST" }), filing({ kind: "T1" }), filing({ kind: "payroll" })],
      "2025-01-01",
      "2026-01-01",
      100,
    );
    expect(out.map((b) => b.lane)).toEqual([1, 2]);
  });

  test("an HST year straddles two calendar years", () => {
    const [b] = bars(
      [filing({ kind: "HST", period_start: "2025-08-15", period_end: "2026-08-14" })],
      "2025-01-01",
      "2027-01-01",
      730,
    );
    expect(b?.x).toBeCloseTo(226, 0);
    expect(b?.width).toBeCloseTo(362, 0);
  });
});

describe("prose", () => {
  const glossary = [
    { term: "HST", plain: "Sales tax" },
    { term: "ITC", plain: 'Credit for "HST" paid' },
  ];

  test("links only the first mention of each term", () => {
    const html = prose("HST and ITC; more HST", glossary);
    expect(html.match(/class="tax-term"/g)?.length).toBe(2);
    expect(html.endsWith("more HST")).toBe(true);
  });

  test("never rescans a term inside an earlier link's title", () => {
    const html = prose("ITC first, then HST", glossary);
    expect(html).toContain('title="Credit for &quot;HST&quot; paid">ITC</a>');
    expect(html).toContain(">HST</a>");
  });

  test("escapes the surrounding text", () => {
    expect(prose("<b>", glossary)).toBe("&lt;b&gt;");
  });

  test("does not link a term inside a longer word", () => {
    expect(prose("HSTX", glossary)).toBe("HSTX");
  });
});

describe("dates", () => {
  test("renders each precision", () => {
    expect(plainDate("2025-11-14")).toBe("14 November 2025");
    expect(plainDate("2025-11")).toBe("November 2025");
    expect(plainDate("2025")).toBe("2025");
  });

  test("short dates show the year only when it is not the current one", () => {
    expect(shortDate("2026-12-31", "2026")).toBe("31 Dec");
    expect(shortDate("2031-12-31", "2026")).toBe("31 Dec 2031");
  });

  test("relative days in both directions", () => {
    expect(relativeDays("2026-10-07", "2026-11-16")).toBe("in 40 days");
    expect(relativeDays("2026-10-07", "2026-10-05")).toBe("2 days ago");
    expect(relativeDays("2026-10-07", "2026-10-07")).toBe("today");
    expect(relativeDays("2026-10-07", "2031")).toBe("in 1547 days");
  });
});

describe("rule chains", () => {
  const dec = (id: string, date: string, status: Decision["status"]): Decision => ({
    id,
    date,
    scope: "corporate",
    subject: "rent",
    title: "Rent",
    decision: id,
    rationale: "",
    status,
    sources: [],
  });

  test("newest first, active ahead of a superseded rule on the same day", () => {
    const [chain] = chains([
      dec("old", "2025-12-31", "superseded"),
      dec("b", "2026-09-23", "superseded"),
      dec("a", "2026-09-23", "active"),
    ]);
    expect(chain?.map((d) => d.id)).toEqual(["a", "b", "old"]);
  });
});

describe("ordering", () => {
  test("open before waiting, soonest due first, undated last", () => {
    const item = (id: string, status: OpenItem["status"], due?: string): OpenItem => ({
      id,
      title: id,
      owner: "Umar",
      scope: "corporate",
      status,
      detail: "",
      sources: [],
      ...(due ? { due } : {}),
    });
    const out = sortItems([
      item("w", "waiting", "2026-01-01"),
      item("late", "open"),
      item("soon", "open", "2026-11-01"),
    ]);
    expect(out.map((i) => i.id)).toEqual(["soon", "late", "w"]);
  });

  test("timeline groups newest year first", () => {
    const ev = (id: string, date: string): TimelineEvent => ({
      id,
      date,
      scope: "corporate",
      category: "other",
      title: id,
      detail: "",
      sources: [],
    });
    const groups = groupByYear([
      ev("a", "2024-05-01"),
      ev("b", "2026-01-01"),
      ev("c", "2026-03-01"),
    ]);
    expect(groups.map(([y, es]) => [y, es.map((e) => e.id)])).toEqual([
      ["2026", ["c", "b"]],
      ["2024", ["a"]],
    ]);
  });
});

describe("leak check", () => {
  const base = { meta: {}, timeline: [], catalog: null } as unknown as Parameters<
    typeof leakProblems
  >[0];

  test("flags a SIN-shaped number", () => {
    const d = { ...base, timeline: [{ detail: "SIN 123-456-789" }] } as unknown as typeof base;
    expect(leakProblems(d)).toHaveLength(1);
  });

  test("allows the business number", () => {
    const d = { ...base, timeline: [{ detail: "BN 795920958 RT0001" }] } as unknown as typeof base;
    expect(leakProblems(d)).toHaveLength(0);
  });
});

describe("due dates on the to-do list", () => {
  test("a passed date reads as overdue", () => {
    expect(dueHtml("2026-10-07", "2026-10-01")).toContain("6 days overdue");
    expect(dueHtml("2026-10-07", "2026-10-06")).toContain("1 day overdue");
  });

  test("a future date counts down, and no date renders nothing", () => {
    expect(dueHtml("2026-10-07", "2026-11-16")).toContain("in 40 days");
    expect(dueHtml("2026-10-07", undefined)).toBe("");
  });
});
