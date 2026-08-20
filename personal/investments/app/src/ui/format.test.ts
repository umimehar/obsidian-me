import { describe, expect, test } from "bun:test";
import { formatCurrency, formatSignedCurrency } from "./format";

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
