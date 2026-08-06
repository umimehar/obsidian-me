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

  test("every account carries a purpose, defaulting to unassigned", async () => {
    const output = await build();
    for (const account of output.series) {
      expect(account.purpose).toBeTruthy();
    }
    // The owner has not tagged any account yet, so today's real corpus is
    // entirely `unassigned` -- proves the default is actually reaching
    // every account rather than some other fallback silently applying.
    expect(output.series.every((a) => a.purpose === "unassigned")).toBe(true);
  });
});
