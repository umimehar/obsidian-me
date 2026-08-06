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

  test("redacts the long form fully even when a shorter name is listed first", () => {
    // Config order is caller-controlled and not guaranteed longest-first.
    expect(redactText("e-Transfer Received from Jane Doe", ["Jane", "Jane Doe"])).toBe(
      "e-Transfer Received from [redacted]",
    );
  });

  test("treats regex metacharacters in a name as literal text", () => {
    expect(redactText("paid to A.B Corp", ["A.B"])).toBe("paid to [redacted] Corp");
    // A "." in the name must not act as a wildcard and match "AXB".
    expect(redactText("paid to AXB Corp", ["A.B"])).toBe("paid to AXB Corp");
  });

  test("does not re-match a name that is a substring of its own output placeholder", () => {
    // A multi-pass loop re-scans the output of every earlier replacement, so
    // a name like "Red" would re-match inside the literal text "[redacted]"
    // that an earlier match just wrote, corrupting it into a second
    // redaction. A single-pass alternation never reads back its own output.
    expect(redactText("paid to Red and Jane Doe", ["Red", "Jane Doe"])).toBe(
      "paid to [redacted] and [redacted]",
    );
  });

  test("redacts two distinct names in the same text without one consuming the other's match", () => {
    expect(redactText("Jane Doe paid John Smith", ["Jane Doe", "John Smith"])).toBe(
      "[redacted] paid [redacted]",
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
