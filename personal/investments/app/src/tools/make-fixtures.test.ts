import { describe, expect, test } from "bun:test";
import { assertClean, phraseTokens, scrub } from "./make-fixtures";
import type { Config } from "./make-fixtures";

function config(overrides: Partial<Config> = {}): Config {
  return {
    redactions: ["Jane Doe"],
    addressWords: ["1004-200", "Springfield"],
    vendorPrefixes: ["WK", "HQ", "WZ"],
    fixtures: [],
    ...overrides,
  };
}

function xmlWord(text: string, x0 = 10): string {
  return `<word xMin="${x0}" yMin="10" xMax="${x0 + text.length * 6}" yMax="20">${text}</word>`;
}

describe("phraseTokens", () => {
  test("keeps a hyphenated address token whole, and also splits it into halves", () => {
    // A civic/unit address can print as one hyphenated bbox word or as two
    // separate ones, depending on how the source PDF wrapped it.
    const tokens = phraseTokens("1004-200");
    expect(tokens).toContain("1004-200");
    expect(tokens).toContain("1004");
    expect(tokens).toContain("200");
  });

  test("drops single-character pieces", () => {
    // A bare "A" or "L" also matches a single-letter ticker symbol or a
    // table's column header, so admitting them would over-redact.
    expect(phraseTokens("A B-C")).not.toContain("A");
    expect(phraseTokens("A B-C")).not.toContain("B");
    expect(phraseTokens("A B-C")).not.toContain("C");
  });
});

describe("scrub", () => {
  test("redacts a civic/unit address printed as one hyphenated bbox word", () => {
    const xml = xmlWord("1004-200");
    const out = scrub(xml, "ACCT0001CAD", "ACCT9999CAD", config());
    expect(out).toContain(">REDACTED<");
    expect(out).not.toContain("1004-200");
  });

  test("redacts a civic/unit address printed as two separate bbox words", () => {
    const xml = `${xmlWord("1004", 10)}${xmlWord("-", 40)}${xmlWord("200", 60)}`;
    const out = scrub(xml, "ACCT0001CAD", "ACCT9999CAD", config());
    expect(out).not.toContain(">1004<");
    expect(out).not.toContain(">200<");
  });

  test("does not redact an unrelated number that happens to contain a civic/unit digit sequence", () => {
    // "200" is a token from the "1004-200" address, but a dollar figure like
    // "$3,200.00" is a different, whole bbox word -- scrub compares the
    // punctuation-stripped WHOLE word, not a substring.
    const xml = xmlWord("$3,200.00");
    const out = scrub(xml, "ACCT0001CAD", "ACCT9999CAD", config());
    expect(out).toContain("$3,200.00");
    expect(out).not.toContain("REDACTED");
  });
});

describe("assertClean", () => {
  test("throws on a leaked configured token, matched as a whole bbox word", () => {
    const xml = xmlWord("1004");
    expect(() => assertClean(xml, "test.xml", config(), [])).toThrow(/stale fixture/i);
  });

  test("does not throw on an unrelated word that merely contains the token as a substring", () => {
    // The exact regression this guards: assertNoConfiguredTokens used to do
    // a raw substring search over the whole document, so a short numeric
    // address token like "200" false-positived against any unrelated number
    // containing "200" anywhere on the page.
    const xml = xmlWord("$3,200.00");
    expect(() => assertClean(xml, "test.xml", config(), [])).not.toThrow();
  });

  test("throws on any configured account number, not just the fixture's own", () => {
    const xml = xmlWord("some text");
    expect(() =>
      assertClean("prefix ACCT0001CAD suffix", "test.xml", config(), ["ACCT0001CAD"]),
    ).toThrow(/account number/i);
    expect(() => assertClean(xml, "test.xml", config(), ["ACCT0001CAD"])).not.toThrow();
  });

  test("throws on a vendor-prefixed account code built from the configured prefixes", () => {
    const xml = "WK63GZF41CAD appears in a body row";
    expect(() => assertClean(xml, "test.xml", config(), [])).toThrow(/vendor account code/i);
  });

  test("does not throw on a vendor prefix not configured", () => {
    const xml = "ZZ63GZF41CAD appears in a body row";
    expect(() => assertClean(xml, "test.xml", config(), [])).not.toThrow();
  });
});
