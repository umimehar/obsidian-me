import { describe, expect, test } from "bun:test";
import fixture from "./__fixtures__/projection-reference.json";
import type { ProjectionInputs, ProjectionYear, RegisteredRules } from "./projection";
import { projectYears } from "./projection";

const RULES: RegisteredRules = {
  fhsaAnnual: 8000,
  fhsaLifetime: 40000,
  respLifetime: 50000,
  respGrantTarget: 2500,
  respCatchupTarget: 5000,
  cesgRate: 0.2,
  cesgAnnualBasic: 500,
  cesgAnnualMax: 1000,
  cesgLifetime: 7200,
  tfsaRounding: 500,
  rrspRounding: 10,
};

// Matches the fixture header in the spec exactly.
const FIXTURE_INPUTS: ProjectionInputs = {
  startYear: "2026",
  years: 30,
  returnRate: 0.08,
  indexRate: 0.02,
  opening: { TFSA: 50338, FHSA: 30619, RRSP: 54936, RESP: 3569 },
  contributedThisYear: { TFSA: 7000, FHSA: 8000, RRSP: 33000, RESP: 3000 },
  lifetimeContributed: { FHSA: 24000, RESP: 3000 },
  cesgReceived: 550,
  cesgRoomAccrued: 1000,
  rrspAssessedRemaining: 37752,
  fhsaCloseYear: "2039",
  rrspLastYear: "2068",
  cesgLastYear: "2042",
  roomBase: { TFSA: 7000, RRSP: 33810 },
  rules: RULES,
};

function baseInputs(overrides: Partial<ProjectionInputs> = {}): ProjectionInputs {
  return { ...FIXTURE_INPUTS, ...overrides };
}

function closeTo(a: number, b: number, precision = 2): void {
  expect(a).toBeCloseTo(b, precision);
}

function assertRowMatchesFixture(row: ProjectionYear, expected: (typeof fixture)[number]): void {
  expect(row.year).toBe(expected.year);
  closeTo(row.contributions.TFSA ?? 0, expected.contributions.TFSA);
  closeTo(row.contributions.FHSA ?? 0, expected.contributions.FHSA);
  closeTo(row.contributions.RRSP ?? 0, expected.contributions.RRSP);
  closeTo(row.contributions.RESP ?? 0, expected.contributions.RESP);
  closeTo(row.grant, expected.grant);
  closeTo(row.cumulativeIn, expected.cumulativeIn);
  closeTo(row.cumulativeGrant, expected.cumulativeGrant);
  closeTo(row.withdrawn, expected.withdrawn);
  closeTo(row.value, expected.value);
  expect(row.notes).toEqual(expected.notes);
}

describe("projectYears — committed fixture regression", () => {
  const rows = projectYears(FIXTURE_INPUTS);

  test("reproduces all 31 rows of the committed reference fixture", () => {
    expect(rows).toHaveLength(31);
    expect(fixture).toHaveLength(31);
    for (let i = 0; i < fixture.length; i++) {
      const expected = fixture[i];
      const row = rows[i];
      if (!expected || !row) throw new Error(`missing row ${i}`);
      assertRowMatchesFixture(row, expected);
    }
  });
});

describe("projectYears — row count", () => {
  test("years: 30 yields 31 rows", () => {
    expect(projectYears(baseInputs({ years: 30 }))).toHaveLength(31);
  });

  test("years: 0 yields 1 row, never an empty array", () => {
    const rows = projectYears(baseInputs({ years: 0 }));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.year).toBe("2026");
  });
});

