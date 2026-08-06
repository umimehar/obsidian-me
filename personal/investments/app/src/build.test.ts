import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  annotateFinding,
  countedAccountNumbers,
  dedupeToLatestVersion,
  loadRedactions,
  maskFinding,
  resolveTemplate,
} from "./build";
import type { ParsedFilename } from "./ingest/source";
import { maskAccountNo } from "./store/mask";
import type { Statement } from "./types";
import { checkGroundTruth } from "./validate/checks";
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

function makeStatement(
  accountNo: string,
  sourceOverrides: Partial<Statement["source"]> = {},
  portfolio: Statement["portfolio"] = null,
): Statement {
  const period = sourceOverrides.period ?? "2026-06";
  const template = sourceOverrides.template ?? "BROKERAGE";
  return {
    source: {
      file: `${accountNo}_${period}_${template}.pdf`,
      accountNo,
      period,
      template,
      version: 0,
      ...sourceOverrides,
    },
    accountType: "Self-directed RRSP Account",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    portfolio,
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

describe("loadRedactions", () => {
  test("throws naming the missing file and the example to copy, rather than failing open", async () => {
    const dir = await mkdtemp(join(tmpdir(), "investments-redactions-"));
    try {
      const path = join(dir, "redactions.json");
      await expect(loadRedactions(path)).rejects.toThrow(/redactions\.example\.json/);
      await expect(loadRedactions(path)).rejects.toThrow(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reads the redactions array from an existing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "investments-redactions-"));
    try {
      const path = join(dir, "redactions.json");
      await writeFile(path, JSON.stringify({ redactions: ["Jane Doe", 42] }));
      expect(await loadRedactions(path)).toEqual(["Jane Doe"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("dedupeToLatestVersion", () => {
  test("keeps only the highest version within a (accountNo, period, template) group", () => {
    const v0 = makeStatement("ACCT0001CAD", { version: 0 });
    const v1 = makeStatement("ACCT0001CAD", { version: 1 });
    const v2 = makeStatement("ACCT0001CAD", { version: 2 });
    const deduped = dedupeToLatestVersion([v1, v0, v2]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.source.version).toBe(2);
  });

  test("leaves distinct accounts, periods and templates alone", () => {
    const statements = [
      makeStatement("ACCT0001CAD", { period: "2026-06" }),
      makeStatement("ACCT0001CAD", { period: "2026-07" }),
      makeStatement("ACCT0002CAD", { period: "2026-06" }),
      makeStatement("ACCT0001CAD", { period: "2026-06", template: "PERFORMANCE" }),
    ];
    expect(dedupeToLatestVersion(statements)).toHaveLength(4);
  });

  test("preserves first-seen order across groups", () => {
    const first = makeStatement("ACCT0001CAD", { period: "2026-06" });
    const second = makeStatement("ACCT0002CAD", { period: "2026-06" });
    const amendedFirst = makeStatement("ACCT0001CAD", { period: "2026-06", version: 1 });
    const deduped = dedupeToLatestVersion([first, second, amendedFirst]);
    expect(deduped.map((s) => s.source.accountNo)).toEqual(["ACCT0001CAD", "ACCT0002CAD"]);
    expect(deduped[0]?.source.version).toBe(1);
  });

  test("regression: an amended statement no longer double-counts into ground truth", () => {
    const portfolio = {
      cashMarketValue: 0,
      cashBookCost: 0,
      classes: [],
      totalMarketValue: 20000,
      totalBookCost: 20000,
    };
    const original = makeStatement("ACCT0001CAD", { version: 0 }, portfolio);
    const amended = makeStatement("ACCT0001CAD", { version: 1 }, portfolio);
    const obs = [
      { observed: "2026-06-30", period: "2026-06", accountValue: 20000, netDeposits: null },
    ];

    // Before the fix, both versions fed checkGroundTruth and it summed
    // $40,000 for one account. Feeding it the raw, undeduped pair directly
    // reproduces that bug and pins the precondition dedupeToLatestVersion
    // exists to remove.
    const undeduped = checkGroundTruth([original, amended], obs, new Set(["ACCT0001CAD"]));
    expect(undeduped[0]?.actual).toBe(40000);

    const deduped = checkGroundTruth(
      dedupeToLatestVersion([original, amended]),
      obs,
      new Set(["ACCT0001CAD"]),
    );
    expect(deduped[0]?.actual).toBe(20000);
  });
});

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
    const parsed = makeParsedFilename({ template: "BROKERAGE", templateStated: true });
    const findings: Finding[] = [];
    expect(resolveTemplate(parsed, "CASH", findings)).toBe("CASH");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.check).toBe("ingest");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.message).toMatch(/template mismatch/);
  });

  test("does not report a finding when the filename agrees with the document", () => {
    const parsed = makeParsedFilename({ template: "BROKERAGE", templateStated: true });
    const findings: Finding[] = [];
    expect(resolveTemplate(parsed, "BROKERAGE", findings)).toBe("BROKERAGE");
    expect(findings).toEqual([]);
  });

  test("does not report a finding on a fresh download's placeholder template, and still uses the document", () => {
    // The fresh-download filename form states no template at all -- its
    // placeholder disagreeing with the document is not a real conflict.
    const parsed = makeParsedFilename({ template: "BROKERAGE", templateStated: false });
    const findings: Finding[] = [];
    expect(resolveTemplate(parsed, "PERFORMANCE", findings)).toBe("PERFORMANCE");
    expect(findings).toEqual([]);
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

describe("maskFinding", () => {
  test("replaces the raw account-code prefix with the finding's own masked short id", () => {
    const masked = maskFinding(makeFinding());
    expect(masked.sourceFile).toBe("55ce_2026-06_BROKERAGE.pdf");
    expect(masked.sourceFile).not.toContain("ACCT0001CAD");
  });

  test("leaves an empty sourceFile alone, and every other field untouched", () => {
    const finding = makeFinding({ sourceFile: "", accountShortId: "*", check: "ground-truth" });
    expect(maskFinding(finding)).toEqual(finding);
  });

  test("does not mutate the input finding", () => {
    const finding = makeFinding();
    maskFinding(finding);
    expect(finding.sourceFile).toBe("ACCT0001CAD_2026-06_BROKERAGE.pdf");
  });

  test("masks a raw filename embedded in the message, not just in sourceFile", () => {
    // The ingest check's duplicate-skip finding quotes the filename of the
    // file it matched, which is not necessarily this finding's own account.
    const finding = makeFinding({
      check: "ingest",
      message: "skipped: byte-identical to already-ingested ACCT0002CAD_2026-06_BROKERAGE.pdf",
    });
    const masked = maskFinding(finding);
    const expectedShortId = maskAccountNo("ACCT0002CAD").shortId;
    expect(masked.message).toBe(
      `skipped: byte-identical to already-ingested ${expectedShortId}_2026-06_BROKERAGE.pdf`,
    );
    expect(masked.message).not.toContain("ACCT0002CAD");
  });

  test("leaves a message with no embedded filename untouched", () => {
    const finding = makeFinding({ message: "does not reconcile" });
    expect(maskFinding(finding).message).toBe("does not reconcile");
  });
});

describe("annotateFinding", () => {
  test("marks an acknowledged finding and carries its reason onto the report", () => {
    const annotated = annotateFinding(
      makeFinding({ check: "style-drift", accountShortId: "9710", period: "2026-06" }),
    );
    expect(annotated.acknowledged).toBe(true);
    expect(annotated.reason).toContain("self-directed to a Wealthsimple Managed portfolio");
  });

  test('the whole-portfolio ground-truth acknowledgement matches on the "*" short id', () => {
    const annotated = annotateFinding(
      makeFinding({
        check: "ground-truth",
        accountShortId: "*",
        period: "2026-06",
        sourceFile: "",
      }),
    );
    expect(annotated.acknowledged).toBe(true);
    expect(annotated.reason).toContain("WSE401");
  });

  test("an unacknowledged finding carries a null reason, never an empty-string one", () => {
    const annotated = annotateFinding(makeFinding());
    expect(annotated.acknowledged).toBe(false);
    expect(annotated.reason).toBeNull();
  });

  test("acknowledgement is keyed on the period too, so a later period is not covered", () => {
    const annotated = annotateFinding(
      makeFinding({ check: "style-drift", accountShortId: "9710", period: "2026-07" }),
    );
    expect(annotated.acknowledged).toBe(false);
    expect(annotated.reason).toBeNull();
  });

  test("leaves every figure exactly as it was -- annotation never rewrites a number", () => {
    const finding = makeFinding({ check: "cross-document", accountShortId: "d6d9" });
    const annotated = annotateFinding(finding);
    expect(annotated.expected).toBe(100);
    expect(annotated.actual).toBe(99);
    expect(annotated.delta).toBe(-1);
    expect(annotated.message).toBe("does not reconcile");
  });
});
