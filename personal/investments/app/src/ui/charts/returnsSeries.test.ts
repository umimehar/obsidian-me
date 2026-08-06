import { describe, expect, test } from "bun:test";
import { loadAnalytics } from "../data";
import {
  type AccountReturns,
  type ReturnValuePoint,
  buildReturnsSeries,
  distinctGaps,
  gapPhrase,
  plottedCount,
  provenance,
  returnSegments,
  returnsPeriodExtent,
  returnsRateExtent,
  returnsTooltipLines,
} from "./returnsSeries";

/**
 * Every case here runs against the real committed corpus
 * (`data/analytics.json`). The corpus facts pinned below -- 14 accounts, 2 of
 * them stated, 21 stated points -- are the ones the view's provenance line
 * prints, so a corpus that gains a PERFORMANCE statement reddens these rather
 * than silently changing what the page claims.
 */
const analytics = loadAnalytics();
const accounts = buildReturnsSeries(analytics.returns, analytics.series);

function byShortId(shortId: string): AccountReturns {
  const found = accounts.find((a) => a.shortId === shortId);
  if (found === undefined) throw new Error(`expected an account ${shortId}`);
  return found;
}

function pointAt(shortId: string, period: string): ReturnValuePoint {
  const found = byShortId(shortId).points.find((p) => p.period === period);
  if (found === undefined) throw new Error(`expected ${shortId} to have a point at ${period}`);
  return found;
}

describe("buildReturnsSeries against the corpus", () => {
  test("carries one entry per account in analytics.returns", () => {
    expect(accounts).toHaveLength(14);
  });

  test("exactly 2 of the 14 accounts are stated, the other 12 derived", () => {
    expect(accounts.filter((a) => a.source === "stated").map((a) => a.shortId)).toEqual([
      "9710",
      "d6d9",
    ]);
    expect(accounts.filter((a) => a.source === "derived")).toHaveLength(12);
  });

  test("the corpus holds 21 stated points in total", () => {
    const stated = accounts.filter((a) => a.source === "stated").flatMap((a) => a.points);
    expect(stated).toHaveLength(21);
  });

  test("stated accounts sort ahead of derived ones, so the provenance claim lands first", () => {
    expect(accounts.slice(0, 2).map((a) => a.source)).toEqual(["stated", "stated"]);
    expect(accounts.slice(2).every((a) => a.source === "derived")).toBe(true);
  });

  test("carries each account's display label and shortId from the series", () => {
    expect(byShortId("9710").label).toBe("TFSA (managed)");
    expect(byShortId("d6d9").label).toBe("RRSP (managed)");
    expect(byShortId("d77c").label).toBe("TFSA (self-directed)");
  });

  test("carries inTotals, so a Chequing account's card can say it is excluded", () => {
    expect(byShortId("18a3").inTotals).toBe(false);
    expect(byShortId("d77c").inTotals).toBe(true);
  });
});

describe("a stated point plots its statement's current-period rate", () => {
  test("plots statedMwr.currentPeriod verbatim, to the statement's own precision", () => {
    // 2025-03 on the managed TFSA prints -1.54% for the month.
    expect(pointAt("9710", "2025-03").rate).toBe(-1.54);
    expect(pointAt("9710", "2026-02").rate).toBe(3.22);
    expect(pointAt("9710", "2026-03").rate).toBe(-4.01);
  });

  test("keeps the whole statedMwr block, so every horizon stays reachable", () => {
    const point = pointAt("9710", "2025-01");
    expect(point.statedMwr).toEqual({
      currentPeriod: 47.31,
      oneYear: 16.69,
      threeYears: null,
      fiveYears: null,
      tenYears: null,
      sinceInception: 13.41,
    });
  });

  test("a null currentPeriod is a gap, never a measured zero", () => {
    // The managed RRSP's first statement, 2025-11, prints no rate for the month.
    const point = pointAt("d6d9", "2025-11");
    expect(point.rate).toBeNull();
    expect(point.gap).toBe("no-stated-rate");
  });

  test("a stated point never carries a derived figure", () => {
    expect(byShortId("9710").points.every((p) => p.gap === null || p.rate === null)).toBe(true);
  });
});

describe("a derived point plots its computed period return", () => {
  test("plots periodReturn, and does not round it away from the raw figure", () => {
    const plotted = byShortId("d77c").points.filter((p) => p.rate !== null);
    const raw = analytics.returns
      .find((s) => s.maskedId === byShortId("d77c").maskedId)
      ?.points.filter((p) => p.periodReturn !== null)
      .map((p) => p.periodReturn);
    expect(plotted.map((p) => p.rate)).toEqual(raw ?? []);
  });

  test("a negative derived return stays negative", () => {
    const rates = accounts.flatMap((a) => a.points.map((p) => p.rate));
    expect(rates.some((r) => r !== null && r < 0)).toBe(true);
    expect(Math.min(...rates.filter((r): r is number => r !== null))).toBeCloseTo(
      -20.831744591570732,
      10,
    );
  });
});

