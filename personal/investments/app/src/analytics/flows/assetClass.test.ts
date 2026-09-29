import { describe, expect, test } from "bun:test";
import { assetClassOf, isListedSymbol } from "./assetClass";

describe("assetClassOf", () => {
  test("PSA is a cash equivalent", () => {
    expect(assetClassOf("PSA")).toBe("cashEquivalent");
  });

  test("an unlisted equity symbol falls to equity", () => {
    expect(assetClassOf("VFV")).toBe("equity");
  });

  test("an empty symbol falls to equity", () => {
    expect(assetClassOf("")).toBe("equity");
  });

  test("a prototype key is never read off the table", () => {
    expect(assetClassOf("constructor")).toBe("equity");
    expect(isListedSymbol("constructor")).toBe(false);
  });

  test("d6d9's private market fund symbols are private markets", () => {
    expect(assetClassOf("WSE401")).toBe("privateMarkets");
    expect(assetClassOf("WSE401P")).toBe("privateMarkets");
    expect(assetClassOf("WSE300P")).toBe("privateMarkets");
  });

  test("e2d6's crypto symbols are crypto", () => {
    expect(assetClassOf("BTC")).toBe("crypto");
    expect(assetClassOf("ETH")).toBe("crypto");
  });

  test("the BMO bond ETFs are fixed income", () => {
    for (const symbol of ["ZAG", "ZFL", "ZCS", "ZCB", "ZHY", "ZUAG.F"]) {
      expect(assetClassOf(symbol)).toBe("fixedIncome");
    }
  });

  test("HISU.U and PSU.U are cash equivalents (owner reviewed, 2026-09-29)", () => {
    expect(assetClassOf("HISU.U")).toBe("cashEquivalent");
    expect(isListedSymbol("HISU.U")).toBe(true);
    expect(assetClassOf("PSU.U")).toBe("cashEquivalent");
    expect(isListedSymbol("PSU.U")).toBe(true);
  });
});
