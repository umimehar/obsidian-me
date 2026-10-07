import { describe, expect, test } from "bun:test";
import { findLeaks, luhn } from "./leaks";

describe("findLeaks", () => {
  test.each([
    ["a card inside a bank transfer reference", "TF0004111111111111111"],
    ["a SIN with dashes", "SIN 123-456-782"],
    ["a SIN with dots", "SIN 123.456.782"],
    ["an account number", "BMO #12345678-004"],
    ["a card that keeps its first six digits", "card 411111******1111"],
  ])("flags %s", (_, text) => {
    expect(findLeaks(text).length).toBeGreaterThan(0);
  });

  test.each([
    ["the business number", "BN 795920958 RT0001"],
    ["an exchange rate", "GBP 21.99@1.861300591"],
    ["a long decimal", "<v>2.9999999999999996</v>"],
    ["a hash", "sha256 44aad50e8c4a48abbac8be4ed2b62c79925f178c1ed64f5eb734431535000077"],
    ["SVG coordinates", 'd="M 682.125 125 l 5"'],
    ["a last-four mask", "Visa ****1680"],
  ])("ignores %s", (_, text) => {
    expect(findLeaks(text)).toEqual([]);
  });

  test("finds a known identifier whatever its separators", () => {
    expect(findLeaks("ref 123 45 6782 end", ["123456782"])).toHaveLength(1);
  });
});

test("luhn accepts a valid card and rejects a typo", () => {
  expect(luhn("4111111111111111")).toBe(true);
  expect(luhn("4111111111111112")).toBe(false);
});
