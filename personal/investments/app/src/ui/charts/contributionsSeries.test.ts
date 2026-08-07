import { describe, expect, test } from "bun:test";
import { loadAnalytics } from "../data";
import {
  type ContributionYear,
  type WrapperContributions,
  buildContributionsSeries,
  contributionsMax,
  contributionsTooltipLines,
  yearBands,
} from "./contributionsSeries";

/**
 * Against the real committed corpus (`data/analytics.json`). Every figure
 * pinned here is one the chart prints, so a corpus change reddens these
 * rather than quietly changing what the page claims.
 */
const analytics = loadAnalytics();
const wrappers = buildContributionsSeries(analytics);

function wrapper(group: string): WrapperContributions {
  const found = wrappers.find((w) => w.group === group);
  if (found === undefined) throw new Error(`expected a ${group} wrapper`);
  return found;
}

function entry(group: string, year: number): ContributionYear {
  const found = wrapper(group).years.find((y) => y.year === year);
  if (found === undefined) throw new Error(`expected ${group} ${year}`);
  return found;
}

describe("the years and wrappers the corpus covers", () => {
  test("four years, 2023 to 2026, on every wrapper", () => {
    for (const w of wrappers) {
      expect(w.years.map((y) => y.year)).toEqual([2023, 2024, 2025, 2026]);
    }
  });

  test("the four registered wrappers, in the order rooms states them", () => {
    expect(wrappers.map((w) => w.group)).toEqual(["TFSA", "RRSP", "FHSA", "RESP"]);
  });
});

describe("2026 contributed, the figures the bars state", () => {
  test("RRSP 33,000, FHSA 8,000, TFSA 7,000, RESP 3,000", () => {
    expect(entry("RRSP", 2026).contributed).toBe(33000);
    expect(entry("FHSA", 2026).contributed).toBe(8000);
    expect(entry("TFSA", 2026).contributed).toBe(7000);
    expect(entry("RESP", 2026).contributed).toBe(3000);
  });

  test("the earlier years the corpus does cover", () => {
    expect(entry("TFSA", 2023).contributed).toBe(3388);
    expect(entry("TFSA", 2024).contributed).toBe(4058);
    expect(entry("TFSA", 2025).contributed).toBe(25000);
    expect(entry("RRSP", 2025).contributed).toBe(15000);
    expect(entry("FHSA", 2024).contributed).toBe(8000);
    expect(entry("FHSA", 2025).contributed).toBe(8000);
  });
});

/**
 * The rule that outranks every other one here: a wrapper with no statement
 * for a year has no bar, and a zero would be a claim the corpus does not
 * make. `rooms` reports `used: 0` for those years, since it sums a map with
 * no entry, and that zero is exactly what must not reach the chart.
 */
describe("a year with no statement is an absence, never a zero", () => {
  test("RESP has a figure only for 2026, the one year it has statements", () => {
    expect(wrapper("RESP").years.map((y) => y.contributed)).toEqual([null, null, null, 3000]);
  });

  test("RRSP's first statement is 2025-08, so 2023 and 2024 are null", () => {
    expect(entry("RRSP", 2023).contributed).toBeNull();
    expect(entry("RRSP", 2024).contributed).toBeNull();
  });

  test("FHSA's first statement is 2024-12, so only 2023 is null", () => {
    expect(entry("FHSA", 2023).contributed).toBeNull();
    expect(entry("FHSA", 2024).contributed).toBe(8000);
  });

  test("rooms itself reports those same years as a zero, which is what is being rejected", () => {
    const respRooms = analytics.rooms["2025"] ?? [];
    expect(respRooms.find((line) => line.group === "RESP")?.used).toBe(0);
    expect(entry("RESP", 2025).contributed).toBeNull();
  });

  test("an uncovered year carries no limit, no source and no notes either", () => {
    const uncovered = entry("RRSP", 2024);
    expect(uncovered.limit).toBeNull();
    expect(uncovered.assessed).toBe(false);
    expect(uncovered.remaining).toBeNull();
    expect(uncovered.source).toBeNull();
    expect(uncovered.unstatedMonths).toEqual([]);
    expect(uncovered.lumps).toEqual([]);
  });
});

