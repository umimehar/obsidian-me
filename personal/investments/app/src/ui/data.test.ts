import { describe, expect, test } from "bun:test";
import { GOLDENS } from "../goldens";
import {
  grandTotal,
  latestPeriod,
  loadAnalytics,
  loadCheckpoints,
  loadReconciliation,
  parseCheckpoints,
  parseReconciliation,
  totalsByLens,
} from "./data";

/**
 * The 2026-06-30 app reading, and the two things that separate it from this
 * project's total for the same month. They sum to it exactly, to the cent --
 * see `corrections.ts`, and `notes/checkpoints.md` for how it was found.
 */
const APP_READING_2026_06 = 242019.61;
/** The spousal RRSP at 2026-06: the owner contributed it, the spouse owns it. */
const SPOUSAL_2026_06 = 14306.21;
/** WSE401, carried at its purchase price under a pending-valuation disclaimer. */
const WSE401_PENDING = 279.94;

describe("data.ts against the real committed analytics.json", () => {
  const analytics = loadAnalytics();

  test("carries the corpus's accounts, in the payload and in its own meta", () => {
    expect(analytics.series.length).toBe(GOLDENS.corpus.accountCount);
    expect(analytics.meta.accountCount).toBe(GOLDENS.corpus.accountCount);
  });

  test("latest period is the corpus's own", () => {
    expect(latestPeriod(analytics)).toBe(GOLDENS.corpus.latestPeriod);
  });

  test("grand total is the corpus's own", () => {
    expect(grandTotal(analytics)).toBeCloseTo(GOLDENS.portfolio.total, 2);
  });

  test("all three lenses agree on the grand total", () => {
    // The strongest invariant here is the three-way agreement, which holds
    // whatever the corpus is; the golden pins which figure they agree ON.
    const totals = totalsByLens(analytics);
    expect(totals.registration).toBeCloseTo(GOLDENS.portfolio.total, 2);
    expect(totals.account).toBeCloseTo(totals.registration, 6);
    expect(totals.purpose).toBeCloseTo(totals.registration, 6);
  });

  test("reconciliation.json carries the corpus's findings over its statements", () => {
    const report = loadReconciliation();
    expect(report.statementCount).toBe(GOLDENS.corpus.statementCount);
    expect(report.findings.length).toBe(GOLDENS.reconciliation.findingCount);
  });

  test("every acknowledged finding carries a non-empty reason, and the roster is the expected one", () => {
    const acknowledged = loadReconciliation().findings.filter((f) => f.acknowledged);
    expect(acknowledged.length).toBe(GOLDENS.reconciliation.acknowledgedCount);
    for (const finding of acknowledged) {
      expect(finding.reason).not.toBeNull();
      expect((finding.reason ?? "").length).toBeGreaterThan(20);
    }
    expect(acknowledged.map((f) => String(f.check)).sort()).toEqual(
      GOLDENS.reconciliation.acknowledgedChecks,
    );
  });

  test("an unacknowledged finding carries a null reason, so nothing renders an empty one", () => {
    const unacknowledged = loadReconciliation().findings.filter((f) => !f.acknowledged);
    expect(unacknowledged.length).toBe(GOLDENS.reconciliation.unacknowledgedCount);
    expect(unacknowledged.every((f) => f.reason === null)).toBe(true);
  });

  test("the ground-truth finding carries both real figures and a delta that decomposes exactly", () => {
    // The observation in truth.ts is dated and does not move with an import.
    // Its delta is large because the app reading counted the spousal RRSP,
    // which this project excludes: the owner is the contributor, the asset is
    // the spouse's. The residual is what makes that explanation testable.
    const truth = loadReconciliation().findings.find((f) => f.check === "ground-truth");
    expect(truth?.expected).toBeCloseTo(APP_READING_2026_06, 2);
    expect(truth?.actual).toBeCloseTo(APP_READING_2026_06 - SPOUSAL_2026_06 - WSE401_PENDING, 2);
    expect(truth?.delta).toBeCloseTo(-(SPOUSAL_2026_06 + WSE401_PENDING), 2);
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
        activity: {},
        statedFees: {},
        holdings: {
          period: "",
          total: 0,
          holdings: [],
          groups: [],
          currency: { CAD: 0, USD: 0 },
          assetClasses: [],
        },
      }),
    ).toBeNull();
  });
});

describe("parseCheckpoints", () => {
  test("accepts an explicit reconciliation: null, distinct from the field being absent", () => {
    const checkpoints = parseCheckpoints({
      checkpoints: [{ observed: "2026-09-01", coversPeriod: "2026-09", reconciliation: null }],
    });
    expect(checkpoints).toEqual([{ coversPeriod: "2026-09", reconciliation: null }]);
  });

  test("a checkpoint missing coversPeriod throws naming its index and observed date", () => {
    expect(() => parseCheckpoints({ checkpoints: [{ observed: "2026-08-31" }] })).toThrow(
      /checkpoint 0 \(2026-08-31\).*coversPeriod/,
    );
  });

  test("a reconciliation with a non-numeric field throws naming the field", () => {
    expect(() =>
      parseCheckpoints({
        checkpoints: [
          {
            observed: "2026-08-31",
            coversPeriod: "2026-08",
            reconciliation: { ourTotal: "not a number", appVisibleTotal: 1, difference: 1 },
          },
        ],
      }),
    ).toThrow(/reconciliation\.ourTotal/);
  });

  test("the real committed checkpoints.json parses without throwing", () => {
    expect(() => loadCheckpoints()).not.toThrow();
    expect(loadCheckpoints().length).toBeGreaterThan(0);
  });
});
