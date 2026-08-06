import { describe, expect, test } from "bun:test";
import {
  grandTotal,
  latestPeriod,
  loadAnalytics,
  loadReconciliation,
  parseReconciliation,
  totalsByLens,
} from "./data";

describe("data.ts against the real committed analytics.json", () => {
  const analytics = loadAnalytics();

  test("carries 14 accounts", () => {
    expect(analytics.series.length).toBe(14);
    expect(analytics.meta.accountCount).toBe(14);
  });

  test("latest period is 2026-06", () => {
    expect(latestPeriod(analytics)).toBe("2026-06");
  });

  test("grand total is 241739.67", () => {
    expect(grandTotal(analytics)).toBeCloseTo(241739.67, 2);
  });

  test("all three lenses agree on the grand total", () => {
    const totals = totalsByLens(analytics);
    expect(totals.registration).toBeCloseTo(241739.67, 2);
    expect(totals.account).toBeCloseTo(totals.registration, 6);
    expect(totals.purpose).toBeCloseTo(totals.registration, 6);
  });

  test("reconciliation.json carries the real 88 findings over 220 statements", () => {
    const report = loadReconciliation();
    expect(report.statementCount).toBe(220);
    expect(report.findings.length).toBe(88);
  });

  test("exactly three findings are acknowledged, and each carries a non-empty reason", () => {
    const acknowledged = loadReconciliation().findings.filter((f) => f.acknowledged);
    expect(acknowledged.length).toBe(3);
    for (const finding of acknowledged) {
      expect(finding.reason).not.toBeNull();
      expect((finding.reason ?? "").length).toBeGreaterThan(20);
    }
    expect(acknowledged.map((f) => f.check).sort()).toEqual([
      "cross-document",
      "ground-truth",
      "style-drift",
    ]);
  });

  test("an unacknowledged finding carries a null reason, so nothing renders an empty one", () => {
    const unacknowledged = loadReconciliation().findings.filter((f) => !f.acknowledged);
    expect(unacknowledged.length).toBe(85);
    expect(unacknowledged.every((f) => f.reason === null)).toBe(true);
  });

  test("the ground-truth finding still carries both real figures and their delta", () => {
    const truth = loadReconciliation().findings.find((f) => f.check === "ground-truth");
    expect(truth?.expected).toBeCloseTo(242019.61, 2);
    expect(truth?.actual).toBeCloseTo(241739.67, 2);
    expect(truth?.delta).toBeCloseTo(-279.94, 2);
  });

  test("parseReconciliation rejects a payload whose findings are missing", () => {
    expect(() => parseReconciliation({ generated: "x", statementCount: 1 })).toThrow(
      /reconciliation\.json/,
    );
  });

  test("parseReconciliation rejects a finding missing its acknowledgement fields", () => {
    const stale = {
      generated: "x",
      statementCount: 1,
      findings: [
        { check: "ingest", severity: "warning", accountShortId: "55ce", period: "2026-06" },
      ],
    };
    expect(() => parseReconciliation(stale)).toThrow(/bun run build/);
  });

  test("latestPeriod returns null when no account has any months", () => {
    expect(
      latestPeriod({
        meta: analytics.meta,
        series: [],
        rooms: {},
        income: {},
        returns: [],
        rollups: { registration: [], account: [], purpose: [] },
      }),
    ).toBeNull();
  });
});
