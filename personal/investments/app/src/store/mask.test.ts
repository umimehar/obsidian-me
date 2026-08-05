import { describe, expect, test } from "bun:test";
import {
  type AccountKind,
  type ManagementStyle,
  classifyAccountType,
  maskAccountNo,
  redactText,
} from "./mask";

describe("maskAccountNo", () => {
  test("is deterministic and reveals nothing", () => {
    const a = maskAccountNo("ACCT0001CAD");
    expect(a).toEqual(maskAccountNo("ACCT0001CAD"));
    expect(a.maskedId).toMatch(/^acct_[0-9a-f]{8}$/);
    expect(a.shortId).toMatch(/^[0-9a-f]{4}$/);
    expect(a.maskedId).toContain(a.shortId);
    expect(a.maskedId).not.toContain("ACCT0001");
  });

  test("different accounts get different ids", () => {
    expect(maskAccountNo("ACCT0001CAD").maskedId).not.toBe(maskAccountNo("ACCT0002CAD").maskedId);
  });
});

describe("redactText", () => {
  test("removes configured names case-insensitively", () => {
    expect(redactText("e-Transfer Received from Jane Doe", ["Jane Doe"])).toBe(
      "e-Transfer Received from [redacted]",
    );
    expect(redactText("paid to JANE DOE", ["Jane Doe"])).toBe("paid to [redacted]");
  });

  test("leaves unrelated text alone", () => {
    expect(redactText("Transfer out to Non-registered", ["Jane Doe"])).toBe(
      "Transfer out to Non-registered",
    );
  });
});

describe("classifyAccountType", () => {
  test("maps every wording present in the corpus", () => {
    const cases: [string, AccountKind, ManagementStyle][] = [
      ["Tax-Free Savings Account", "TFSA", "self-directed"],
      ["Tax-Free Savings SDI Cash Account", "TFSA", "self-directed"],
      ["Tax-Free Savings Managed Cash Account", "TFSA", "managed"],
      ["Self-directed TFSA Account", "TFSA", "self-directed"],
      ["Managed TFSA Account", "TFSA", "managed"],
      ["Order Execution Only TFSA Account", "TFSA", "self-directed"],
      ["First Home Savings SDI Cash Account", "FHSA", "self-directed"],
      ["Self-directed FHSA Account", "FHSA", "self-directed"],
      ["Order Execution Only FHSA Account", "FHSA", "self-directed"],
      ["Self-directed RRSP Account", "RRSP", "self-directed"],
      ["Managed RRSP Account", "RRSP", "managed"],
      ["Order Execution Only RRSP Account", "RRSP", "self-directed"],
      ["Self-directed Spousal RRSP Account", "SpousalRRSP", "self-directed"],
      ["Order Execution Only Spousal RRSP Account", "SpousalRRSP", "self-directed"],
      ["Self-directed RESP Account", "RESP", "self-directed"],
      ["Order Execution Only RESP Account", "RESP", "self-directed"],
      ["Self-directed Non-Registered Cash Account", "NonRegistered", "self-directed"],
      ["Order Execution Only Non-Registered Cash Account", "NonRegistered", "self-directed"],
      ["Crypto Account", "Crypto", "self-directed"],
      ["Chequing Account", "Chequing", "self-directed"],
    ];
    for (const [type, kind, style] of cases) {
      expect(classifyAccountType(type)).toEqual({ kind, style });
    }
  });

  test("does not let the word Cash override the wrapper", () => {
    // Both of these say "Cash" and neither is a cash account.
    expect(classifyAccountType("Tax-Free Savings Managed Cash Account").kind).toBe("TFSA");
    expect(classifyAccountType("First Home Savings SDI Cash Account").kind).toBe("FHSA");
  });

  test("checks spousal before plain RRSP", () => {
    expect(classifyAccountType("Managed Spousal RRSP Account").kind).toBe("SpousalRRSP");
  });

  test("throws on an unrecognised wording rather than defaulting", () => {
    expect(() => classifyAccountType("Managed LIRA Account")).toThrow(/unrecognised account type/i);
  });
});
