import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseCash } from "./cash";
import { parseGeometry } from "./geometry";
import { parseSourceFilename } from "./source";

const parsed = parseSourceFilename("ACCT0005CAD_2026-06_CASH.pdf");
if (!parsed) throw new Error("bad fixture filename");
const source = parsed;

async function load() {
  const xml = await Bun.file(join(import.meta.dir, "__fixtures__", "cash.xml")).text();
  return parseCash(parseGeometry(xml), source);
}

describe("parseCash", () => {
  test("reads the account type and period", async () => {
    const s = await load();
    expect(s.accountType).toBe("Chequing Account");
    expect(s.periodStart).toBe("2026-06-01");
    expect(s.periodEnd).toBe("2026-06-30");
  });

  test("reads opening and closing balances and nothing it does not have", async () => {
    const cad = (await load()).cash[0];
    expect(cad?.opening).toBe(195.59);
    expect(cad?.closing).toBe(155.62);
    expect(cad?.totalIn).toBeNull();
    expect(cad?.paidIn).toBeNull();
  });

  test("holds no securities and no portfolio", async () => {
    const s = await load();
    expect(s.portfolio).toBeNull();
    expect(s.holdings).toEqual([]);
  });

  test("reads a row with the en-dash negative", async () => {
    const row = (await load()).activity.find((r) => r.debit === 122.84);
    expect(row?.date).toBe("2026-06-03");
    expect(row?.balance).toBe(72.75);
    expect(row?.credit).toBe(0);
  });

  test("reads a row whose posted date differs from its transaction date", async () => {
    const row = (await load()).activity.find((r) => r.description.includes("Direct deposit"));
    expect(row?.date).toBe("2026-06-12");
    expect(row?.postedDate).toBe("2026-06-15");
    expect(row?.credit).toBe(3101.5);
  });

  test("keeps a negative running balance", async () => {
    expect((await load()).activity.some((r) => r.balance === -2556.28)).toBe(true);
  });

  test("the activity rows reconcile opening to closing", async () => {
    const s = await load();
    const cad = s.cash[0];
    if (!cad) throw new Error("expected a cash summary");
    const net = s.activity.reduce((a, r) => a + r.credit - r.debit, 0);
    expect(cad.opening + net).toBeCloseTo(cad.closing, 2);
  });

  test("throws rather than guessing when the account type row is absent", () => {
    expect(() => parseCash([], source)).toThrow(/could not find/i);
  });
});
