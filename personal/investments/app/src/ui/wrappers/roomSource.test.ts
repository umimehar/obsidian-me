import { describe, expect, test } from "bun:test";
import type { AccountSeries, MonthPoint } from "../../analytics/types";
import type { AccountKind } from "../../store/mask";
import { loadAnalytics } from "../data";
import { contributionsSourceFor } from "./roomSource";

function month(
  period: string,
  contributions: number | null,
  source: "stated" | "derived" | null,
): MonthPoint {
  return {
    period,
    marketValue: null,
    bookCost: null,
    cashBalance: null,
    deposits: 0,
    withdrawals: 0,
    contributions,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: source,
    grants: 0,
  };
}

function account(maskedId: string, kind: AccountKind, months: MonthPoint[]): AccountSeries {
  return {
    maskedId,
    shortId: maskedId.slice(-4),
    label: `${kind} ${maskedId.slice(-4)}`,
    kind,
    style: "self-directed",
    purpose: "retirement",
    inTotals: true,
    months,
    contributionsByYear: {},
  };
}

describe("contributionsSourceFor", () => {
  test("the real 2026 RESP contribution is reconstructed, not printed", () => {
    expect(contributionsSourceFor(loadAnalytics().series, "RESP", 2026)).toBe("derived");
  });

  test("the real 2026 TFSA and RRSP contributions are printed figures", () => {
    const { series } = loadAnalytics();
    expect(contributionsSourceFor(series, "TFSA", 2026)).toBe("stated");
    expect(contributionsSourceFor(series, "RRSP", 2026)).toBe("stated");
  });

  test("a year with no contribution at all has no source to attribute", () => {
    // Real corpus: the RESP contributed nothing in 2025.
    expect(contributionsSourceFor(loadAnalytics().series, "RESP", 2025)).toBeNull();
  });

  test("one derived component makes the whole group figure derived", () => {
    const series = [
      account("acct_aaaa1111", "RRSP", [month("2026-01", 1000, "stated")]),
      account("acct_bbbb2222", "SpousalRRSP", [month("2026-02", 500, "derived")]),
    ];
    expect(contributionsSourceFor(series, "RRSP", 2026)).toBe("derived");
  });

  test("a month in another year never leaks into this year's source", () => {
    const series = [
      account("acct_cccc3333", "TFSA", [
        month("2025-06", 3000, "derived"),
        month("2026-06", 3000, "stated"),
      ]),
    ];
    expect(contributionsSourceFor(series, "TFSA", 2026)).toBe("stated");
    expect(contributionsSourceFor(series, "TFSA", 2025)).toBe("derived");
  });

  test("a year of zero contributions has no source, whatever those months were tagged", () => {
    // A zero is not a contribution, so there is no figure to mark derived --
    // marking one would put a "derived" badge on a $0.00 line.
    const stated = [account("acct_eeee5555", "TFSA", [month("2026-03", 0, "stated")])];
    const derived = [account("acct_ffff6666", "TFSA", [month("2026-03", 0, "derived")])];
    expect(contributionsSourceFor(stated, "TFSA", 2026)).toBeNull();
    expect(contributionsSourceFor(derived, "TFSA", 2026)).toBeNull();
  });

  test("an unstated month contributes no source of its own", () => {
    const series = [
      account("acct_dddd4444", "FHSA", [
        month("2026-01", null, null),
        month("2026-02", 8000, "stated"),
      ]),
    ];
    expect(contributionsSourceFor(series, "FHSA", 2026)).toBe("stated");
  });
});
