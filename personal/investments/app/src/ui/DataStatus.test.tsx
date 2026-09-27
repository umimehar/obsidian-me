import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import type { Coverage } from "../analytics/coverage";
import { DataStatus } from "./DataStatus";
import { loadCoverage } from "./data";

afterEach(cleanup);

function renderStatus(coverage: Coverage) {
  return render(
    <Theme>
      <DataStatus coverage={coverage} />
    </Theme>,
  );
}

const PARTIAL: Coverage = {
  generated: "2026-09-01T00:00:00.000Z",
  latestPeriod: "2026-03",
  latestComplete: "2026-02",
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
      label: "Chequing",
      kind: "Chequing",
      inTotals: false,
      firstPeriod: "2026-02",
      lastPeriod: "2026-02",
      monthCount: 1,
      missing: ["2026-03"],
    },
  ],
  months: [
    { period: "2026-03", present: 1, expected: 2, missing: ["Chequing"] },
    { period: "2026-02", present: 2, expected: 2, missing: [] },
    { period: "2026-01", present: 1, expected: 1, missing: [] },
  ],
};

describe("DataStatus", () => {
  test("a partial latest month names the complete month and who is still to import", () => {
    const { container } = renderStatus(PARTIAL);
    expect(container.querySelector("[data-latest-complete]")?.textContent).toBe("2026-02");
    expect(container.querySelector("[data-coverage-behind]")?.textContent).toBe(
      "2026-03 is partial. Still to import: Chequing.",
    );
    expect(screen.getByText("1 of 2")).toBeDefined();
    expect(screen.getByText("(not in totals)", { exact: false })).toBeDefined();
  });

  test("no complete month says so instead of printing a month", () => {
    const { container } = renderStatus({ ...PARTIAL, latestComplete: null });
    expect(screen.getByText("No month yet has a statement for every open account.")).toBeDefined();
    expect(container.querySelector("[data-latest-complete]")).toBeNull();
  });

  test("the committed coverage renders one row per account and per month", () => {
    const coverage = loadCoverage();
    const { container } = renderStatus(coverage);
    expect(container.querySelectorAll("[data-coverage-accounts] tbody tr").length).toBe(
      coverage.accounts.length,
    );
    expect(container.querySelectorAll("[data-coverage-months] tbody tr").length).toBe(
      coverage.months.length,
    );
  });
});
