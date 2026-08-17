import { describe, expect, test } from "bun:test";
import type { AccountSeries } from "../analytics/types";
import { projectYears } from "../projection/engine";
import { projectionInputs } from "../projection/inputs";
import { loadAnalytics } from "../ui/data";
import { accountValues, buildAllocations } from "./allocation";

const analytics = loadAnalytics();

describe("buildAllocations, shares against the real corpus", () => {
  test("shares are the group's recent contribution split", () => {
    const allocs = buildAllocations(analytics.series);
    const rrsp = allocs.filter((a) => a.group === "RRSP");
    expect(rrsp.map((a) => a.accountId).sort()).toEqual(["2318", "97ab", "d6d9"]);
    const d6d9 = rrsp.find((a) => a.accountId === "d6d9");
    expect(d6d9?.share).toBeCloseTo(0.4167, 4);
    expect(rrsp.reduce((t, a) => t + a.share, 0)).toBeCloseTo(1, 10);
  });

  test("a sole account in its group takes the whole group", () => {
    const allocs = buildAllocations(analytics.series);
    expect(allocs.find((a) => a.accountId === "e2ec")?.share).toBe(1);
    expect(allocs.find((a) => a.accountId === "e2ec")?.opening).toBeCloseTo(28295.25, 2);
  });

  test("every account's share and opening, pinned against the corpus", () => {
    const allocs = buildAllocations(analytics.series);
    const byId = new Map(allocs.map((a) => [a.accountId, a]));

    expect(byId.get("2318")?.group).toBe("RRSP");
    expect(byId.get("2318")?.share).toBeCloseTo(0.3, 4);
    expect(byId.get("2318")?.opening).toBeCloseTo(14509.7, 2);

    expect(byId.get("97ab")?.group).toBe("RRSP");
    expect(byId.get("97ab")?.share).toBeCloseTo(0.2833, 4);
    expect(byId.get("97ab")?.opening).toBeCloseTo(14306.21, 2);

    expect(byId.get("d6d9")?.opening).toBeCloseTo(20498.54, 2);

    expect(byId.get("9710")?.group).toBe("TFSA");
    expect(byId.get("9710")?.share).toBeCloseTo(0.1383, 4);
    expect(byId.get("9710")?.opening).toBeCloseTo(7580.33, 2);

    expect(byId.get("d77c")?.group).toBe("TFSA");
    expect(byId.get("d77c")?.share).toBeCloseTo(0.8617, 4);
    expect(byId.get("d77c")?.opening).toBeCloseTo(40574.95, 2);

    expect(byId.get("c2e9")?.group).toBe("RESP");
    expect(byId.get("c2e9")?.share).toBe(1);
    expect(byId.get("c2e9")?.opening).toBeCloseTo(3943.98, 2);

    expect(byId.get("91b8")?.group).toBe("Corporate");
    expect(byId.get("91b8")?.share).toBe(1);
    expect(byId.get("91b8")?.opening).toBeCloseTo(51232.39, 2);

    // Only the eight projected accounts get an allocation: the three
    // uncovered non-registered/crypto accounts (1f9a, 2c62, e2d6) hold real
    // money but no group the engine has a rule for.
    expect(allocs.map((a) => a.accountId).sort()).toEqual(
      ["2318", "91b8", "97ab", "9710", "c2e9", "d6d9", "d77c", "e2ec"].sort(),
    );
  });

  // The real corpus has no `inTotals: false` account of a covered kind --
  // its three excluded accounts (1f9a, 2c62, e2d6) are NonRegistered/Crypto,
  // which `groupOf` already turns away regardless of `inTotals`. A fixture is
  // the only way to prove `buildAllocations` still routes through
  // `projectedAccounts` (and so its `inTotals` filter) rather than `series`
  // directly, per the brief's Step 5 mutation.
  test("an excluded RRSP that fails inTotals is not allocated a share", () => {
    const realRrsp = analytics.series.find((a) => a.shortId === "2318");
    if (realRrsp === undefined) throw new Error("fixture base account 2318 missing from corpus");
    const excluded: AccountSeries = structuredClone(realRrsp);
    excluded.shortId = "fff0";
    excluded.inTotals = false;

    const withExcluded = [...analytics.series, excluded];
    const allocs = buildAllocations(withExcluded);
    expect(allocs.some((a) => a.accountId === "fff0")).toBe(false);

    const rrsp = allocs.filter((a) => a.group === "RRSP");
    expect(rrsp.reduce((t, a) => t + a.share, 0)).toBeCloseTo(1, 10);
  });
});

describe("accountValues, the per-account projection against the real engine", () => {
  test("allocated values sum to the engine total in every single year", () => {
    const inputs = projectionInputs(analytics, { returnRate: 0.06 });
    const rows = projectYears(inputs);
    const values = accountValues(rows, analytics.series, 0.06, inputs.fhsaCloseYear);
    rows.forEach((row, i) => {
      const summed = values.reduce((t, s) => t + (s.values[i] ?? 0), 0);
      expect(summed).toBeCloseTo(row.value, 6);
    });
    expect(rows[rows.length - 1]?.value).toBeCloseTo(7636455.38, 2);
  });

  test("the FHSA is emptied in its closure year, not merely stopped", () => {
    const inputs = projectionInputs(analytics, { returnRate: 0.06 });
    const rows = projectYears(inputs);
    const values = accountValues(rows, analytics.series, 0.06, inputs.fhsaCloseYear);
    const fhsa = values.find((s) => s.accountId === "e2ec");
    const at = (year: string) => fhsa?.values[rows.findIndex((r) => r.year === year)];
    expect(inputs.fhsaCloseYear).toBe("2039");
    expect(at("2028")).toBeCloseTo(50180.1, 2);
    expect(at("2039")).toBe(0);
  });

  test("a non-FHSA account keeps compounding past 2039, unaffected by the closure year", () => {
    const inputs = projectionInputs(analytics, { returnRate: 0.06 });
    const rows = projectYears(inputs);
    const values = accountValues(rows, analytics.series, 0.06, inputs.fhsaCloseYear);
    const corporate = values.find((s) => s.accountId === "91b8");
    const at = (year: string) => corporate?.values[rows.findIndex((r) => r.year === year)];
    const v2038 = at("2038") ?? 0;
    const v2039 = at("2039") ?? 0;
    expect(v2039).toBeGreaterThan(v2038);
  });
});
