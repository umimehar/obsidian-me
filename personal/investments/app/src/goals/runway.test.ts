import { describe, expect, test } from "bun:test";
import { projectYears } from "../projection/engine";
import { projectionInputs } from "../projection/inputs";
import { loadAnalytics } from "../ui/data";
import { buildRunway } from "./runway";

const analytics = loadAnalytics();
const inputs0 = projectionInputs(analytics, { returnRate: 0 });
const rows0 = projectYears(inputs0);
const inputs6 = projectionInputs(analytics, { returnRate: 0.06 });
const rows6 = projectYears(inputs6);
const inputs12 = projectionInputs(analytics, { returnRate: 0.12 });
const rows12 = projectYears(inputs12);
const inputs25 = projectionInputs(analytics, { returnRate: 0.25 });
const rows25 = projectYears(inputs25);

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
    // The prose must not contradict the number: a note claiming the cap was
    // reached, paired with a nonzero unclaimed figure, is a row that denies
    // its own finding to whoever reads the sentence instead of the number.
    expect(row?.note).toMatch(/ages out|forfeit/i);
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

describe("buildRunway, no row moves with the rate -- statutory or contribution-driven", () => {
  test("a higher rate does not move a statutory deadline", () => {
    const r12 = buildRunway(rows12, inputs12);
    expect(r12.find((x) => x.id === "fhsa-close")?.year).toBe("2039");
    expect(r12.find((x) => x.id === "rrsp-last")?.year).toBe("2068");
  });

  test("a higher rate does not move the CESG ages-out year either, since it is statutory too", () => {
    const r12 = buildRunway(rows12, inputs12);
    expect(r12.find((x) => x.id === "cesg")?.year).toBe("2042");
  });

  test("a higher rate does not move the contribution-driven caps either -- a lifetime cap is filled by contributions, never by growth", () => {
    const r12 = buildRunway(rows12, inputs12);
    expect(r12.find((x) => x.id === "fhsa-cap")?.year).toBe("2028");
    expect(r12.find((x) => x.id === "resp-cap")?.year).toBe("2044");
  });

  /**
   * The positive statement, not just two spot-checked ids: the whole
   * `buildRunway` output, every field, is identical at 0% and 25% -- the
   * full span the rate slider offers. This is the property `runway.ts`'s
   * own doc comment on `buildRunway` got backwards until 2026-08-19. It
   * passes today and it reddens the day an engine change ever makes room
   * tracking sensitive to the return rate.
   */
  test("the entire runway is byte-for-byte identical at 0% and at 25%", () => {
    expect(buildRunway(rows0, inputs0)).toEqual(buildRunway(rows25, inputs25));
  });
});

describe("buildRunway, unclaimed is pinned across every row", () => {
  test("every row but cesg carries a null unclaimed against the real corpus", () => {
    for (const row of buildRunway(rows6, inputs6)) {
      if (row.id === "cesg") continue;
      expect(row.unclaimed).toBeNull();
    }
  });

  test("the same holds at a higher rate", () => {
    for (const row of buildRunway(rows12, inputs12)) {
      if (row.id === "cesg") continue;
      expect(row.unclaimed).toBeNull();
    }
  });
});

// A cap that is never reached inside the projection is unreachable on the
// real corpus over its default 30-year window: the FHSA and RESP caps both
// fill well before year 30, regardless of rate -- the caps are filled by
// contributions, not by growth (see the describe above). A shorter window
// is what makes the never-reached branch reachable, not a different rate.
// It is not a fabricated fixture either -- projectYears(inputs) runs for
// real, over the real corpus, with a real ProjectionOverrides.years -- so
// this exercises the "never reached" branch of capBound with numbers the
// engine actually produced.
describe("buildRunway, the never-reached branch of a lifetime cap", () => {
  const shortInputs = projectionInputs(analytics, { returnRate: 0.06, years: 1 });
  const shortRows = projectYears(shortInputs);

  test("a projection window that ends before either cap fills reports null years and real leftover room", () => {
    const runway = buildRunway(shortRows, shortInputs);
    const fhsaCap = runway.find((r) => r.id === "fhsa-cap");
    const respCap = runway.find((r) => r.id === "resp-cap");
    expect(fhsaCap?.year).toBeNull();
    expect(fhsaCap?.unclaimed).toBeCloseTo(8000, 2);
    expect(respCap?.year).toBeNull();
    expect(respCap?.unclaimed).toBeCloseTo(42250, 2);
  });
});

// Parameterised over all four groups, not just FHSA: pinning only the FHSA
// case left `if (inScope(inputs, "TFSA"))` free to typo into
// `if (inScope(inputs, "RESP"))` with the suite still green, since nothing
// ever excluded TFSA to notice its row vanish or double up.
const GROUP_ROW_IDS: Record<string, readonly string[]> = {
  FHSA: ["fhsa-cap", "fhsa-close"],
  RESP: ["resp-cap", "cesg"],
  RRSP: ["rrsp-last"],
  TFSA: ["tfsa"],
};

