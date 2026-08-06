import { describe, expect, test } from "bun:test";
import type { Statement } from "../types";
import { buildDatastore } from "./datastore";
import { maskAccountNo } from "./mask";
import type { AccountRecord } from "./registry";

function makeStatement(accountNo: string, description: string): Statement {
  return {
    source: {
      file: `${accountNo}_2026-06_BROKERAGE.pdf`,
      accountNo,
      period: "2026-06",
      template: "BROKERAGE",
      version: 0,
    },
    accountType: "Self-directed RRSP Account",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    portfolio: null,
    cash: [],
    holdings: [],
    activity: [
      {
        date: "2026-06-15",
        postedDate: null,
        code: "CONT",
        description,
        debit: 0,
        credit: 100,
        balance: 100,
        currency: "CAD",
      },
    ],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
  };
}

const ACCOUNT: AccountRecord = {
  maskedId: maskAccountNo("ACCT0001CAD").maskedId,
  shortId: maskAccountNo("ACCT0001CAD").shortId,
  label: "RRSP 0000",
  kind: "RRSP",
  style: "self-directed",
  purpose: "unassigned",
  inTotals: true,
  firstPeriod: "2026-06",
  lastPeriod: "2026-06",
  statementCount: 1,
  typeHistory: ["Self-directed RRSP Account"],
};

describe("buildDatastore", () => {
  test("replaces the raw account number everywhere it appears, including in the filename", () => {
    const statement = makeStatement("ACCT0001CAD", "e-Transfer from Jane Doe");
    const store = buildDatastore([statement], [ACCOUNT], [], "2026-08-06T00:00:00.000Z");

    const [out] = store.statements;
    const { maskedId, shortId } = maskAccountNo("ACCT0001CAD");
    expect(out?.source.accountNo).toBe(maskedId);
    expect(out?.source.file).toBe(`${shortId}_2026-06_BROKERAGE.pdf`);
    expect(JSON.stringify(store)).not.toContain("ACCT0001CAD");
  });

  test("redacts names in activity descriptions without touching the source statements", () => {
    const statement = makeStatement("ACCT0001CAD", "e-Transfer from Jane Doe");
    const store = buildDatastore([statement], [ACCOUNT], ["Jane Doe"], "2026-08-06T00:00:00.000Z");

    expect(store.statements[0]?.activity[0]?.description).toBe("e-Transfer from [redacted]");
    // The input statement itself is untouched -- buildDatastore must copy, not mutate.
    expect(statement.activity[0]?.description).toBe("e-Transfer from Jane Doe");
  });

  test("meta counts reflect the statements and accounts passed in, not any global state", () => {
    const statement = makeStatement("ACCT0001CAD", "deposit");
    const store = buildDatastore([statement, statement], [ACCOUNT], [], "2026-08-06T00:00:00.000Z");
    expect(store.meta).toEqual({
      generated: "2026-08-06T00:00:00.000Z",
      statementCount: 2,
      accountCount: 1,
    });
  });
});
