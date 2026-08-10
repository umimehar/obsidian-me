import { describe, expect, test } from "bun:test";
import { loadAnalytics } from "../ui/data";
import { GOALS } from "./config";
import { resolveScope } from "./scope";

const analytics = loadAnalytics();

describe("resolveScope, the three scope kinds against the real corpus", () => {
  test("a purpose scope resolves to that purpose's counted accounts", () => {
    const c = resolveScope(analytics.series, { kind: "purpose", purpose: "house" });
    expect(c.covered.map((a) => a.shortId)).toEqual(["e2ec"]);
    expect(c.uncovered).toHaveLength(0);
  });

  test("a groups scope rolls up every kind in the group", () => {
    const c = resolveScope(analytics.series, { kind: "groups", groups: ["RRSP"] });
    expect(c.covered.map((a) => a.shortId).sort()).toEqual(["2318", "97ab", "d6d9"]);
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
  });
});

describe("resolveScope, the coverage split is the honest part", () => {
  test("a growth scope reports the three accounts the projection cannot forecast", () => {
    const c = resolveScope(analytics.series, { kind: "purpose", purpose: "growth" });
    expect(c.covered.map((a) => a.shortId).sort()).toEqual(["9710", "d77c"]);
    expect(c.uncovered.map((a) => a.shortId).sort()).toEqual(["1f9a", "2c62", "e2d6"]);
    expect(c.coveredValue).toBeLessThan(c.scopeValue);
  });

  test("a scope matching no projected account covers nothing rather than zero", () => {
    const c = resolveScope(analytics.series, { kind: "purpose", purpose: "spending" });
    expect(c.covered).toHaveLength(0);
    expect(c.coveredValue).toBe(0);
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
  });

  test("every goal states where its target came from", () => {
    for (const goal of GOALS) expect(goal.source.length).toBeGreaterThan(20);
  });
});
