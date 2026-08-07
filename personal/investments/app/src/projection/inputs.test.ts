import { describe, expect, test } from "bun:test";
import type { AnalyticsOutput } from "../analytics/build";
import type { AccountSeries, MonthPoint } from "../analytics/types";
import { loadAnalytics } from "../ui/data";
import { projectionInputs } from "./inputs";

const analytics = loadAnalytics();
const inputs = projectionInputs(analytics);

/**
 * A deep copy of the real payload, so a test can add a month to it without
 * the mutation leaking into the module-level `analytics` every other test
 * reads. `structuredClone` rather than a hand-written copy: the shape is
 * plain JSON and a partial copy would share the nested arrays.
 */
function clonedAnalytics(): AnalyticsOutput {
  return structuredClone(analytics);
}

function monthLike(source: MonthPoint, period: string): MonthPoint {
  return { ...source, period };
}

function countedAccount(analyticsCopy: AnalyticsOutput): AccountSeries {
  const account = analyticsCopy.series.find((a) => a.inTotals && a.months.length > 0);
  if (account === undefined) throw new Error("no counted account with months in the corpus");
  return account;
}

describe("projectionInputs, opening balances from the real corpus", () => {
  test("each group opens at its accounts' latest stated market value", () => {
    expect(inputs.opening.TFSA).toBeCloseTo(48155.28, 2);
    expect(inputs.opening.RRSP).toBeCloseTo(49314.45, 2);
    expect(inputs.opening.FHSA).toBeCloseTo(28295.25, 2);
    expect(inputs.opening.RESP).toBeCloseTo(3943.98, 2);
    expect(inputs.opening.Corporate).toBeCloseTo(51232.39, 2);
  });

  test("RRSP opens at the self-directed, managed and spousal accounts combined", () => {
    // 14,509.70 + 20,498.54 + 14,306.21. A spousal RRSP shares the
    // contributor's own room, so it shares the group.
    expect(inputs.opening.RRSP).toBeCloseTo(14509.7 + 20498.54 + 14306.21, 2);
  });

  test("the excluded Chequing accounts open nothing anywhere", () => {
    const total = Object.values(inputs.opening).reduce((sum, v) => sum + v, 0);
    // The five projected groups only: the corpus's non-registered
    // $60,798.32 is real money but carries no CRA room and no funding plan,
    // so the projection does not cover it.
    expect(total).toBeCloseTo(48155.28 + 49314.45 + 28295.25 + 3943.98 + 51232.39, 2);
  });
});

describe("projectionInputs, contributions from the real corpus", () => {
  test("this year's contributions come from the start year's room lines", () => {
    expect(inputs.contributedThisYear.TFSA).toBe(7000);
    expect(inputs.contributedThisYear.RRSP).toBe(33000);
    expect(inputs.contributedThisYear.FHSA).toBe(8000);
  });

  test("a corporation has no room, so nothing is already used against it", () => {
    expect(inputs.contributedThisYear.Corporate).toBe(0);
  });

  test("lifetime FHSA contributed is 24,000 against the 40,000 cap", () => {
    expect(inputs.lifetimeContributed.FHSA).toBe(24000);
  });

  test("CESG already received is 550", () => {
    expect(inputs.cesgReceived).toBe(550);
  });

  test("basic CESG room accrued is 1,000, two years at $500 from the 2025 birth year", () => {
    expect(inputs.cesgRoomAccrued).toBe(1000);
  });
});

/**
 * The trap this task exists to close. CRA counts every dollar a subscriber
 * puts into an RESP against the $50,000 lifetime cap, however it arrived.
 * The corpus's RESP states no contributions block on any of its six
 * statements, so its figure is reconstructed from activity: $2,550 of `CONT`
 * rows plus $450 of `DEP` rows. A figure built from tagged contributions
 * alone stops at $2,550.
 */
