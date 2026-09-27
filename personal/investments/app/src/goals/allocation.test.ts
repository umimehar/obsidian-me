import { describe, expect, test } from "bun:test";
import type { AccountSeries } from "../analytics/types";
import { GOLDENS, accountGolden } from "../goldens";
import { projectYears } from "../projection/engine";
import { projectionInputs } from "../projection/inputs";
import { loadAnalytics } from "../ui/data";
import { accountValues, buildAllocations } from "./allocation";

const analytics = loadAnalytics();

describe("buildAllocations, shares against the real corpus", () => {
  test("a group's shares are its contribution split and sum to exactly one", () => {
    // The sum is the invariant and holds whatever the corpus is; the goldens
    // pin what the split actually IS, so a change to the split shows up as a
    // goldens diff rather than as a silently reweighted projection.
    const allocs = buildAllocations(analytics.series);
    const rrsp = allocs.filter((a) => a.group === "RRSP");
    // The spousal RRSP is deliberately absent: `projectedAccounts` filters on
    // `inTotals`, and the spousal asset is the spouse's. Its CONTRIBUTIONS
    // still consume the owner's room, which is a separate fact the rooms
    // module keeps -- see `EXCLUDED_KINDS` in registry.ts.
    expect(rrsp.map((a) => a.accountId).sort()).toEqual(["2318", "d6d9"]);
    expect(analytics.series.some((a) => a.kind === "SpousalRRSP")).toBe(true);
    expect(allocs.some((a) => a.accountId === "97ab")).toBe(false);
    for (const a of rrsp) {
      expect(a.share).toBeCloseTo(GOLDENS.allocations[a.accountId]?.share ?? -1, 10);
    }
    expect(rrsp.reduce((t, a) => t + a.share, 0)).toBeCloseTo(1, 10);
  });

  test("a sole account in its group takes the whole group", () => {
    const allocs = buildAllocations(analytics.series);
    expect(allocs.find((a) => a.accountId === "e2ec")?.share).toBe(1);
    expect(allocs.find((a) => a.accountId === "e2ec")?.opening).toBeCloseTo(
      accountGolden("e2ec"),
      2,
    );
  });

  test("every account's group, share and opening, against the goldens", () => {
    const allocs = buildAllocations(analytics.series);
    const byId = new Map(allocs.map((a) => [a.accountId, a]));

    for (const [accountId, golden] of Object.entries(GOLDENS.allocations)) {
      const alloc = byId.get(accountId);
      expect(alloc?.group).toBe(golden.group);
      expect(alloc?.share).toBeCloseTo(golden.share, 10);
      expect(alloc?.opening).toBeCloseTo(golden.opening, 2);
      // An allocation's opening is not a third stored figure: it is the
      // account's own latest stated market value, the one the overview
      // prints. Cross-checked here so the two can never drift apart.
      expect(alloc?.opening).toBeCloseTo(accountGolden(accountId), 2);
    }

    // Only the projected accounts get an allocation: the uncovered
    // non-registered and crypto accounts hold real money but no group the
    // engine has a rule for.
    expect(allocs.map((a) => a.accountId).sort()).toEqual(Object.keys(GOLDENS.allocations).sort());
  });

  // The engine's own opening for a group comes from `openingByGroup` in
  // `inputs.ts`, which reads `analytics.rollups.registration[].total` --
  // `groupTotal` in `rollup.ts`, summed over `inTotals: true` rows only. For
  // the sum invariant in the tests below to hold, `buildAllocations` has to
  // apply that same `inTotals` filter, which is exactly what routing through
  // `projectedAccounts` (rather than `series` directly) does. The real
  // corpus cannot exercise this: `inTotals` is a pure function of `kind`
  // (`registry.ts`'s `EXCLUDED_KINDS = ["Chequing"]`), so no real RRSP/TFSA/
  // FHSA/RESP/Corporate account is ever `inTotals: false`. A fixture is the
  // only way to write down the symmetry as an executable statement.
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
    expect(rows[rows.length - 1]?.value).toBeCloseTo(GOLDENS.projection.defaultRateEndValue, 2);
  });

  test("the FHSA is emptied in its closure year, not merely stopped", () => {
    const inputs = projectionInputs(analytics, { returnRate: 0.06 });
    const rows = projectYears(inputs);
    const values = accountValues(rows, analytics.series, 0.06, inputs.fhsaCloseYear);
    const fhsa = values.find((s) => s.accountId === "e2ec");
    const at = (year: string) => fhsa?.values[rows.findIndex((r) => r.year === year)];
    expect(inputs.fhsaCloseYear).toBe(GOLDENS.projection.fhsaCloseYear);
    expect(at(GOLDENS.projection.fhsaCapYear)).toBeCloseTo(
      GOLDENS.projection.fhsaValueAtCapYear,
      2,
    );
    expect(at(GOLDENS.projection.fhsaCloseYear)).toBe(0);
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
