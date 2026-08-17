import { describe, expect, test } from "bun:test";
import { projectYears } from "../projection/engine";
import { projectionInputs } from "../projection/inputs";
import { loadAnalytics } from "../ui/data";
import { buildRunway } from "./runway";

const analytics = loadAnalytics();
const inputs6 = projectionInputs(analytics, { returnRate: 0.06 });
const rows6 = projectYears(inputs6);
const inputs12 = projectionInputs(analytics, { returnRate: 0.12 });
const rows12 = projectYears(inputs12);

describe("buildRunway, the cap and deadline years against the real corpus", () => {
  test("the FHSA fills its lifetime cap in 2028 and closes in 2039", () => {
    const runway = buildRunway(rows6, inputs6);
    expect(runway.find((r) => r.id === "fhsa-cap")?.year).toBe("2028");
    expect(runway.find((r) => r.id === "fhsa-close")?.year).toBe("2039");
  });

  test("the RESP fills its 50,000 cap in 2044", () => {
    expect(buildRunway(rows6, inputs6).find((r) => r.id === "resp-cap")?.year).toBe("2044");
  });

  test("the RRSP accrues room through 2068, beyond the projection's final 2056 row", () => {
    const last = rows6.at(-1);
    expect(last?.year).toBe("2056");
    expect(buildRunway(rows6, inputs6).find((r) => r.id === "rrsp-last")?.year).toBe("2068");
  });
});

describe("buildRunway, the CESG finding", () => {
  test("the CESG stops 550 short of its 7,200 cap because the beneficiary ages out in 2042", () => {
    const row = buildRunway(rows6, inputs6).find((r) => r.id === "cesg");
    expect(row?.year).toBe("2042");
    expect(row?.unclaimed).toBeCloseTo(550, 2);
  });

  test("the final row's cumulativeGrant is 6,650, which is where the 550 comes from", () => {
    const last = rows6.at(-1);
    expect(last?.cumulativeGrant).toBeCloseTo(6650, 2);
    expect(inputs6.rules.cesgLifetime).toBe(7200);
  });
});

describe("buildRunway, the TFSA row", () => {
  test("the TFSA is present and states that it has no lifetime cap", () => {
    const row = buildRunway(rows6, inputs6).find((r) => r.id === "tfsa");
    expect(row).toBeDefined();
    expect(row?.year).toBeNull();
    expect(row?.unclaimed).toBeNull();
    expect(row?.bound).toMatch(/no lifetime cap/i);
  });
});

describe("buildRunway, structural derivation only", () => {
  test("rewording the engine's notes cannot move a single runway year", () => {
    const reworded = rows6.map((r) => ({ ...r, notes: r.notes.map(() => "lorem ipsum") }));
    expect(buildRunway(reworded, inputs6)).toEqual(buildRunway(rows6, inputs6));
  });

  test("emptying the engine's notes entirely cannot move a single runway year", () => {
    const stripped = rows6.map((r) => ({ ...r, notes: [] }));
    expect(buildRunway(stripped, inputs6)).toEqual(buildRunway(rows6, inputs6));
  });
});

describe("buildRunway, statutory deadlines are pinned against the rate", () => {
  test("a higher rate does not move a statutory deadline", () => {
    const r12 = buildRunway(rows12, inputs12);
    expect(r12.find((x) => x.id === "fhsa-close")?.year).toBe("2039");
    expect(r12.find((x) => x.id === "rrsp-last")?.year).toBe("2068");
  });

  test("a higher rate does not move the CESG ages-out year either, since it is statutory too", () => {
    const r12 = buildRunway(rows12, inputs12);
    expect(r12.find((x) => x.id === "cesg")?.year).toBe("2042");
  });
});

describe("buildRunway, row completeness", () => {
  test("every row carries a non-empty id, wrapper, bound and note", () => {
    for (const row of buildRunway(rows6, inputs6)) {
      expect(row.id.length).toBeGreaterThan(0);
      expect(row.wrapper.length).toBeGreaterThan(0);
      expect(row.bound.length).toBeGreaterThan(0);
      expect(row.note.length).toBeGreaterThan(0);
    }
  });

  test("six rows, one per wrapper concern: fhsa-cap, fhsa-close, resp-cap, cesg, rrsp-last, tfsa", () => {
    const ids = buildRunway(rows6, inputs6).map((r) => r.id);
    expect(ids).toEqual(["fhsa-cap", "fhsa-close", "resp-cap", "cesg", "rrsp-last", "tfsa"]);
  });
});
