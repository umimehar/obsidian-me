import { describe, expect, test } from "bun:test";
import type { ReportedFinding } from "../validate/report";
import { loadReconciliation } from "./data";
import { groundTruthFinding, groupFindings } from "./findings";

function makeFinding(overrides: Partial<ReportedFinding> = {}): ReportedFinding {
  return {
    check: "statement-arithmetic",
    severity: "warning",
    accountShortId: "55ce",
    period: "2026-06",
    message: "differs by 0.02",
    expected: 100,
    actual: 100.02,
    delta: 0.02,
    sourceFile: "55ce_2026-06_BROKERAGE.pdf",
    acknowledged: false,
    reason: null,
    ...overrides,
  };
}

describe("groupFindings", () => {
  test("puts a group containing an error ahead of a larger warning-only group", () => {
    const groups = groupFindings([
      makeFinding(),
      makeFinding({ period: "2026-05" }),
      makeFinding({ period: "2026-04" }),
      makeFinding({ check: "cross-document", severity: "error" }),
    ]);
    expect(groups.map((g) => g.check)).toEqual(["cross-document", "statement-arithmetic"]);
    expect(groups[0]?.errorCount).toBe(1);
    expect(groups[1]?.findings.length).toBe(3);
  });

  test("orders two warning-only groups by size, largest first", () => {
    const groups = groupFindings([
      makeFinding({ check: "ingest" }),
      makeFinding(),
      makeFinding({ period: "2026-05" }),
    ]);
    expect(groups.map((g) => g.check)).toEqual(["statement-arithmetic", "ingest"]);
  });

  test("puts errors first inside a group too, ahead of an earlier warning", () => {
    // The error is the LATER period on purpose: if severity were dropped and
    // the rows fell back to period order, the error would sort second, so
    // this ordering can only come from the severity rank.
    const groups = groupFindings([
      makeFinding({ check: "kind-drift", period: "2026-01" }),
      makeFinding({ check: "kind-drift", severity: "error", period: "2026-06" }),
    ]);
    expect(groups[0]?.findings.map((f) => f.severity)).toEqual(["error", "warning"]);
    expect(groups[0]?.findings.map((f) => f.period)).toEqual(["2026-06", "2026-01"]);
  });

  test("orders same-severity rows by period, oldest first", () => {
    const groups = groupFindings([
      makeFinding({ check: "kind-drift", period: "2026-06" }),
      makeFinding({ check: "kind-drift", period: "2026-01" }),
      makeFinding({ check: "kind-drift", period: "2026-03" }),
    ]);
    expect(groups[0]?.findings.map((f) => f.period)).toEqual(["2026-01", "2026-03", "2026-06"]);
  });

  test("counts acknowledged findings per group without dropping them", () => {
    const groups = groupFindings([
      makeFinding({ check: "style-drift", severity: "error", acknowledged: true, reason: "why" }),
      makeFinding({ check: "style-drift", severity: "error", period: "2026-05" }),
    ]);
    expect(groups[0]?.findings.length).toBe(2);
    expect(groups[0]?.acknowledgedCount).toBe(1);
    expect(groups[0]?.errorCount).toBe(2);
  });

  test("returns no groups for no findings, rather than an empty placeholder group", () => {
    expect(groupFindings([])).toEqual([]);
  });

  test("keeps every one of the real 90 findings across its groups", () => {
    const groups = groupFindings(loadReconciliation().findings);
    const total = groups.reduce((sum, group) => sum + group.findings.length, 0);
    expect(total).toBe(90);
    // Error groups lead, largest first, so the 2-finding return-direction
    // group now sorts ahead of the 1-finding cross-document group.
    expect(groups[0]?.check).toBe("return-direction");
  });
});

describe("groundTruthFinding", () => {
  test("finds the whole-portfolio ground-truth line in the real report", () => {
    const truth = groundTruthFinding(loadReconciliation().findings);
    expect(truth?.accountShortId).toBe("*");
    expect(truth?.period).toBe("2026-06");
    expect(truth?.actual).toBeCloseTo(241739.67, 2);
  });

  test("returns null when the report carries no ground-truth line", () => {
    expect(groundTruthFinding([makeFinding()])).toBeNull();
  });

  test("returns the most recent ground-truth line when several are observed", () => {
    const older = makeFinding({ check: "ground-truth", period: "2026-03", actual: 1 });
    const newer = makeFinding({ check: "ground-truth", period: "2026-06", actual: 2 });
    expect(groundTruthFinding([newer, older])?.actual).toBe(2);
    expect(groundTruthFinding([older, newer])?.actual).toBe(2);
  });
});
