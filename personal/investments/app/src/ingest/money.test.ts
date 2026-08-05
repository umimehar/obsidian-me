import { describe, expect, test } from "bun:test";
import { isMoney, parseMoney } from "./money";

describe("parseMoney", () => {
  test("parses a plain amount", () => {
    expect(parseMoney("$1,037.17")).toBe(1037.17);
    expect(parseMoney("$0.00")).toBe(0);
  });

  test("parses a minus that sits AFTER the dollar sign", () => {
    // Managed brokerage balance columns render negatives as $-12,300.48.
    // Testing only the first character reads this as positive.
    expect(parseMoney("$-12,300.48")).toBe(-12300.48);
  });

  test("parses the en dash the cash statement uses", () => {
    expect(parseMoney("–$60.00")).toBe(-60);
    expect(parseMoney("–$1,756.28")).toBe(-1756.28);
  });

  test("parses a bare quantity", () => {
    expect(parseMoney("159.1371")).toBe(159.1371);
  });

  test("throws rather than returning zero", () => {
    expect(() => parseMoney("n/a")).toThrow(/unparseable money/i);
    expect(() => parseMoney("")).toThrow(/unparseable money/i);
  });
});

describe("isMoney", () => {
  test("accepts every negative form and rejects prose", () => {
    for (const t of ["$0.00", "$1,234.56", "$-12,300.48", "–$60.00", "12.5000"]) {
      expect(isMoney(t)).toBe(true);
    }
    for (const t of ["Deposits", "3/7", "2026-06-01", "CAD", "100.00%"]) {
      expect(isMoney(t)).toBe(false);
    }
  });
});