describe("buildRunway, an excluded group is omitted, never fabricated", () => {
  for (const [group, ownRowIds] of Object.entries(GROUP_ROW_IDS)) {
    test(`excluding ${group} from inputs.groups drops exactly its own rows`, () => {
      const allGroups = inputs6.groups ?? [];
      expect(allGroups).toContain(group);
      const filtered = { ...inputs6, groups: allGroups.filter((g) => g !== group) };
      const filteredRows = projectYears(filtered);
      const runway = buildRunway(filteredRows, filtered);
      const ids = runway.map((r) => r.id);
      for (const ownId of ownRowIds) expect(ids).not.toContain(ownId);
      expect(ids).toHaveLength(6 - ownRowIds.length);
    });
  }

  // `inputs.groups === undefined` means "all four", per engine.ts's own
  // contract ("Omitted (undefined) means all four"). Flipping the `||` to
  // `&&` in `inScope` reads an omitted `groups` as excluding everything
  // instead, and nothing above catches it: inputs6 always carries a real
  // `groups` array, so this is the one test that exercises the branch the
  // corpus never takes.
  test("an omitted inputs.groups (undefined) reports all six rows, not zero", () => {
    const allGroupsOmitted = { ...inputs6, groups: undefined };
    const runway = buildRunway(rows6, allGroupsOmitted);
    expect(runway.map((r) => r.id)).toEqual([
      "fhsa-cap",
      "fhsa-close",
      "resp-cap",
      "cesg",
      "rrsp-last",
      "tfsa",
    ]);
  });
});

// projectionInputs (src/projection/inputs.ts) only ever returns "" for
// fhsaCloseYear when the corpus has no FHSA account, and the same absence
// also drops FHSA out of inputs.groups -- so on any real ProjectionInputs
// this function can be handed, fhsaCloseYear === "" and FHSA in inputs.groups
// cannot both be true, and the corpus cannot manufacture the combination.
// buildRunway's own contract does not assume that pairing, so this pins the
// guard directly against a hand-built ProjectionInputs.
describe("buildRunway, the fhsaCloseYear empty-string contract", () => {
  test("an empty fhsaCloseYear reports a null year rather than the literal empty string", () => {
    const inputsWithNoCloseYear = { ...inputs6, fhsaCloseYear: "" };
    const row = buildRunway(rows6, inputsWithNoCloseYear).find((r) => r.id === "fhsa-close");
    expect(row?.year).toBeNull();
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

  test("each row's wrapper, bound and note are the real pinned strings, not a mismatched label -- all six rows, not a subset", () => {
    const runway = buildRunway(rows6, inputs6);
    const byId = new Map(runway.map((r) => [r.id, r]));
    expect(byId.get("fhsa-cap")?.wrapper).toBe("FHSA");
    expect(byId.get("fhsa-close")?.wrapper).toBe("FHSA");
    expect(byId.get("resp-cap")?.wrapper).toBe("RESP");
    expect(byId.get("cesg")?.wrapper).toBe("RESP (CESG)");
    expect(byId.get("rrsp-last")?.wrapper).toBe("RRSP");
    expect(byId.get("tfsa")?.wrapper).toBe("TFSA");

    expect(byId.get("fhsa-cap")?.bound).toBe("$40,000 lifetime contribution cap");
    expect(byId.get("fhsa-close")?.bound).toBe(
      "must close 15 years after the first FHSA contribution",
    );
    expect(byId.get("resp-cap")?.bound).toBe("$50,000 lifetime contribution cap");
    expect(byId.get("cesg")?.bound).toBe("$7,200 lifetime CESG cap");
    expect(byId.get("rrsp-last")?.bound).toBe("last calendar year RRSP room accrues");
    expect(byId.get("tfsa")?.bound).toBe("no lifetime cap");

    expect(byId.get("fhsa-cap")?.note).toBe(
      "The FHSA lifetime contribution cap, reached by the money going in.",
    );
    expect(byId.get("fhsa-close")?.note).toBe(
      "A statutory deadline set by the account's first activity, not by the return rate.",
    );
    expect(byId.get("resp-cap")?.note).toBe(
      "The RESP lifetime contribution cap, reached by the money going in.",
    );
    expect(byId.get("cesg")?.note).toBe(
      "The beneficiary ages out before the CESG lifetime cap is reached, forfeiting the rest.",
    );
    expect(byId.get("rrsp-last")?.note).toBe(
      "The owner turns 71 in this year, a statutory cutoff that outruns the projection itself.",
    );
    expect(byId.get("tfsa")?.note).toBe(
      "The TFSA has no lifetime contribution cap, so there is no bound to reach.",
    );
  });
});