describe("the limit, and the trap it is built around", () => {
  test("RESP has no annual limit in the one year it does have a figure", () => {
    const resp = entry("RESP", 2026);
    expect(resp.contributed).toBe(3000);
    expect(resp.limit).toBeNull();
    expect(resp.assessed).toBe(false);
    expect(resp.remaining).toBeNull();
  });

  test("no RESP year carries a limit at all, so nothing can fall back to another wrapper's", () => {
    expect(wrapper("RESP").years.every((y) => y.limit === null)).toBe(true);
  });

  test("RRSP 2025 and 2026 are the assessed years, the two the notice of assessment covers", () => {
    const assessed = wrappers.flatMap((w) =>
      w.years.filter((y) => y.assessed).map((y) => `${w.group} ${y.year}`),
    );
    expect(assessed).toEqual(["RRSP 2025", "RRSP 2026"]);
    expect(entry("RRSP", 2025).limit).toBe(60191);
    expect(entry("RRSP", 2025).remaining).toBe(45191);
    expect(entry("RRSP", 2026).limit).toBe(70752);
    expect(entry("RRSP", 2026).remaining).toBe(37752);
  });

  test("no assessed remaining is negative, on any wrapper or year", () => {
    for (const w of wrappers) {
      for (const y of w.years) {
        if (y.remaining === null) continue;
        expect(y.remaining).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("a generic annual maximum states no remaining, because carry-forward is invisible", () => {
    expect(entry("TFSA", 2025).limit).toBe(7000);
    expect(entry("TFSA", 2025).assessed).toBe(false);
    expect(entry("TFSA", 2025).remaining).toBeNull();
  });

  test("the 2025 TFSA is more than three times its generic maximum and carries no over flag", () => {
    const tfsa = entry("TFSA", 2025);
    expect(tfsa.contributed).toBe(25000);
    expect(tfsa.limit).toBe(7000);
    expect(Object.keys(tfsa)).not.toContain("over");
  });
});

describe("stated against derived", () => {
  test("the RESP's one figure is derived, the case that proves the rule", () => {
    expect(entry("RESP", 2026).source).toBe("derived");
  });

  test("2025's TFSA and RRSP are part-derived, since their last three months state nothing", () => {
    // Wealthsimple dropped the Contributions panel from 2025-10 through
    // 2026-01. Those months' figures come off activity rows, so the years
    // they land in are marked derived rather than presented as printed.
    const derived = wrappers.flatMap((w) =>
      w.years.filter((y) => y.source === "derived").map((y) => `${w.group} ${y.year}`),
    );
    expect(derived).toEqual(["TFSA 2025", "RRSP 2025", "RESP 2026"]);
  });

  test("TFSA, RRSP and FHSA state their figures on the statements", () => {
    expect(entry("TFSA", 2023).source).toBe("stated");
    expect(entry("RRSP", 2026).source).toBe("stated");
    expect(entry("FHSA", 2026).source).toBe("stated");
  });
});

describe("the months the statements say nothing about", () => {
  test("2025's unstated tail is no longer a hole: those months derive from activity instead", () => {
    // Trailing months with no stated figure and nothing later to close them
    // are derived rather than left null, so they carry a figure and no
    // longer count as unstated. That is where 2025's missing $1,000 was.
    expect(entry("RRSP", 2025).unstatedMonths).toEqual([]);
    expect(entry("TFSA", 2025).unstatedMonths).toEqual([]);
    expect(entry("FHSA", 2025).unstatedMonths).toEqual([]);
  });

  test("January 2026 is unstated across all three, and the RESP has no hole at all", () => {
    expect(entry("RRSP", 2026).unstatedMonths).toEqual(["2026-01"]);
    expect(entry("TFSA", 2026).unstatedMonths).toEqual(["2026-01"]);
    expect(entry("RESP", 2026).unstatedMonths).toEqual([]);
  });
});

describe("a multi-month lump is not this month's contribution", () => {
  test("RRSP 2025's 12,000 is stated at 2025-11 and spans eleven months", () => {
    expect(entry("RRSP", 2025).lumps).toEqual([
      { shortId: "d6d9", period: "2025-11", amount: 12000, monthsSpanned: 11 },
    ]);
  });

  test("the other 3,000 of RRSP 2025 spans one month at a time, so none of it is a lump", () => {
    expect(entry("RRSP", 2025).lumps.map((l) => l.shortId)).not.toContain("2318");
  });

  test("FHSA 2024's whole 8,000 arrives as one twelve-month lump", () => {
    expect(entry("FHSA", 2024).lumps).toEqual([
      { shortId: "e2ec", period: "2024-12", amount: 8000, monthsSpanned: 12 },
    ]);
  });

  test("a zero spanning several months is not reported as a lump", () => {
    expect(entry("TFSA", 2023).lumps).toEqual([]);
  });
});

describe("contributionsMax, the top of one card's own axis", () => {
  test("TFSA is topped by its 2025 contribution, not by its maximum", () => {
    expect(contributionsMax(wrapper("TFSA"))).toBe(25000);
  });

  test("RRSP is topped by its assessed 2026 limit, not by anything contributed", () => {
    expect(contributionsMax(wrapper("RRSP"))).toBe(70752);
  });

  test("RESP is topped by its own 3,000, since it has no limit to be topped by", () => {
    expect(contributionsMax(wrapper("RESP"))).toBe(3000);
  });

  test("a wrapper with nothing drawable has no axis at all", () => {
    expect(contributionsMax({ group: "TFSA", years: [] })).toBeNull();
  });
});

describe("yearBands", () => {
  test("splits the width evenly and centres each bar in its band", () => {
    const bands = yearBands([2023, 2024], 100);
    expect(bands.map((b) => b.year)).toEqual([2023, 2024]);
    expect(bands[0]?.center).toBe(25);
    expect(bands[1]?.center).toBe(75);
    expect(bands[0]?.width).toBe(30);
    expect(bands[0]?.x).toBe(10);
  });

  test("no years is no bands, rather than a division by zero", () => {
    expect(yearBands([], 100)).toEqual([]);
  });
});

describe("contributionsTooltipLines, the one source of every announced figure", () => {
  test("a year with no statement prints no figure at all", () => {
    expect(contributionsTooltipLines("RESP", entry("RESP", 2024))).toEqual([
      "2024",
      "No statement for this year",
    ]);
  });

  test("the RESP's derived 2026 states its source and its lack of a limit", () => {
    const lines = contributionsTooltipLines("RESP", entry("RESP", 2026));
    expect(lines).toContain("2026");
    expect(lines).toContain("Contributed $3,000.00");
    expect(lines).toContain("Derived here, not stated on a statement");
    expect(lines).toContain("No annual contribution limit");
    expect(lines.join(" ")).not.toContain("maximum");
  });

  test("an assessed year states the limit and the real remaining", () => {
    const lines = contributionsTooltipLines("RRSP", entry("RRSP", 2026));
    expect(lines).toContain("Contributed $33,000.00");
    expect(lines).toContain("Stated on the statements");
    expect(lines).toContain("$37,752.00 remaining of the $70,752.00 assessed limit");
  });

  test("a generic maximum states the carry-forward caveat and never an over-contribution", () => {
    const lines = contributionsTooltipLines("TFSA", entry("TFSA", 2025));
    expect(lines).toContain("Contributed $25,000.00");
    expect(lines).toContain("Against the $7,000.00 annual maximum");
    expect(lines).toContain(
      "Carry-forward not visible in statement data, so this is not an over-contribution",
    );
    expect(lines.join(" ")).not.toContain("remaining");
  });

  test("the unstated months are named, not counted away", () => {
    // 2026 is the year that still has one: 2026-01 states nothing and
    // 2026-02's stated year-to-date figure closes it, so it stays unstated.
    const lines = contributionsTooltipLines("RRSP", entry("RRSP", 2026));
    expect(lines).toContain("1 month states no contributions figure: Jan 2026");
  });

  test("a lump says how many months it covers and which month states it", () => {
    const lines = contributionsTooltipLines("RRSP", entry("RRSP", 2025));
    expect(lines).toContain("$12,000.00 stated at Nov 2025 covers 11 months, not that one month");
  });

  test("every figure carries cents, at the precision formatCurrency states", () => {
    const lines = contributionsTooltipLines("TFSA", entry("TFSA", 2023));
    expect(lines).toContain("Contributed $3,388.00");
    expect(lines).not.toContain("Contributed $3,388");
  });
});
