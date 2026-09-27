import { describe, expect, test } from "bun:test";
import type { Datastore } from "../store/datastore";
import type { AccountRecord } from "../store/registry";
import type { Statement } from "../types";
import { buildCoverage, nextPeriod, periodRange } from "./coverage";

function account(maskedId: string, firstPeriod: string, lastPeriod: string): AccountRecord {
  return {
    maskedId,
    shortId: maskedId.slice(5, 9),
    label: `Account ${maskedId.slice(5, 9)}`,
    kind: "TFSA",
    style: "self-directed",
    purpose: "growth",
    inTotals: true,
    firstPeriod,
    lastPeriod,
    statementCount: 0,
    typeHistory: [],
  };
}

function statement(accountNo: string, period: string): Statement {
  return { source: { accountNo, period } } as Statement;
}

function datastore(accounts: AccountRecord[], statements: Statement[]): Datastore {
  return {
    meta: {
      generated: "2026-09-01T00:00:00.000Z",
      statementCount: statements.length,
      accountCount: accounts.length,
    },
    accounts,
    statements,
  };
}

describe("periods", () => {
  test("nextPeriod rolls the year over after December", () => {
    expect(nextPeriod("2025-12")).toBe("2026-01");
    expect(nextPeriod("2026-09")).toBe("2026-10");
  });

  test("periodRange is inclusive, and empty when first is after last", () => {
    expect(periodRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(periodRange("2026-03", "2026-02")).toEqual([]);
  });
});

describe("buildCoverage", () => {
  test("an account that has not reported the latest month holds back the complete month", () => {
    const c = buildCoverage(
      datastore(
        [
          account("acct_aaaa0000", "2026-01", "2026-03"),
          account("acct_bbbb0000", "2026-02", "2026-02"),
        ],
        [
          statement("acct_aaaa0000", "2026-01"),
          statement("acct_aaaa0000", "2026-02"),
          statement("acct_aaaa0000", "2026-03"),
          statement("acct_bbbb0000", "2026-02"),
        ],
      ),
    );
    expect(c.latestPeriod).toBe("2026-03");
    expect(c.latestComplete).toBe("2026-02");
    expect(c.accounts.map((a) => a.missing)).toEqual([[], ["2026-03"]]);
    expect(c.months.map((m) => [m.period, m.present, m.expected])).toEqual([
      ["2026-03", 1, 2],
      ["2026-02", 2, 2],
      ["2026-01", 1, 1],
    ]);
  });

  test("a mid-history gap is reported, and two statements in one month count once", () => {
    const c = buildCoverage(
      datastore(
        [account("acct_aaaa0000", "2026-01", "2026-03")],
        [
          statement("acct_aaaa0000", "2026-01"),
          statement("acct_aaaa0000", "2026-03"),
          statement("acct_aaaa0000", "2026-03"),
        ],
      ),
    );
    expect(c.accounts[0]?.missing).toEqual(["2026-02"]);
    expect(c.accounts[0]?.monthCount).toBe(2);
    expect(c.latestComplete).toBe("2026-03");
  });

  test("no complete month at all yields null, and the page says so", () => {
    const c = buildCoverage(
      datastore(
        [
          account("acct_aaaa0000", "2026-01", "2026-01"),
          account("acct_bbbb0000", "2026-01", "2026-01"),
        ],
        [statement("acct_aaaa0000", "2026-01")],
      ),
    );
    expect(c.latestComplete).toBeNull();
  });

  test("an empty datastore fails loudly rather than rendering an empty tracker", () => {
    expect(() => buildCoverage(datastore([], []))).toThrow("run `bun run build` first");
  });
});
