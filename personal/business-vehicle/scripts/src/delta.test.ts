import { describe, expect, test } from "bun:test";
import { deltaHtml } from "./delta";

describe("deltaHtml", () => {
  test("gives an increase the accent class, because a rise is the thing to notice", () => {
    expect(deltaHtml(303, 794)).toContain('class="num pos"');
    expect(deltaHtml(303, 794)).toContain("+491");
  });

  test("leaves a saving muted", () => {
    expect(deltaHtml(850, 828)).toContain('class="num neg"');
    expect(deltaHtml(850, 828)).toContain("-22");
  });

  test("renders no change without a sign or a colour class", () => {
    const html = deltaHtml(75, 75);
    expect(html).toBe('<span class="num">0</span>');
  });

  test("drops the cents and the currency symbol, since the column header carries them", () => {
    expect(deltaHtml(0, 1247)).toContain("+1,247");
    expect(deltaHtml(0, 1247)).not.toContain("$");
  });
});
