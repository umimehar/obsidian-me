import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseGeometry } from "./geometry";
import { parsePerformance } from "./performance";
import { parseSourceFilename } from "./source";

const parsed = parseSourceFilename("ACCT0001CAD_2026-04_PERFORMANCE.pdf");
if (!parsed) throw new Error("bad fixture filename");
const source = parsed;

async function load() {
  const xml = await Bun.file(join(import.meta.dir, "__fixtures__", "performance.xml")).text();
  return parsePerformance(parseGeometry(xml), source);
}

describe("parsePerformance", () => {
  test("keeps everything the brokerage parser produces", async () => {
    const s = await load();
    expect(s.accountType).toBe("Managed RRSP Account");
    expect(s.portfolio?.totalMarketValue).toBe(12370.86);
    expect(s.holdings).toHaveLength(1);
  });

  test("reads the money-weighted return rates", async () => {
    const s = await load();
    expect(s.returns?.sinceInception).toBe(10.31);
  });

  test("reads a horizon that does not yet apply as null, not as 0%", async () => {
    // The statement prints 0.00% for horizons shorter than the account's life.
    // Treating those as a measured zero corrupts phase 3's fitted returns.
    const s = await load();
    expect(s.returns?.tenYears).toBeNull();
  });

  test("reads the period balance summary", async () => {
    const s = await load();
    expect(s.balances).toEqual({
      start: 12531.01,
      deposits: 0,
      withdrawals: 0,
      changeInMarketValue: -160.15,
      end: 12370.86,
    });
  });

  test("the balance summary reconciles, and its end matches the portfolio total", async () => {
    const s = await load();
    const b = s.balances;
    if (!b) throw new Error("expected balances");
    expect(b.start + b.deposits - b.withdrawals + b.changeInMarketValue).toBeCloseTo(b.end, 2);
    expect(b.end).toBeCloseTo(s.portfolio?.totalMarketValue ?? -1, 2);
  });

  test("throws rather than guessing when the account type row is absent", () => {
    expect(() => parsePerformance([], source)).toThrow(/account type/i);
  });
});
