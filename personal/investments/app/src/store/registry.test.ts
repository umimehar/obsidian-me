import { describe, expect, test } from "bun:test";
import type { Statement } from "../types";
import { buildRegistry } from "./registry";

function makeStatement(overrides: {
  accountNo: string;
  period: string;
  version?: number;
  accountType: string;
}): Statement {
  return {
    source: {
      file: `${overrides.accountNo}_${overrides.period}_BROKERAGE.pdf`,
      accountNo: overrides.accountNo,
      period: overrides.period,
      template: "BROKERAGE",
      version: overrides.version ?? 0,
    },
    accountType: overrides.accountType,
    periodStart: `${overrides.period}-01`,
    periodEnd: `${overrides.period}-28`,
    portfolio: null,
    cash: [],
    holdings: [],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
  };
}

describe("buildRegistry", () => {
  test("takes kind from the highest-version statement in the latest period", () => {
    // Two statements share a period; only source.version tells us v_1 is the amendment.
    // v_1 is listed first so a period-only sort (relying on input order as tiebreak)
    // would pick the wrong one — the version comparator has to do the work.
    const statements = [
      makeStatement({
        accountNo: "ACCT0001CAD",
        period: "2025-01",
        version: 1,
        accountType: "Managed RRSP Account",
      }),
      makeStatement({
        accountNo: "ACCT0001CAD",
        period: "2025-01",
        version: 0,
        accountType: "Self-directed RRSP Account",
      }),
    ];
    const [record] = buildRegistry(statements);
    expect(record?.style).toBe("managed");
  });

  test("throws naming both masked ids on a shortId collision", () => {
    // Verified sha256 collision on the 4-hex shortId prefix (see task-9 report).
    const statements = [
      makeStatement({
        accountNo: "ACCT000293CAD",
        period: "2025-01",
        accountType: "Self-directed RRSP Account",
      }),
      makeStatement({
        accountNo: "ACCT000297CAD",
        period: "2025-01",
        accountType: "Self-directed TFSA Account",
      }),
    ];
    expect(() => buildRegistry(statements)).toThrow(/shortId collision/i);
    expect(() => buildRegistry(statements)).toThrow(/acct_[0-9a-f]{8}.*acct_[0-9a-f]{8}/);
  });
});
