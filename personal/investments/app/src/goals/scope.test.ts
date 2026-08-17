import { describe, expect, test } from "bun:test";
import { projectYears } from "../projection/engine";
import { projectionInputs } from "../projection/inputs";
import { loadAnalytics } from "../ui/data";
import { GOALS } from "./config";
import { resolveScope } from "./scope";

const analytics = loadAnalytics();

describe("resolveScope, the three scope kinds against the real corpus", () => {
  test("a purpose scope resolves to that purpose's counted accounts", () => {
    const c = resolveScope(analytics.series, { kind: "purpose", purpose: "house" });
    expect(c.covered.map((a) => a.shortId)).toEqual(["e2ec"]);
    expect(c.uncovered).toHaveLength(0);
    expect(c.coveredValue).toBe(28295.25);
    expect(c.scopeValue).toBe(28295.25);
  });

  test("a groups scope rolls up every kind in the group", () => {
    const c = resolveScope(analytics.series, { kind: "groups", groups: ["RRSP"] });
    expect(c.covered.map((a) => a.shortId).sort()).toEqual(["2318", "97ab", "d6d9"]);
    expect(c.uncovered).toHaveLength(0);
  });

  test("a portfolio scope covers the eight projected accounts and names the rest", () => {
    const c = resolveScope(analytics.series, { kind: "portfolio" });
    expect(c.covered.map((a) => a.shortId).sort()).toEqual([
      "2318",
      "91b8",
      "9710",
      "97ab",
      "c2e9",
      "d6d9",
      "d77c",
      "e2ec",
    ]);
    expect(c.uncovered.map((a) => a.shortId).sort()).toEqual(["1f9a", "2c62", "e2d6"]);
    // Welds this figure to `analytics.rollups.registration`, the same fact
    // the rest of the dashboard reads (see `projection/inputs.ts`'s
    // `openingByGroup`), rather than letting it drift from a second,
    // independently maintained sum. Derived from the artifact, not a
    // literal, so a future corpus change moves both sides together.
    const rollupTotal = analytics.rollups.registration.reduce((sum, r) => sum + r.total, 0);
    expect(c.scopeValue).toBe(rollupTotal);
  });
});

describe("resolveScope, the coverage split is the honest part", () => {
  test("a growth scope reports the three accounts the projection cannot forecast", () => {
    const c = resolveScope(analytics.series, { kind: "purpose", purpose: "growth" });
    expect(c.covered.map((a) => a.shortId).sort()).toEqual(["9710", "d77c"]);
    expect(c.uncovered.map((a) => a.shortId).sort()).toEqual(["1f9a", "2c62", "e2d6"]);
    expect(c.coveredValue).toBe(48155.28);
    expect(c.scopeValue).toBe(108953.6);
    expect(c.coveredValue).toBeLessThan(c.scopeValue);
  });

  test("a scope matching no projected account covers nothing rather than zero", () => {
    const c = resolveScope(analytics.series, { kind: "purpose", purpose: "spending" });
    expect(c.covered).toHaveLength(0);
    expect(c.uncovered).toHaveLength(0);
    expect(c.coveredValue).toBe(0);
    expect(c.scopeValue).toBe(0);
  });
});

describe("GOALS, the shipped config", () => {
  test("the shipped goals are the two with statutory targets", () => {
    expect(GOALS.map((g) => g.id)).toEqual(["house", "education"]);
    const house = GOALS[0];
    expect(house?.target).toBe(40000);
    expect(house?.by).toBe("2028");
    expect(house?.scope).toEqual({ kind: "purpose", purpose: "house" });
    const education = GOALS[1];
    expect(education?.target).toBe(50000);
    expect(education?.by).toBe("2042");
    expect(education?.scope).toEqual({ kind: "purpose", purpose: "education" });
  });

  test("every goal states where its target came from", () => {
    for (const goal of GOALS) expect(goal.source.length).toBeGreaterThan(20);
  });

  test("the education goal's by year matches the projection engine's cesgLastYear", () => {
    const educationBy = GOALS[1]?.by;
    if (educationBy === undefined) throw new Error("GOALS is missing the education entry");
    expect(projectionInputs(analytics).cesgLastYear).toBe(educationBy);
  });

  test("the house goal's by year matches the first year FHSA room reaches zero", () => {
    const houseBy = GOALS[0]?.by;
    if (houseBy === undefined) throw new Error("GOALS is missing the house entry");
    const zero = projectYears(projectionInputs(analytics)).find((r) => r.roomRemaining.FHSA === 0);
    expect(zero?.year).toBe(houseBy);
  });
});
