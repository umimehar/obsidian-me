import { expect, test } from "bun:test";
import {
  type Redactions,
  accountCodeFromFilename,
  accountNameFromFilename,
  detectKind,
  maskAccountCode,
  redact,
  shortAccountId,
} from "./mask";

test("masking is stable and prefixed", () => {
  expect(maskAccountCode("XX0TEST001CAD")).toBe(maskAccountCode("XX0TEST001CAD"));
  expect(maskAccountCode("XX0TEST001CAD")).toStartWith("acct_");
  expect(maskAccountCode("XX0TEST001CAD")).not.toBe(maskAccountCode("XX0TEST002CAD"));
});

test("short id is four hex chars and stable", () => {
  expect(shortAccountId("XX0TEST001CAD")).toHaveLength(4);
  expect(shortAccountId("XX0TEST001CAD")).toBe(shortAccountId("XX0TEST001CAD"));
});

test("account code from filename", () => {
  expect(
    accountCodeFromFilename("TFSA-2026-06-01-monthly-statement-transactions-XX0TEST001CAD.csv"),
  ).toBe("XX0TEST001CAD");
  expect(accountCodeFromFilename("Wealthsimple-credit-card-...-x.csv")).toBe("card");
});

test("account name from filename strips date and emoji, cards read Card", () => {
  expect(
    accountNameFromFilename("Managed (TFSA)-2026-06-01-monthly-statement-transactions-XX.csv"),
  ).toBe("Managed (TFSA)");
  expect(accountNameFromFilename("Wealthsimple-credit-card-...-x.csv")).toBe("Card");
});

test("detect kind", () => {
  expect(detectKind("Home-...-XXHOME.csv")).toBe("FHSA");
  expect(detectKind("Managed (TFSA)-...-XX.csv")).toBe("ManagedTFSA");
  expect(detectKind("Family-RESP-...-XX.csv")).toBe("RESP");
  expect(detectKind("Wealthsimple-credit-card-...-x.csv")).toBe("CreditCard");
});

test("redact removes configured names case-insensitively", () => {
  const red: Redactions = { names: ["Test Person Name", "Second"], accountLabelPeople: {} };
  const out = redact("Received from Test Person Name and second", red);
  expect(out).not.toContain("Test Person");
  expect(out.toLowerCase()).not.toContain("second");
});
