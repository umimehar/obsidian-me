import { describe, expect, test } from "bun:test";
import type { Statement } from "../types";
import { maskAccountNo } from "./mask";
import { buildRegistry } from "./registry";

/** Brute-forces an account number whose sha256 shortId prefix matches, since KIND_OVERRIDES is keyed by shortId, not by the raw number. */
function accountNoWithShortId(shortId: string): string {
  for (let i = 0; i < 1_000_000; i += 1) {
    const candidate = `TESTACCT${i}CAD`;
    if (maskAccountNo(candidate).shortId === shortId) return candidate;
  }
  throw new Error(`no account number found hashing to shortId ${shortId}`);
}

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

  test("classifies the account overridden as corporate as Corporate, not NonRegistered", () => {
    // 91b8 prints "Non-Registered Cash Account" like any real personal
    // account -- the document alone cannot tell the two apart, which is
    // exactly why this must come from an override, not classifyAccountType.
    const accountNo = accountNoWithShortId("91b8");
    const statements = [
      makeStatement({
        accountNo,
        period: "2025-01",
        accountType: "Self-directed Non-Registered Cash Account",
      }),
    ];
    const [record] = buildRegistry(statements);
    expect(record?.kind).toBe("Corporate");
    expect(record?.kind).not.toBe("NonRegistered");
  });

  test("does not override an unrelated account's kind", () => {
    const statements = [
      makeStatement({
        accountNo: "ACCT0001CAD",
        period: "2025-01",
        accountType: "Self-directed Non-Registered Cash Account",
      }),
    ];
    const [record] = buildRegistry(statements);
    expect(record?.kind).toBe("NonRegistered");
  });

  test("seeds the owner's purpose and label for a known shortId", () => {
    // d77c is the self-directed TFSA in the owner's real mapping.
    const accountNo = accountNoWithShortId("d77c");
    const statements = [
      makeStatement({ accountNo, period: "2025-01", accountType: "Self-directed TFSA Account" }),
    ];
    const [record] = buildRegistry(statements);
    expect(record?.purpose).toBe("growth");
    expect(record?.label).toBe("TFSA (self-directed)");
  });

  test("two same-kind same-style accounts fall back to the masked shortId, not a colliding label", () => {
    // 1f9a and 2c62 are both self-directed NonRegistered accounts in the
    // owner's mapping -- kind + style alone cannot tell them apart, so
    // both keep their shortId in the label.
    const accountNo1 = accountNoWithShortId("1f9a");
    const accountNo2 = accountNoWithShortId("2c62");
    const statements = [
      makeStatement({
        accountNo: accountNo1,
        period: "2025-01",
        accountType: "Self-directed Non-Registered Cash Account",
      }),
      makeStatement({
        accountNo: accountNo2,
        period: "2025-01",
        accountType: "Self-directed Non-Registered Cash Account",
      }),
    ];
    const records = buildRegistry(statements);
    const labels = records.map((r) => r.label).sort();
    expect(labels).toEqual(["Non-registered 1f9a", "Non-registered 2c62"]);
    expect(records.every((r) => r.purpose === "growth")).toBe(true);
  });

  test("an account outside the owner's mapping defaults to unassigned with a kind+shortId label", () => {
    const statements = [
      makeStatement({
        accountNo: "ACCT0001CAD",
        period: "2025-01",
        accountType: "Self-directed RRSP Account",
      }),
    ];
    const [record] = buildRegistry(statements);
    expect(record?.purpose).toBe("unassigned");
    expect(record?.label).toBe(`RRSP ${record?.shortId}`);
  });
});
