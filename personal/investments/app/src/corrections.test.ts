import { describe, expect, test } from "bun:test";
import { ACKNOWLEDGED, type Acknowledgement, assertReasonsGiven } from "./corrections";

function entry(reason: string): Acknowledgement {
  return {
    check: "style-drift",
    shortId: "9710",
    period: "2026-06",
    reason,
    reviewed: "2026-08-06",
  };
}

describe("assertReasonsGiven", () => {
  test("accepts the real acknowledgements", () => {
    expect(() => assertReasonsGiven(ACKNOWLEDGED)).not.toThrow();
    expect(ACKNOWLEDGED.length).toBe(5);
  });

  test("rejects an empty reason, naming the entry", () => {
    expect(() => assertReasonsGiven([entry("")])).toThrow(/style-drift\/9710\/2026-06/);
  });

  test("rejects a whitespace-only reason, which renders as blank all the same", () => {
    expect(() => assertReasonsGiven([entry("   \n ")])).toThrow(/blank reason/);
  });

  test("accepts a real reason", () => {
    expect(() =>
      assertReasonsGiven([entry("the account moved to a Managed portfolio")]),
    ).not.toThrow();
  });
});
