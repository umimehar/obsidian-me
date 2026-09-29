import { describe, expect, test } from "bun:test";
import { matchTransfers } from "./match";
import type { FlowRow } from "./types";

const leg = (
  id: string,
  accountId: string,
  date: string,
  amount: number,
  currency: "CAD" | "USD" = "CAD",
  code?: string,
): FlowRow => ({
  id,
  accountId,
  period: date.slice(0, 7),
  date,
  code: code ?? (amount > 0 ? "CONT" : "TRFOUT"),
  category: amount > 0 ? "outsideBank" : "leftWealthsimple",
  movement: true,
  amountCad: amount,
  currency,
  amount,
  fxRate: null,
  symbol: "",
  pairId: null,
  lagDays: null,
});

describe("matchTransfers", () => {
  test("same date, same amount, opposite sign, different accounts pair with lag 0", () => {
    const [out, inn] = matchTransfers([
      leg("o", "cheq", "2026-07-14", -800),
      leg("i", "rrsp", "2026-07-14", 800),
    ]);
    expect(out?.pairId).toBe("o>i");
    expect(inn?.pairId).toBe("o>i");
    expect(inn?.lagDays).toBe(0);
  });

  test("a two day lag pairs in the second pass and records the lag", () => {
    const rows = matchTransfers([
      leg("o", "a", "2026-01-14", -500),
      leg("i", "b", "2026-01-16", 500),
    ]);
    expect(rows[1]?.lagDays).toBe(2);
  });

  test("an exact date match wins over a closer id with a lag", () => {
    const rows = matchTransfers([
      leg("o", "a", "2026-01-14", -500),
      leg("i1", "b", "2026-01-15", 500),
      leg("i2", "c", "2026-01-14", 500),
    ]);
    expect(rows[0]?.pairId).toBe("o>i2");
    expect(rows[1]?.pairId).toBeNull();
  });

  test("four days apart never pair", () => {
    const rows = matchTransfers([
      leg("o", "a", "2026-01-10", -500),
      leg("i", "b", "2026-01-14", 500),
    ]);
    expect(rows.every((r) => r.pairId === null)).toBe(true);
  });

  test("the same account never pairs with itself", () => {
    const rows = matchTransfers([
      leg("o", "a", "2026-01-10", -500),
      leg("i", "a", "2026-01-10", 500),
    ]);
    expect(rows.every((r) => r.pairId === null)).toBe(true);
  });

  test("currencies never cross, and a cent apart never pairs", () => {
    const rows = matchTransfers([
      leg("o", "a", "2026-01-10", -500),
      leg("u", "b", "2026-01-10", 500, "USD"),
      leg("c", "c", "2026-01-10", 500.01),
    ]);
    expect(rows.every((r) => r.pairId === null)).toBe(true);
  });

  test("two identical transfers on one day pair one to one", () => {
    const rows = matchTransfers([
      leg("o1", "cheq", "2026-07-14", -40),
      leg("o2", "cheq", "2026-07-14", -40),
      leg("i1", "nr", "2026-07-14", 40),
      leg("i2", "nr", "2026-07-14", 40),
    ]);
    expect(new Set(rows.map((r) => r.pairId)).size).toBe(2);
  });

  test("a same-day WD and TRFOUT of equal amount prefer the transfer code for the one match", () => {
    // Real corpus, 2026-01-14: 2b74 carries both a WD -700 and a TRFOUT -700
    // the same day, with only one +700 credit to pair against (2c62). The
    // transfer code is the more specific movement and should win the match,
    // leaving the WD unpaired rather than the TRFOUT.
    const rows = matchTransfers([
      leg("wd", "2b74", "2026-01-14", -700, "CAD", "WD"),
      leg("out", "2b74", "2026-01-14", -700, "CAD", "TRFOUT"),
      leg("in", "2c62", "2026-01-14", 700, "CAD", "CONT"),
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("out")?.pairId).not.toBeNull();
    expect(byId.get("wd")?.pairId).toBeNull();
  });

  test("non movement rows are never paired", () => {
    const div = { ...leg("d", "b", "2026-01-10", 500), movement: false };
    const rows = matchTransfers([leg("o", "a", "2026-01-10", -500), div]);
    expect(rows.every((r) => r.pairId === null)).toBe(true);
  });
});