describe("a null derived return keeps its reason and is never plotted as zero", () => {
  test("the first point of every derived account has no prior period", () => {
    const first = byShortId("d77c").points[0];
    expect(first?.period).toBe("2023-06");
    expect(first?.rate).toBeNull();
    expect(first?.gap).toBe("no-prior-period");
  });

  test("the corpus's three unreconciled-flow points carry that reason and no figure", () => {
    const unreconciled = accounts
      .flatMap((a) => a.points)
      .filter((p) => p.gap === "unreconciled-flow");
    expect(unreconciled).toHaveLength(3);
    expect(unreconciled.every((p) => p.rate === null)).toBe(true);
  });

  test("the corpus's null derived points split 12 / 5 / 3 by reason", () => {
    const gaps = accounts
      .filter((a) => a.source === "derived")
      .flatMap((a) => a.points)
      .filter((p) => p.rate === null)
      .map((p) => p.gap);
    expect(gaps.filter((g) => g === "no-prior-period")).toHaveLength(12);
    expect(gaps.filter((g) => g === "insufficient-data")).toHaveLength(5);
    expect(gaps.filter((g) => g === "unreconciled-flow")).toHaveLength(3);
    expect(gaps).toHaveLength(20);
  });

  test("no point carries both a rate and a gap", () => {
    const all = accounts.flatMap((a) => a.points);
    expect(all.every((p) => (p.rate === null) === (p.gap !== null))).toBe(true);
  });

  test("a plotted zero is a measured zero, never a coerced null", () => {
    // The corpus does hold real zeros: two Chequing accounts sat still for six
    // months between them, and 0.00% is the true answer there. Every one of
    // them carries no gap, and every gap carries no rate -- which is the
    // property that would break the moment a null were coerced to 0.
    const zeroes = accounts
      .flatMap((a) => a.points.map((p) => ({ shortId: a.shortId, point: p })))
      .filter((entry) => entry.point.rate === 0);
    expect(zeroes).toHaveLength(6);
    expect(zeroes.every((entry) => entry.point.gap === null)).toBe(true);
    expect([...new Set(zeroes.map((entry) => entry.shortId))].sort()).toEqual(["18a3", "8cd3"]);
  });
});

describe("plottedCount", () => {
  test("counts only the months that actually have a figure", () => {
    expect(plottedCount(byShortId("9710").points)).toBe(15);
    expect(plottedCount(byShortId("d6d9").points)).toBe(3);
    expect(plottedCount(byShortId("d77c").points)).toBe(34);
  });

  test("is zero for the single-statement Crypto account", () => {
    expect(byShortId("e2d6").points).toHaveLength(1);
    expect(plottedCount(byShortId("e2d6").points)).toBe(0);
  });
});

