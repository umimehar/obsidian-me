import { describe, expect, test } from "bun:test";
import { escapeHtml, money, monthsBetween, percent, plainDate, wholeMoney } from "./format";

describe("money", () => {
  test("renders cents and thousands separators", () => {
    expect(money(9657)).toBe("$9,657.00");
    expect(money(804.75)).toBe("$804.75");
  });
  test("renders negatives with a leading minus, not brackets", () => {
    expect(money(-22)).toBe("-$22.00");
  });
  test("returns an em dash for null so tables never print the word null", () => {
    expect(money(null)).toBe("—");
  });
});

describe("wholeMoney", () => {
  test("drops the cents and rounds half up", () => {
    expect(wholeMoney(3211.4)).toBe("$3,211");
    expect(wholeMoney(3211.5)).toBe("$3,212");
  });
  test("returns an em dash for null", () => {
    expect(wholeMoney(null)).toBe("—");
  });
});

describe("percent", () => {
  test("renders a signed percentage to one decimal", () => {
    expect(percent(0.148)).toBe("+14.8%");
    expect(percent(-0.026)).toBe("-2.6%");
  });
  test("renders exact zero without a sign", () => {
    expect(percent(0)).toBe("0.0%");
  });
  test("returns an em dash for null", () => {
    expect(percent(null)).toBe("—");
  });
});

describe("monthsBetween", () => {
  test("counts whole months between two ISO dates", () => {
    expect(monthsBetween("2025-09-30", "2026-08-19")).toBe(10);
    expect(monthsBetween("2025-09-30", "2025-09-30")).toBe(0);
  });
  test("does not count a month until the day of month is reached", () => {
    expect(monthsBetween("2025-09-30", "2025-10-29")).toBe(0);
    expect(monthsBetween("2025-09-30", "2025-10-30")).toBe(1);
  });
  test("returns a negative count when the end precedes the start", () => {
    expect(monthsBetween("2026-08-19", "2025-09-30")).toBe(-10);
  });
});

describe("plainDate", () => {
  test("renders an ISO date as a readable day", () => {
    expect(plainDate("2026-10-01")).toBe("1 October 2026");
  });
  test("returns an em dash for null or empty", () => {
    expect(plainDate(null)).toBe("—");
    expect(plainDate("")).toBe("—");
  });
});

describe("escapeHtml", () => {
  test("escapes the five characters that break markup", () => {
    expect(escapeHtml(`<a href="x">O'Brien & co</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; co&lt;/a&gt;",
    );
  });
});
