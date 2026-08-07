import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Datastore } from "../store/datastore";
import { buildAnalytics } from "./build";

const DATASTORE_PATH = join(import.meta.dir, "..", "..", "..", "data", "datastore.json");

// Skipped without the real datastore -- it is gitignored, carries the
// owner's masked but real financial history, and must never be committed
// or required to make this run in CI.
describe.if(existsSync(DATASTORE_PATH))("analytics over the real datastore", () => {
  async function build() {
    const datastore = (await Bun.file(DATASTORE_PATH).json()) as Datastore;
    return buildAnalytics(datastore, "2026-08-06T00:00:00.000Z");
  }

  test("finds all 14 accounts", async () => {
    const output = await build();
    expect(output.series).toHaveLength(14);
  });

  test("2026-06 inTotals market value totals $241,739.67 within a cent", async () => {
    const output = await build();
    let total = 0;
    for (const account of output.series) {
      if (!account.inTotals) continue;
      const month = account.months.find((m) => m.period === "2026-06");
      total += month?.marketValue ?? 0;
    }
    expect(Math.abs(total - 241739.67)).toBeLessThan(0.01);
  });

  test("all three lenses agree on the grand total", async () => {
    const output = await build();
    const registrationTotal = output.rollups.registration.reduce((sum, g) => sum + g.total, 0);
    const accountTotal = output.rollups.account.reduce((sum, g) => sum + g.total, 0);
    const purposeTotal = output.rollups.purpose.reduce((sum, g) => sum + g.total, 0);
    expect(accountTotal).toBeCloseTo(registrationTotal, 2);
    expect(purposeTotal).toBeCloseTo(registrationTotal, 2);
  });

  /**
   * The live path, not the committed artifact. Every other corpus test reads
   * `data/analytics.json` through `loadAnalytics`, so reverting the
   * contributions fix in `series.ts` leaves them all green until someone
   * regenerates. These two recompute from the datastore, so they redden on a
   * source change alone.
   *
   * Both figures come from months Wealthsimple printed no Contributions
   * panel for: 2318's $1,000 at 2025-10 closes the RRSP against the notice
   * of assessment's $60,191 less $45,191 unused, and d77c's $4,000 at
   * 2025-10 is the same defect on the TFSA.
   */
  test("2025's RRSP and TFSA room includes the contributions no statement states a total for", async () => {
    const output = await build();
    const lines = output.rooms["2025"] ?? [];
    expect(lines.find((line) => line.group === "RRSP")?.used).toBe(15000);
    expect(lines.find((line) => line.group === "TFSA")?.used).toBe(25000);
  });

  test("2025's RRSP room is assessed at 60,191, leaving a positive 45,191", async () => {
    const output = await build();
    const rrsp = (output.rooms["2025"] ?? []).find((line) => line.group === "RRSP");
    expect(rrsp?.assessed).toBe(true);
    expect(rrsp?.limit).toBe(60191);
    expect(rrsp?.remaining).toBe(45191);
    expect(rrsp?.remaining).toBeGreaterThan(0);
  });

  test("no room line in any year carries a negative remaining", async () => {
    const output = await build();
    for (const lines of Object.values(output.rooms)) {
      for (const line of lines) {
        if (line.remaining === null) continue;
        expect(line.remaining).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("no account appears in more than one registration group", async () => {
    const output = await build();
    const seen = new Set<string>();
    for (const group of output.rollups.registration) {
      for (const account of group.accounts) {
        expect(seen.has(account.maskedId)).toBe(false);
        seen.add(account.maskedId);
      }
    }
    expect(seen.size).toBe(output.series.length);
  });

  test("every account carries a purpose, and the owner has tagged all 14", async () => {
    const output = await build();
    for (const account of output.series) {
      expect(account.purpose).toBeTruthy();
    }
    // The owner has tagged every real account (task 3a), so today's corpus
    // has none left in `unassigned` -- proves the registry mapping is
    // actually reaching every account rather than some falling through to
    // the default silently.
    expect(output.series.some((a) => a.purpose === "unassigned")).toBe(false);
  });
});
