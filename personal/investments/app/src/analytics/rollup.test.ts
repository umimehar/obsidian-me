import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { type Lens, type Rollup, rollup } from "./rollup";
import type { AccountSeries, MonthPoint } from "./types";

function month(period: string, marketValue: number | null): MonthPoint {
  return {
    period,
    marketValue,
    bookCost: null,
    cashBalance: null,
    deposits: 0,
    withdrawals: 0,
    contributions: null,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: null,
    grants: 0,
  };
}

function series(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "TFSA 0001",
    kind: "TFSA",
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned" as Purpose,
    inTotals: true,
    months: [month("2026-06", 1000)],
    contributionsByYear: {},
    ...overrides,
  };
}

/**
 * One account per real `AccountKind`, market values chosen to sum to
 * $241,739.67 for the `inTotals: true` accounts -- the real 2026-06
 * figure verified against the corpus in task 1 and again here for the
 * rollup layer. The three Chequing rows are the real Cash accounts;
 * `chequingA` carries a nonzero market value on purpose (a Chequing
 * account never states one in real data) so the exclusion test is
 * actually exercising the `inTotals` check rather than an incidental null.
 */
function realisticFixture(): AccountSeries[] {
  return [
    series({
      maskedId: "a1",
      shortId: "a1a1",
      kind: "NonRegistered",
      months: [month("2026-06", 30213.3)],
    }),
    series({ maskedId: "a2", shortId: "a2a2", kind: "RRSP", months: [month("2026-06", 14509.7)] }),
    series({
      maskedId: "a3",
      shortId: "a3a3",
      kind: "NonRegistered",
      months: [month("2026-06", 29570.06)],
    }),
    series({
      maskedId: "a4",
      shortId: "a4a4",
      kind: "Corporate",
      months: [month("2026-06", 51232.39)],
    }),
    series({ maskedId: "a5", shortId: "a5a5", kind: "TFSA", months: [month("2026-06", 7580.33)] }),
    series({
      maskedId: "a6",
      shortId: "a6a6",
      kind: "SpousalRRSP",
      months: [month("2026-06", 14306.21)],
    }),
    series({ maskedId: "a7", shortId: "a7a7", kind: "RESP", months: [month("2026-06", 3943.98)] }),
    series({ maskedId: "a8", shortId: "a8a8", kind: "RRSP", months: [month("2026-06", 20498.54)] }),
    series({ maskedId: "a9", shortId: "a9a9", kind: "TFSA", months: [month("2026-06", 40574.95)] }),
    series({
      maskedId: "a10",
      shortId: "a10a",
      kind: "Crypto",
      months: [month("2026-06", 1014.96)],
    }),
    series({
      maskedId: "a11",
      shortId: "a11a",
      kind: "FHSA",
      months: [month("2026-06", 28295.25)],
    }),
    series({
      maskedId: "chequingA",
      shortId: "cheq",
      kind: "Chequing",
      inTotals: false,
      months: [month("2026-06", 500)],
    }),
    series({
      maskedId: "chequingB",
      shortId: "cheb",
      kind: "Chequing",
      inTotals: false,
      months: [month("2026-06", null)],
    }),
    series({
      maskedId: "chequingC",
      shortId: "chec",
      kind: "Chequing",
      inTotals: false,
      months: [month("2026-06", null)],
    }),
  ];
}

const GRAND_TOTAL = 241739.67;

function sumOfTotals(groups: readonly Rollup[]): number {
  return groups.reduce((sum, g) => sum + g.total, 0);
}

