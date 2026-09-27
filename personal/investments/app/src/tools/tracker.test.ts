import { describe, expect, test } from "bun:test";
import rawDatastore from "@data/datastore.json";
import { type Coverage, buildCoverage } from "../analytics/coverage";
import type { Datastore } from "../store/datastore";
import { COVERAGE_PATH, TRACKER_PATH, renderCoverageJson, renderTracker } from "./tracker";

function coverage(latestComplete: string | null, missing: string[]): Coverage {
  return {
    generated: "2026-09-01T00:00:00.000Z",
    latestPeriod: "2026-03",
    latestComplete,
    accounts: [
      {
        label: "TFSA",
        kind: "TFSA",
        inTotals: true,
        firstPeriod: "2026-01",
        lastPeriod: "2026-03",
        monthCount: 3,
        missing: [],
      },
      {
        label: "RESP",
        kind: "RESP",
        inTotals: true,
        firstPeriod: "2026-02",
        lastPeriod: "2026-02",
        monthCount: 1,
        missing,
      },
    ],
    months: [
      { period: "2026-03", present: 1, expected: 2, missing: ["RESP"] },
      { period: "2026-02", present: 2, expected: 2, missing: [] },
      { period: "2026-01", present: 1, expected: 1, missing: [] },
    ],
  };
}

describe("renderTracker", () => {
  test("names the complete month, the newer partial month and who is behind", () => {
    const md = renderTracker(coverage("2026-02", ["2026-03"]));
    expect(md).toContain("Latest complete month: **2026-02**, with all 2 open accounts reported.");
    expect(md).toContain("Latest month with any statement: 2026-03. Behind: RESP.");
    expect(md).toContain("| 2026-03 | 1 of 2 | RESP |");
    expect(md).toContain("| RESP | RESP | yes | 2026-02 | 2026-02 | 1 | 2026-03 |");
  });

  test("says so when no month is complete", () => {
    expect(renderTracker(coverage(null, ["2026-03"]))).toContain(
      "No month yet has a statement for every open account.",
    );
  });
});

describe("committed tracker files", () => {
  const current = buildCoverage(rawDatastore as Datastore);

  test.each([
    ["tracking.md", TRACKER_PATH, renderTracker(current)],
    ["data/coverage.json", COVERAGE_PATH, renderCoverageJson(current)],
  ])("%s is current with the committed datastore", async (name, path, expected) => {
    const actual = await Bun.file(path).text();
    if (actual !== expected) {
      throw new Error(`${name} is stale -- run \`bun run tracker\` from app/ and commit it`);
    }
  });
});
