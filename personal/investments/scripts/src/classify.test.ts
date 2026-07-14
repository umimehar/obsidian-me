import { expect, test } from "bun:test";
import { classify, normalizeType } from "./classify";
import { type RawRow, SCHEMA_ACCOUNT, SCHEMA_CARD } from "./parse";

function accountRow(transaction: string, description: string, amount: string): RawRow {
  return {
    sourceFile: "f.csv",
    schema: SCHEMA_ACCOUNT,
    fields: { date: "2026-06-01", transaction, description, amount, balance: "0", currency: "CAD" },
  };
}

test("maps FPLINT to INT and CONT to CONTRIB", () => {
  expect(normalizeType("FPLINT", 1, SCHEMA_ACCOUNT)).toBe("INT");
  expect(normalizeType("CONT", 1, SCHEMA_ACCOUNT)).toBe("CONTRIB");
});

test("EFT uses amount sign", () => {
  expect(normalizeType("EFT", 5, SCHEMA_ACCOUNT)).toBe("TRANSFER_IN");
  expect(normalizeType("EFT", -5, SCHEMA_ACCOUNT)).toBe("TRANSFER_OUT");
});

test("unknown code is OTHER", () => {
  expect(normalizeType("MYSTERY", 1, SCHEMA_ACCOUNT)).toBe("OTHER");
});

test("card refund is CARD_REFUND", () => {
  const row: RawRow = {
    sourceFile: "c.csv",
    schema: SCHEMA_CARD,
    fields: {
      transaction_date: "2026-05-01",
      post_date: "2026-05-02",
      type: "Refund settled",
      details: "AMZN",
      amount: "-9.99",
      currency: "CAD",
    },
  };
  expect(classify(row).type).toBe("CARD_REFUND");
});

test("BUY extracts symbol, quantity, and price", () => {
  const out = classify(
    accountRow("BUY", "L - Loblaw: Bought 1.0000 shares at $61.49 per share (x)", "-61.49"),
  );
  expect(out).toMatchObject({ type: "BUY", symbol: "L", quantity: 1, unitPrice: 61.49 });
});

test("BUY without price derives unit price", () => {
  const out = classify(accountRow("BUY", "VFV - Vanguard: Bought 0.5000 shares (x)", "-40.0"));
  expect(out).toMatchObject({ symbol: "VFV", quantity: 0.5, unitPrice: 80 });
});

test("gold ounces extract quantity and price", () => {
  const out = classify(
    accountRow("BUY", "GOLD - gold: Bought 0.2273 ounces at $6942.54 per ounce (x)", "-1578"),
  );
  expect(out).toMatchObject({ symbol: "GOLD", quantity: 0.2273, unitPrice: 6942.54 });
});

test("crypto buy extracts symbol and fx", () => {
  const out = classify(
    accountRow("BUY", "Purchase of 0.0028564000 BTC (x), FX Rate: 1.3903", "-247.53"),
  );
  expect(out).toMatchObject({ symbol: "BTC", quantity: 0.0028564, fxRate: 1.3903 });
});