describe("returnSegments breaks the line rather than interpolating across a hole", () => {
  const point = (period: string, rate: number | null): ReturnValuePoint => ({
    period,
    rate,
    statedMwr: null,
    gap: rate === null ? "insufficient-data" : null,
  });

  test("a run of consecutive months with figures is one segment", () => {
    const segments = returnSegments([
      point("2025-01", 1),
      point("2025-02", 2),
      point("2025-03", 3),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(3);
  });

  test("a null in the middle splits the run in two, and is in neither", () => {
    const segments = returnSegments([
      point("2025-01", 1),
      point("2025-02", null),
      point("2025-03", 3),
    ]);
    expect(segments.map((s) => s.map((p) => p.period))).toEqual([["2025-01"], ["2025-03"]]);
  });

  test("a missing month splits the run too, so no line spans a period with no statement", () => {
    const segments = returnSegments([point("2025-01", 1), point("2025-04", 4)]);
    expect(segments.map((s) => s.map((p) => p.period))).toEqual([["2025-01"], ["2025-04"]]);
  });

  test("a December to January step is adjacent, not a hole", () => {
    const segments = returnSegments([point("2025-12", 1), point("2026-01", 2)]);
    expect(segments).toHaveLength(1);
  });

  test("no point with a null rate appears in any segment", () => {
    for (const account of accounts) {
      for (const segment of returnSegments(account.points)) {
        expect(segment.every((p) => p.rate !== null)).toBe(true);
      }
    }
  });

  test("the corpus's managed RRSP drops the three months its statements state no rate for", () => {
    // 2025-11, 2026-03 and 2026-04 print no current-period rate; the other three do.
    expect(returnSegments(byShortId("d6d9").points).map((s) => s.map((p) => p.period))).toEqual([
      ["2025-12", "2026-01", "2026-02"],
    ]);
  });
});

describe("returnsRateExtent and returnsPeriodExtent, the shared domains", () => {
  test("the rate extent spans the corpus's real minimum and maximum", () => {
    const extent = returnsRateExtent(accounts);
    expect(extent?.[0]).toBeCloseTo(-20.831744591570732, 10);
    expect(extent?.[1]).toBe(47.31);
  });

  test("the period extent spans every account's months, not one account's", () => {
    expect(returnsPeriodExtent(accounts)).toEqual(["2023-06", "2026-07"]);
  });

  test("both are null when nothing is plottable", () => {
    expect(returnsRateExtent([])).toBeNull();
    expect(returnsPeriodExtent([])).toBeNull();
  });
});

describe("provenance", () => {
  test("counts the corpus as 2 stated of 14", () => {
    expect(provenance(accounts)).toEqual({ stated: 2, derived: 12, total: 14 });
  });
});

describe("distinctGaps and gapPhrase", () => {
  test("names the single reason the Crypto account has no figure", () => {
    expect(distinctGaps(byShortId("e2d6").points)).toEqual(["no-prior-period"]);
  });

  test("does not repeat a reason that occurs twice", () => {
    expect(distinctGaps(byShortId("d6d9").points)).toEqual(["no-stated-rate"]);
  });

  test("every reason has words, and none of them is the word zero", () => {
    for (const gap of [
      "no-prior-period",
      "insufficient-data",
      "unreconciled-flow",
      "no-stated-rate",
    ] as const) {
      expect(gapPhrase(gap).length).toBeGreaterThan(10);
      expect(gapPhrase(gap)).not.toContain("zero");
    }
  });

  test("the unreconciled-flow phrase says money moved unseen, not that the return was nil", () => {
    expect(gapPhrase("unreconciled-flow")).toBe(
      "money moved in a way the cash records cannot confirm, so a return here would mislead",
    );
  });
});

describe("returnsTooltipLines", () => {
  test("a month with no statement states that, and prints no figure", () => {
    expect(returnsTooltipLines("2026-07", null, "derived")).toEqual([
      "Jul 2026",
      "No statement for this month",
    ]);
  });

  test("a derived month with a figure says it is derived and prints two decimals", () => {
    expect(returnsTooltipLines("2026-06", pointAt("d77c", "2026-06"), "derived")).toEqual([
      "Jun 2026",
      "Derived here, not stated on a statement",
      "This month 0.91%",
    ]);
  });

  test("a derived month without a figure prints the reason, not a zero", () => {
    const lines = returnsTooltipLines("2023-06", pointAt("d77c", "2023-06"), "derived");
    expect(lines).toEqual([
      "Jun 2023",
      "Derived here, not stated on a statement",
      "No figure: no earlier statement to compare against",
    ]);
    expect(lines.join(" ")).not.toContain("0.00%");
  });

  test("an unreconciled-flow month prints the reason it is missing", () => {
    const point = accounts.flatMap((a) => a.points).find((p) => p.gap === "unreconciled-flow");
    if (point === undefined) throw new Error("expected an unreconciled-flow point in the corpus");
    const lines = returnsTooltipLines(point.period, point, "derived");
    expect(lines[2]).toBe(
      "No figure: money moved in a way the cash records cannot confirm, so a return here would mislead",
    );
  });

  test("a stated month prints every horizon the statement states, to two decimals", () => {
    expect(returnsTooltipLines("2025-01", pointAt("9710", "2025-01"), "stated")).toEqual([
      "Jan 2025",
      "Stated on the statement",
      "This month 47.31%",
      "One year 16.69%",
      "Since inception 13.41%",
      "Not applicable at this account's age: three years, five years, ten years",
    ]);
  });

  test("a null horizon is named as not applicable, never printed as 0.00%", () => {
    const lines = returnsTooltipLines("2025-11", pointAt("d6d9", "2025-11"), "stated");
    expect(lines).toEqual([
      "Nov 2025",
      "Stated on the statement",
      "No rate stated for this month",
      "Since inception -4.68%",
      "Not applicable at this account's age: one year, three years, five years, ten years",
    ]);
    expect(lines.join(" ")).not.toContain("0.00%");
  });

  test("a negative stated rate keeps its sign", () => {
    const lines = returnsTooltipLines("2026-03", pointAt("9710", "2026-03"), "stated");
    expect(lines).toContain("This month -4.01%");
  });

  test("no tooltip line anywhere in the corpus prints a rate the point does not have", () => {
    for (const account of accounts) {
      for (const point of account.points) {
        const lines = returnsTooltipLines(point.period, point, account.source);
        if (point.rate === null) expect(lines.join(" ")).not.toContain("This month ");
      }
    }
  });
});
