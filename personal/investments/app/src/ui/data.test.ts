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
    // Complete in every field a pre-acknowledgement build wrote, and missing
    // only the two this one adds. A looser guard would accept this and the
    // view would render three explained findings as unexplained.
    const finding = {
      check: "ingest",
      severity: "warning",
      accountShortId: "55ce",
      period: "2026-06",
      message: "skipped",
      expected: null,
      actual: null,
      delta: null,
      sourceFile: "55ce_2026-06_BROKERAGE.pdf",
    };
    const stale = { generated: "x", statementCount: 1, findings: [finding] };
    expect(() => parseReconciliation(stale)).toThrow(/acknowledged/);

    // reason alone is not enough: the boolean is what the view branches on,
    // and a finding carrying only a null reason would read as unacknowledged.
    const reasonOnly = { ...stale, findings: [{ ...finding, reason: null }] };
    expect(() => parseReconciliation(reasonOnly)).toThrow(/acknowledged/);

    const withAcknowledged = {
      ...stale,
      findings: [{ ...finding, acknowledged: false, reason: null }],
    };
    expect(parseReconciliation(withAcknowledged).findings.length).toBe(1);
  });

  test("parseReconciliation rejects a reason that is neither a string nor null", () => {
    const stale = {
      generated: "x",
      statementCount: 1,
      findings: [
        {
          check: "ingest",
          severity: "warning",
          accountShortId: "55ce",
          period: "2026-06",
          message: "skipped",
          expected: null,
          actual: null,
          delta: null,
          sourceFile: "f.pdf",
          acknowledged: true,
          reason: 42,
        },
      ],
    };
    expect(() => parseReconciliation(stale)).toThrow(/bun run build/);
  });

  test("parseReconciliation rejects a figure that arrived as a string", () => {
    const stale = {
      generated: "x",
      statementCount: 1,
      findings: [
        {
          check: "ingest",
          severity: "warning",
          accountShortId: "55ce",
          period: "2026-06",
          message: "skipped",
          expected: "12000.00",
          actual: null,
          delta: null,
          sourceFile: "f.pdf",
          acknowledged: false,
          reason: null,
        },
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