describe("rollup", () => {
  test("registration lens rolls RRSP self-directed, managed and spousal into one group", () => {
    const groups = rollup(realisticFixture(), "registration");
    const rrsp = groups.find((g) => g.key === "RRSP");
    expect(rrsp?.accounts.map((a) => a.maskedId).sort()).toEqual(["a2", "a6", "a8"]);
  });

  test("registration lens folds Crypto into NonRegistered", () => {
    const groups = rollup(realisticFixture(), "registration");
    const nonReg = groups.find((g) => g.key === "NonRegistered");
    expect(nonReg?.accounts.map((a) => a.maskedId).sort()).toEqual(["a1", "a10", "a3"]);
  });

  test("registration lens has a Cash group for the Chequing accounts", () => {
    const groups = rollup(realisticFixture(), "registration");
    const cash = groups.find((g) => g.key === "Cash");
    expect(cash?.accounts.map((a) => a.maskedId).sort()).toEqual([
      "chequingA",
      "chequingB",
      "chequingC",
    ]);
  });

  test("no account appears in more than one registration group", () => {
    const groups = rollup(realisticFixture(), "registration");
    const seen = new Set<string>();
    for (const group of groups) {
      for (const account of group.accounts) {
        expect(seen.has(account.maskedId)).toBe(false);
        seen.add(account.maskedId);
      }
    }
    expect(seen.size).toBe(realisticFixture().length);
  });

  test("account lens is flat, one group per account", () => {
    const fixture = realisticFixture();
    const groups = rollup(fixture, "account");
    expect(groups.length).toBe(fixture.length);
    expect(groups.every((g) => g.accounts.length === 1)).toBe(true);
  });

  test("purpose lens drops the unassigned bucket once every account is tagged", () => {
    // The owner's ruling: a dashboard that will not show a figure it does not
    // have should not carry a standing "Unassigned / 0 accounts / $0.00" card.
    const fixture = realisticFixture().map((s) => ({ ...s, purpose: "retirement" as Purpose }));
    const groups = rollup(fixture, "purpose");
    expect(groups.find((g) => g.key === "unassigned")).toBeUndefined();
  });

  test("one untagged account brings the unassigned bucket back on its own", () => {
    const tagged = realisticFixture().map((s) => ({ ...s, purpose: "retirement" as Purpose }));
    const [first, second, ...rest] = tagged;
    if (first === undefined || second === undefined) {
      throw new Error("expected the fixture to have at least two accounts");
    }
    // A spending account too, so "unassigned is last" is a claim about the
    // ordering rather than about it being the only group left standing.
    const groups = rollup(
      [
        { ...first, purpose: "unassigned" as Purpose },
        { ...second, purpose: "spending" as Purpose },
        ...rest,
      ],
      "purpose",
    );
    const unassigned = groups.find((g) => g.key === "unassigned");
    expect(unassigned?.accounts.length).toBe(1);
    expect(groups.map((g) => g.key)).toEqual(["retirement", "spending", "unassigned"]);
  });

  test("purpose lens omits a non-unassigned purpose with no accounts in it", () => {
    const groups = rollup(realisticFixture(), "purpose");
    expect(groups.find((g) => g.key === "retirement")).toBeUndefined();
  });

  function assertCashAppearsButExcluded(lens: Lens): void {
    const groups = rollup(realisticFixture(), lens);
    const allAccounts = groups.flatMap((g) => g.accounts);
    const cash = allAccounts.find((a) => a.maskedId === "chequingA");
    expect(cash).toBeDefined();
    expect(cash?.inTotals).toBe(false);
    expect(cash?.marketValue).toBe(500);

    const cashGroup = groups.find((g) => g.accounts.some((a) => a.maskedId === "chequingA"));
    const expectedGroupTotal = (cashGroup?.accounts ?? [])
      .filter((a) => a.inTotals)
      .reduce((sum, a) => sum + (a.marketValue ?? 0), 0);
    expect(cashGroup?.total).toBe(expectedGroupTotal);
    expect(cashGroup?.total).not.toBe(500);
  }

  test("a Cash account appears in the registration lens with inTotals: false and contributes zero", () => {
    assertCashAppearsButExcluded("registration");
  });

  test("a Cash account appears in the account lens with inTotals: false and contributes zero", () => {
    assertCashAppearsButExcluded("account");
  });

  test("a Cash account appears in the purpose lens with inTotals: false and contributes zero", () => {
    assertCashAppearsButExcluded("purpose");
  });

  test("account lens labels each group with the registry's own label, not kind+shortId", () => {
    const fixture = realisticFixture().map((s, i) => ({ ...s, label: `Custom label ${i}` }));
    const groups = rollup(fixture, "account");
    expect(groups.map((g) => g.label)).toEqual(fixture.map((s) => s.label));
    expect(groups[0]?.accounts[0]?.label).toBe(fixture[0]?.label);
  });

  test("registration lens spells out Non-registered for the NonRegistered group", () => {
    const groups = rollup(realisticFixture(), "registration");
    const nonReg = groups.find((g) => g.key === "NonRegistered");
    expect(nonReg?.label).toBe("Non-registered");
  });

  test("registration lens leaves acronym group labels alone", () => {
    const groups = rollup(realisticFixture(), "registration");
    expect(groups.find((g) => g.key === "TFSA")?.label).toBe("TFSA");
    expect(groups.find((g) => g.key === "RRSP")?.label).toBe("RRSP");
    expect(groups.find((g) => g.key === "FHSA")?.label).toBe("FHSA");
    expect(groups.find((g) => g.key === "RESP")?.label).toBe("RESP");
  });

  test("purpose lens sentence-cases the display label but keeps the bare enum as the key", () => {
    const fixture = realisticFixture().map((s) => ({ ...s, purpose: "retirement" as Purpose }));
    const groups = rollup(fixture, "purpose");
    const retirement = groups.find((g) => g.key === "retirement");
    expect(retirement?.label).toBe("Retirement");
  });

  test("purpose lens renders a growth group between business and spending", () => {
    const fixture = realisticFixture().map((s) => ({ ...s, purpose: "growth" as Purpose }));
    const groups = rollup(fixture, "purpose");
    const keys = groups.map((g) => g.key);
    expect(keys).toContain("growth");
    // Every account is tagged growth here, so unassigned is empty and absent.
    expect(keys).not.toContain("unassigned");
    const growth = groups.find((g) => g.key === "growth");
    expect(growth?.accounts.length).toBe(fixture.length);
  });

  test("all three lenses sum to the same real grand total, $241,739.67", () => {
    const fixture = realisticFixture();
    const registration = sumOfTotals(rollup(fixture, "registration"));
    const account = sumOfTotals(rollup(fixture, "account"));
    const purpose = sumOfTotals(rollup(fixture, "purpose"));

    expect(registration).toBeCloseTo(GRAND_TOTAL, 2);
    expect(account).toBeCloseTo(GRAND_TOTAL, 2);
    expect(purpose).toBeCloseTo(GRAND_TOTAL, 2);
    // Different grouping orders sum the same floats in different sequences,
    // so this compares to the cent rather than requiring bit-identical floats.
    expect(registration).toBeCloseTo(account, 2);
    expect(account).toBeCloseTo(purpose, 2);
  });
});
