import { describe, expect, test } from "bun:test";
import { formatCurrency, formatGainWithShare, formatSignedCurrency } from "./format";

describe("formatSignedCurrency", () => {
  test("prepends a plus sign to a positive amount", () => {
    expect(formatSignedCurrency(4786.22)).toBe(`+${formatCurrency(4786.22)}`);
    expect(formatSignedCurrency(4786.22)).toBe("+$4,786.22");
  });

  test("leaves a negative amount as formatCurrency already printed it", () => {
    expect(formatSignedCurrency(-3.16)).toBe(formatCurrency(-3.16));
    expect(formatSignedCurrency(-3.16)).toBe("-$3.16");
  });

  test("prepends a plus sign to zero", () => {
    expect(formatSignedCurrency(0)).toBe("+$0.00");
  });
});

describe("formatGainWithShare", () => {
  test("states the dollars and the percentage of the base, both signed", () => {
    expect(formatGainWithShare(16638.34, 233759.76)).toBe("+$16,638.34 (+7.12%)");
    expect(formatGainWithShare(-45.04, 1205.04)).toBe("-$45.04 (-3.74%)");
  });

  test("the dollars are byte-identical to formatSignedCurrency's, never a second formatting", () => {
    // The whole reason this function exists rather than two calls at each
    // site. Eight shipped defects in this project were an announced figure
    // disagreeing with a rendered one.
    for (const gain of [16638.34, -45.04, 0, 1234567.89, -0.01]) {
      expect(formatGainWithShare(gain, 1000)).toStartWith(formatSignedCurrency(gain));
    }
  });

  test("the percentage keeps two decimals, the precision a rate is stated at", () => {
    // -$3.16 on $20,501.70 is -0.0154%. At one decimal that is -0.0%, which
    // reads as no loss at all.
    expect(formatGainWithShare(-3.16, 20501.7)).toBe("-$3.16 (-0.02%)");
    expect(formatGainWithShare(995.74, 51638.73)).toBe("+$995.74 (+1.93%)");
  });

  test("a zero base states the dollars alone rather than Infinity or NaN", () => {
    // The real corpus opens at 2023-06 with two accounts holding $0.00 of
    // book cost. An omitted bracket is honest; "Infinity%" is not.
    expect(formatGainWithShare(0, 0)).toBe("+$0.00");
    expect(formatGainWithShare(100, 0)).toBe("+$100.00");
    expect(formatGainWithShare(-100, 0)).toBe("-$100.00");
    for (const base of [0, -1]) {
      expect(formatGainWithShare(100, base)).not.toMatch(/Infinity|NaN|%/);
    }
  });

  test("a zero gain against a real base still states a percentage, since zero is a figure", () => {
    // Distinct from the zero-base case above: here the percentage is known
    // and it is zero, which is something the data actually says.
    expect(formatGainWithShare(0, 1000)).toBe("+$0.00 (+0.00%)");
  });
});