describe("projectYears — TFSA indexation trap", () => {
  test("compounds an unrounded base, stepping 7000 -> 7500 -> 8000 -> 8500", () => {
    const rows = projectYears(baseInputs({ years: 6 }));
    const tfsaByYear = new Map(rows.map((r) => [r.year, r.contributions.TFSA]));
    expect(tfsaByYear.get("2026")).toBeCloseTo(0, 2); // year one tops up, already maxed
    expect(tfsaByYear.get("2027")).toBeCloseTo(7000, 2);
    expect(tfsaByYear.get("2028")).toBeCloseTo(7500, 2);
    expect(tfsaByYear.get("2032")).toBeCloseTo(8000, 2);
  });

  test("does NOT pin at 7000 forever (the rounded-base bug)", () => {
    const rows = projectYears(baseInputs({ years: 10 }));
    const values = new Set(rows.slice(1).map((r) => r.contributions.TFSA));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("projectYears — year one tops up from contributedThisYear", () => {
  test("does not contribute a full limit in year one when room remains", () => {
    const inputs = baseInputs({
      contributedThisYear: { TFSA: 1000, FHSA: 8000, RRSP: 33000, RESP: 3000 },
      roomBase: { TFSA: 7000, RRSP: 33810 },
    });
    const rows = projectYears(inputs);
    // TFSA granted(2026) rounds to 7000; contributedThisYear 1000 -> top-up 6000.
    expect(rows[0]?.contributions.TFSA).toBeCloseTo(6000, 2);
  });

  test("floors the top-up at zero rather than going negative", () => {
    const inputs = baseInputs({
      contributedThisYear: { TFSA: 9000, FHSA: 8000, RRSP: 33000, RESP: 3000 },
      roomBase: { TFSA: 7000, RRSP: 33810 },
    });
    const rows = projectYears(inputs);
    expect(rows[0]?.contributions.TFSA).toBe(0);
  });
});

describe("projectYears — FHSA never indexes", () => {
  test("stays flat at the statutory annual figure at any index rate", () => {
    const rows = projectYears(baseInputs({ indexRate: 0.5, years: 2 }));
    // Year one already maxed for the year (contributedThisYear.FHSA = 8000), so 0.
    // Year two is a fresh 8000/yr, untouched by the huge index rate.
    expect(rows[1]?.contributions.FHSA).toBe(8000);
  });
});

describe("projectYears — FHSA lifetime cap and closure", () => {
  test("caps lifetime contributions at exactly 40000", () => {
    const rows = projectYears(baseInputs({ years: 30 }));
    const totalFhsa = rows.reduce((sum, r) => sum + (r.contributions.FHSA ?? 0), 0);
    closeTo(totalFhsa + 24000, 40000, 6);
  });

  test("zeroes the balance at closure, records withdrawn, and never reappears", () => {
    const rows = projectYears(baseInputs({ years: 30 }));
    const closeRow = rows.find((r) => r.year === "2039");
    expect(closeRow?.withdrawn).toBeGreaterThan(0);
    expect(closeRow?.notes).toContain("FHSA closed, withdrawn for home");
    const after = rows.filter((r) => Number(r.year) > 2039);
    for (const row of after) {
      expect(row.withdrawn).toBe(0);
      expect(row.contributions.FHSA).toBe(0);
    }
  });

  test("closing before the cap is reached still zeroes contributions from the closure year", () => {
    const inputs = baseInputs({
      fhsaCloseYear: "2027", // closes the year after start, cap never reached
      years: 4,
    });
    const rows = projectYears(inputs);
    const closeRow = rows.find((r) => r.year === "2027");
    expect(closeRow?.contributions.FHSA).toBe(0);
    expect(closeRow?.withdrawn).toBeGreaterThan(0);
    const laterRow = rows.find((r) => r.year === "2028");
    expect(laterRow?.contributions.FHSA).toBe(0);
    expect(laterRow?.withdrawn).toBe(0);
  });
});

describe("projectYears — RRSP", () => {
  test("year one uses the assessed remainder, not the granted room", () => {
    const rows = projectYears(baseInputs({ years: 1 }));
    expect(rows[0]?.contributions.RRSP).toBe(37752);
  });

  test("zeroes past rrspLastYear", () => {
    const inputs = baseInputs({ rrspLastYear: "2027", years: 3 });
    const rows = projectYears(inputs);
    const y2028 = rows.find((r) => r.year === "2028");
    const y2029 = rows.find((r) => r.year === "2029");
    expect(y2028?.contributions.RRSP).toBe(0);
    expect(y2029?.contributions.RRSP).toBe(0);
  });
});

describe("projectYears — RESP target is derived, not a hardcoded rate", () => {
  test("claims all available grant in year one (2026: 1000 - 550 = 450 claimable)", () => {
    const rows = projectYears(baseInputs({ years: 0 }));
    // claimable 450 / 20% = 2250, floored at the 2500 base minus contributedThisYear
    // (2500 - 3000 = -500), so target = max(2250, -500) = 2250.
    expect(rows[0]?.contributions.RESP).toBeCloseTo(2250, 2);
    expect(rows[0]?.grant).toBeCloseTo(450, 2);
  });

  test("never drops below the 2500 base once grant room is exhausted", () => {
    const inputs = baseInputs({ cesgLastYear: "2026", years: 3 });
    const rows = projectYears(inputs);
    const y2027 = rows.find((r) => r.year === "2027");
    expect(y2027?.contributions.RESP).toBeCloseTo(2500, 2);
    expect(y2027?.grant).toBe(0);
  });

  test("never exceeds the 5000 ceiling", () => {
    const inputs = baseInputs({
      cesgReceived: 0,
      cesgRoomAccrued: 20000,
      contributedThisYear: { TFSA: 7000, FHSA: 8000, RRSP: 33000, RESP: 0 },
      years: 0,
    });
    const rows = projectYears(inputs);
    expect(rows[0]?.contributions.RESP).toBeLessThanOrEqual(5000);
  });

  test("stops at the lifetime cap, including a partial final year", () => {
    const inputs = baseInputs({
      lifetimeContributed: { FHSA: 24000, RESP: 49000 },
      years: 1,
    });
    const rows = projectYears(inputs);
    const total = rows.reduce((sum, r) => sum + (r.contributions.RESP ?? 0), 0);
    expect(total).toBeLessThanOrEqual(1000);
  });
});

describe("projectYears — CESG", () => {
  test("never exceeds 20% of the RESP contribution", () => {
    const rows = projectYears(baseInputs({ years: 30 }));
    for (const row of rows) {
      expect(row.grant).toBeLessThanOrEqual((row.contributions.RESP ?? 0) * 0.2 + 1e-6);
    }
  });

  test("zero after cesgLastYear", () => {
    const inputs = baseInputs({ cesgLastYear: "2026", years: 2 });
    const rows = projectYears(inputs);
    expect(rows.find((r) => r.year === "2027")?.grant).toBe(0);
    expect(rows.find((r) => r.year === "2028")?.grant).toBe(0);
  });
});

describe("projectYears — cumulativeIn excludes the grant", () => {
  test("cumulativeIn tracks contributions only; cumulativeGrant is separate", () => {
    const rows = projectYears(baseInputs({ years: 1 }));
    const y1 = rows[0];
    const y2 = rows[1];
    if (!y1 || !y2) throw new Error("missing rows");
    const y1In =
      (y1.contributions.TFSA ?? 0) +
      (y1.contributions.FHSA ?? 0) +
      (y1.contributions.RRSP ?? 0) +
      (y1.contributions.RESP ?? 0);
    closeTo(y1.cumulativeIn, y1In);
    closeTo(y1.cumulativeGrant, y1.grant);
    const y2In =
      y1In +
      (y2.contributions.TFSA ?? 0) +
      (y2.contributions.FHSA ?? 0) +
      (y2.contributions.RRSP ?? 0) +
      (y2.contributions.RESP ?? 0);
    closeTo(y2.cumulativeIn, y2In);
    closeTo(y2.cumulativeGrant, y1.grant + y2.grant);
  });
});

describe("projectYears — roomRemaining", () => {
  test("TFSA room remaining reads 0 in the start year when fully maxed", () => {
    const rows = projectYears(baseInputs({ years: 0 }));
    expect(rows[0]?.roomRemaining.TFSA).toBe(0);
  });

  test("is never negative even with an over-contribution", () => {
    const inputs = baseInputs({
      contributedThisYear: { TFSA: 50000, FHSA: 8000, RRSP: 33000, RESP: 3000 },
      years: 0,
    });
    const rows = projectYears(inputs);
    for (const value of Object.values(rows[0]?.roomRemaining ?? {})) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("projectYears — statutory invariants over the full fixture window", () => {
  const rows = projectYears(FIXTURE_INPUTS);
  const sum = (key: keyof ProjectionYear["contributions"]): number =>
    rows.reduce((total, r) => total + (r.contributions[key] ?? 0), 0);
  const totalGrant = rows.reduce((total, r) => total + r.grant, 0);

  test("projected FHSA contributions plus 24000 equal exactly 40000", () => {
    closeTo(sum("FHSA") + 24000, 40000, 6);
  });

  test("projected RESP contributions plus 3000 equal exactly 50000", () => {
    closeTo(sum("RESP") + 3000, 50000, 6);
  });

  test("projected grant plus 550 equals exactly 7200", () => {
    closeTo(totalGrant + 550, 7200, 6);
  });
});

describe("projectYears — zero return rate", () => {
  test("value equals opening plus cumulative contributions plus grants minus withdrawals", () => {
    const inputs = baseInputs({ returnRate: 0, years: 3, fhsaCloseYear: "2099" });
    const rows = projectYears(inputs);
    const last = rows[rows.length - 1];
    if (!last) throw new Error("missing row");
    const openingTotal =
      (inputs.opening.TFSA ?? 0) +
      (inputs.opening.FHSA ?? 0) +
      (inputs.opening.RRSP ?? 0) +
      (inputs.opening.RESP ?? 0);
    const totalWithdrawn = rows.reduce((total, r) => total + r.withdrawn, 0);
    closeTo(last.value, openingTotal + last.cumulativeIn + last.cumulativeGrant - totalWithdrawn);
  });
});

describe("projectYears — zero index rate", () => {
  test("holds every indexed limit flat", () => {
    const inputs = baseInputs({ indexRate: 0, years: 4 });
    const rows = projectYears(inputs);
    const tfsaFrom2027 = rows.filter((r) => Number(r.year) > 2026).map((r) => r.contributions.TFSA);
    const uniqueTfsa = new Set(tfsaFrom2027);
    expect(uniqueTfsa.size).toBe(1);
    expect([...uniqueTfsa][0]).toBeCloseTo(7000, 2);
  });
});

describe("projectYears — money carried unrounded year to year", () => {
  test("value is not rounded between years, so it can carry sub-dollar precision", () => {
    const rows = projectYears(baseInputs({ years: 2 }));
    const hasFraction = rows.some((r) => Math.abs(r.value - Math.round(r.value)) > 1e-6);
    expect(hasFraction).toBe(true);
  });
});

// The start-year annual cap and the accrued grant room are both bounds on the
// grant, and in the reference inputs they coincide at $450 — so dropping either
// one leaves every other test passing. This case separates them: accrued room
// ($2,000, several catch-up years) is deliberately far above the annual cap, so
// only `cesgAnnualMax - cesgReceived` can produce the right answer.
describe("projectYears — start-year CESG annual cap", () => {
  const diverged = baseInputs({
    years: 0,
    cesgReceived: 300,
    cesgRoomAccrued: 2300,
    contributedThisYear: { TFSA: 7000, FHSA: 8000, RRSP: 33000, RESP: 0 },
    lifetimeContributed: { FHSA: 24000, RESP: 0 },
  });

  test("subtracts grant already received this year from the annual maximum", () => {
    const row = projectYears(diverged)[0];
    // Claimable is 1000 - 300 = 700, NOT the full 1000 and NOT the 2000 of room.
    expect(row?.grant).toBeCloseTo(700, 2);
    // And it contributed exactly what claims that: 700 / 0.2.
    expect(row?.contributions.RESP ?? 0).toBeCloseTo(3500, 2);
  });

  test("a fully-claimed start year grants nothing further", () => {
    const row = projectYears(baseInputs({ ...diverged, cesgReceived: 1000 }))[0];
    expect(row?.grant).toBeCloseTo(0, 2);
  });

  test("the annual cap never binds outside the start year", () => {
    const rows = projectYears(baseInputs({ ...diverged, years: 1 }));
    // Year two has 1,600 of room left and a fresh 1,000 cap, so it claims 1,000.
    expect(rows[1]?.grant).toBeCloseTo(1000, 2);
  });
});