describe("projectionInputs, the RESP deposits-not-contributions trap", () => {
  test("lifetime RESP contributed is 3,000, the deposits figure", () => {
    expect(inputs.lifetimeContributed.RESP).toBe(3000);
  });

  test("this year's RESP contributions are 3,000, the deposits figure", () => {
    expect(inputs.contributedThisYear.RESP).toBe(3000);
  });

  test("the $450 that tagged contributions alone would miss is included", () => {
    // $2,550 is what the three CONT rows sum to; the two DEP rows carry the
    // rest. Understating money already in overstates room left, which is the
    // direction that gets someone over-contributed.
    expect((inputs.lifetimeContributed.RESP ?? 0) - 2550).toBe(450);
  });

  test("deposits are read, not tagged contributions, when the two differ", () => {
    const copy = clonedAnalytics();
    const resp = copy.series.find((a) => a.kind === "RESP");
    if (resp === undefined) throw new Error("no RESP account in the corpus");
    // Mirrors the real CONT/DEP split the corpus reconstructs into one
    // figure: tagged contributions say 2,550, deposits say 3,000. Only a
    // deposits-sourced figure survives this.
    resp.contributionsByYear = { "2026": 2550 };
    for (const line of copy.rooms["2026"] ?? []) {
      if (line.group === "RESP") {
        line.used = 2550;
        if (line.lifetimeContributions !== null) line.lifetimeContributions.contributed = 2550;
      }
    }
    const derived = projectionInputs(copy);
    expect(derived.lifetimeContributed.RESP).toBe(3000);
    expect(derived.contributedThisYear.RESP).toBe(3000);
  });

  test("a GRANT credit is government money and never counts as a contribution", () => {
    // $550 of CESG landed in the RESP over the same six months. It arrives
    // as an activity credit, not in the cash block's deposits, so 3,000
    // rather than 3,550 is the proof it stayed out.
    expect(inputs.lifetimeContributed.RESP).not.toBe(3000 + inputs.cesgReceived);
  });
});

describe("projectionInputs, RRSP room from the assessed line", () => {
  test("rrspAssessedRemaining is 37,752", () => {
    expect(inputs.rrspAssessedRemaining).toBe(37752);
  });

  test("it is the assessed figure less what is used, not the generic annual maximum", () => {
    // 70,752 assessed (2025 NOA: 45,191 carried forward plus 25,561 earned)
    // less 33,000 contributed. The generic 2026 maximum is 33,810, which
    // less the same 33,000 would report 810 -- and 33,810 taken raw would
    // report 33,810. Neither is 37,752.
    expect(inputs.rrspAssessedRemaining).toBe(70752 - 33000);
    expect(inputs.rrspAssessedRemaining).not.toBe(33810 - 33000);
    expect(inputs.rrspAssessedRemaining).not.toBe(33810);
  });

  test("with no assessed figure for the start year it is zero, never the generic maximum", () => {
    const copy = clonedAnalytics();
    for (const line of copy.rooms["2026"] ?? []) {
      if (line.group === "RRSP") {
        line.assessed = false;
        line.limit = 33810;
        line.remaining = null;
      }
    }
    // Unknown carry-forward is not a licence to invent some: the generic
    // maximum has none baked in, so using it would report room the notice of
    // assessment never granted.
    expect(projectionInputs(copy).rrspAssessedRemaining).toBe(0);
  });
});

describe("projectionInputs, room base seeds indexation from the published limit", () => {
  test("TFSA seeds at the 2026 published 7,000", () => {
    expect(inputs.roomBase.TFSA).toBe(7000);
  });

  test("RRSP seeds at the published 33,810, not the assessed 70,752", () => {
    // The assessed figure already contains carry-forward. Compounding it
    // forward would index the carry-forward as if it were the annual limit.
    expect(inputs.roomBase.RRSP).toBe(33810);
    expect(inputs.roomBase.RRSP).not.toBe(70752);
  });
});

describe("projectionInputs, dates derived from the data rather than the clock", () => {
  test("startYear is 2026, from the latest period a counted account reports", () => {
    expect(inputs.startYear).toBe("2026");
  });

  test("adding a later month to a counted account moves startYear", () => {
    // This is the self-updating property the whole task exists for: a new
    // statement lands, the projection's starting point moves, no code
    // changes. A hardcoded year or a `new Date()` fails here.
    const copy = clonedAnalytics();
    const account = countedAccount(copy);
    const last = account.months[account.months.length - 1];
    if (last === undefined) throw new Error("counted account has no months");
    account.months.push(monthLike(last, "2027-01"));
    expect(projectionInputs(copy).startYear).toBe("2027");
  });

  test("a month on an EXCLUDED account does not move startYear", () => {
    // The corpus's three Chequing accounts already run to 2026-07 while the
    // invested accounts stop at 2026-06. Reading every account would start
    // the projection from a period the counted accounts have no figures for.
    const copy = clonedAnalytics();
    const chequing = copy.series.find((a) => !a.inTotals && a.months.length > 0);
    if (chequing === undefined) throw new Error("no excluded account with months in the corpus");
    const last = chequing.months[chequing.months.length - 1];
    if (last === undefined) throw new Error("excluded account has no months");
    chequing.months.push(monthLike(last, "2031-01"));
    expect(projectionInputs(copy).startYear).toBe("2026");
  });

  test("fhsaCloseYear is 2039, fifteen years after the FHSA's first statement", () => {
    // First activity 2024-12.
    expect(inputs.fhsaCloseYear).toBe("2039");
  });

  test("cesgLastYear is 2042, the year the 2025 beneficiary turns 17", () => {
    expect(inputs.cesgLastYear).toBe("2042");
  });

  test("with no FHSA account the close year is empty, not a year invented from nothing", () => {
    const copy = clonedAnalytics();
    copy.series = copy.series.filter((a) => a.kind !== "FHSA");
    expect(projectionInputs(copy).fhsaCloseYear).toBe("");
  });
});

