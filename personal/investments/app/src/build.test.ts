import { describe, expect, spyOn, test } from "bun:test";
import { countedAccountNumbers, maskFindingSourceFile, resolveTemplate } from "./build";
import type { ParsedFilename } from "./ingest/source";
import { maskAccountNo } from "./store/mask";
import type { Statement } from "./types";
import type { Finding } from "./validate/report";

function makeParsedFilename(overrides: Partial<ParsedFilename> = {}): ParsedFilename {
  return {
    file: "ACCT0001CAD_2026-06_BROKERAGE.pdf",
    accountNo: "ACCT0001CAD",
    period: "2026-06",
    template: "BROKERAGE",
    version: 0,
    templateStated: true,
    ...overrides,
  };
}

function makeStatement(accountNo: string): Statement {
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
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
  };
}

describe("countedAccountNumbers", () => {
  test("returns only the raw account numbers of accounts marked inTotals", () => {
    const rrsp = makeStatement("ACCT0001CAD");
    const chequing = makeStatement("ACCT0002CAD");
    const accounts = [
      { maskedId: maskAccountNo("ACCT0001CAD").maskedId, inTotals: true },
      { maskedId: maskAccountNo("ACCT0002CAD").maskedId, inTotals: false },
    ];

    const counted = countedAccountNumbers([rrsp, chequing], accounts);
    expect(counted.has("ACCT0001CAD")).toBe(true);
    expect(counted.has("ACCT0002CAD")).toBe(false);
  });

  test("returns an empty set when no account is in totals", () => {
    const statement = makeStatement("ACCT0001CAD");
    const accounts = [{ maskedId: maskAccountNo("ACCT0001CAD").maskedId, inTotals: false }];
    expect(countedAccountNumbers([statement], accounts).size).toBe(0);
  });
});

describe("resolveTemplate", () => {
  test("uses the document's template even when the filename states a different one", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const parsed = makeParsedFilename({ template: "BROKERAGE", templateStated: true });
    expect(resolveTemplate(parsed, "CASH")).toBe("CASH");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("does not warn when the filename agrees with the document", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const parsed = makeParsedFilename({ template: "BROKERAGE", templateStated: true });
    expect(resolveTemplate(parsed, "BROKERAGE")).toBe("BROKERAGE");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("does not warn on a fresh download's placeholder template, and still uses the document", () => {
    // The fresh-download filename form states no template at all -- its
    // placeholder disagreeing with the document is not a real conflict.
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const parsed = makeParsedFilename({ template: "BROKERAGE", templateStated: false });
    expect(resolveTemplate(parsed, "PERFORMANCE")).toBe("PERFORMANCE");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    check: "statement-arithmetic",
    severity: "error",
    accountShortId: "55ce",
    period: "2026-06",
    message: "does not reconcile",
    expected: 100,
    actual: 99,
    delta: -1,
    sourceFile: "ACCT0001CAD_2026-06_BROKERAGE.pdf",
    ...overrides,
  };
}

describe("maskFindingSourceFile", () => {
  test("replaces the raw account-code prefix with the finding's own masked short id", () => {
    const masked = maskFindingSourceFile(makeFinding());
    expect(masked.sourceFile).toBe("55ce_2026-06_BROKERAGE.pdf");
    expect(masked.sourceFile).not.toContain("ACCT0001CAD");
  });

  test("leaves an empty sourceFile alone, and every other field untouched", () => {
    const finding = makeFinding({ sourceFile: "", accountShortId: "*", check: "ground-truth" });
    expect(maskFindingSourceFile(finding)).toEqual(finding);
  });

  test("does not mutate the input finding", () => {
    const finding = makeFinding();
    maskFindingSourceFile(finding);
    expect(finding.sourceFile).toBe("ACCT0001CAD_2026-06_BROKERAGE.pdf");
  });
});