describe("projectionInputs, groups covered", () => {
  test("all five projected groups have a counted account in this corpus", () => {
    expect(inputs.groups).toEqual(["TFSA", "RRSP", "FHSA", "RESP", "Corporate"]);
  });

  test("a group with no counted account drops out rather than projecting from zero", () => {
    const copy = clonedAnalytics();
    copy.series = copy.series.filter((a) => a.kind !== "RESP");
    expect(projectionInputs(copy).groups).toEqual(["TFSA", "RRSP", "FHSA", "Corporate"]);
  });
});

describe("projectionInputs, rates and dials", () => {
  test("returnRate defaults to the rate fitted from the market-value history", () => {
    expect(inputs.returnRate).toBeCloseTo(0.2483925, 6);
  });

  test("an explicit returnRate wins over the fitted one", () => {
    expect(projectionInputs(analytics, { returnRate: 0.05 }).returnRate).toBe(0.05);
  });

  test("the owner-supplied defaults are carried through", () => {
    expect(inputs.years).toBe(30);
    expect(inputs.indexRate).toBe(0.02);
    expect(inputs.rrspLastYear).toBe("2068");
    expect(inputs.corporateAnnual).toBe(26000);
  });

  test("every dial can be overridden", () => {
    const custom = projectionInputs(analytics, {
      years: 10,
      indexRate: 0.03,
      rrspLastYear: "2050",
      corporateAnnual: 12000,
      respBeneficiaryBirthYear: 2020,
    });
    expect(custom.years).toBe(10);
    expect(custom.indexRate).toBe(0.03);
    expect(custom.rrspLastYear).toBe("2050");
    expect(custom.corporateAnnual).toBe(12000);
    expect(custom.cesgLastYear).toBe("2037");
    expect(custom.cesgRoomAccrued).toBe(3500);
  });
});

describe("projectionInputs, CRA rules", () => {
  test("the statutory flats are the published figures", () => {
    expect(inputs.rules.fhsaAnnual).toBe(8000);
    expect(inputs.rules.fhsaLifetime).toBe(40000);
    expect(inputs.rules.respLifetime).toBe(50000);
    expect(inputs.rules.cesgLifetime).toBe(7200);
    expect(inputs.rules.cesgRate).toBe(0.2);
    expect(inputs.rules.cesgAnnualBasic).toBe(500);
    expect(inputs.rules.cesgAnnualMax).toBe(1000);
    expect(inputs.rules.respGrantTarget).toBe(2500);
    expect(inputs.rules.respCatchupTarget).toBe(5000);
  });

  test("the publication rounding units are 500 for TFSA and 10 for RRSP", () => {
    expect(inputs.rules.tfsaRounding).toBe(500);
    expect(inputs.rules.rrspRounding).toBe(10);
  });
});

describe("projectionInputs, empty corpus", () => {
  test("an empty series produces a start year of empty string and zeroes throughout", () => {
    const copy = clonedAnalytics();
    copy.series = [];
    copy.rollups = { registration: [], account: [], purpose: [] };
    const empty = projectionInputs(copy);
    expect(empty.startYear).toBe("");
    expect(empty.opening.TFSA).toBe(0);
    expect(empty.rrspAssessedRemaining).toBe(0);
    expect(empty.roomBase.RRSP).toBe(0);
    expect(empty.groups).toEqual([]);
    expect(Number.isFinite(empty.returnRate)).toBe(true);
    // Not a large negative figure from subtracting a birth year from no year.
    expect(empty.cesgRoomAccrued).toBe(0);
  });
});
