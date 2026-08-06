import { describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ShareBar } from "./ShareBar";
import { formatShare } from "./format";

/** The two real purpose-lens shares that a whole-percent rounding visibly distorts. */
const EDUCATION = 3943.98 / 241739.67;
const BUSINESS = 51232.39 / 241739.67;

/** One bar at a time, so a test that renders several reads the one it just drew. */
function renderBar(label: string, share: number): HTMLElement {
  cleanup();
  render(<ShareBar label={label} share={share} />);
  const node = screen.getByRole("progressbar");
  if (!(node instanceof HTMLElement)) throw new Error("expected an html progressbar");
  return node;
}

/** The fill's width, as a number of percent. */
function fillPercent(bar: HTMLElement): number {
  const fill = bar.querySelector("[data-share-bar-fill]");
  if (!(fill instanceof HTMLElement)) throw new Error("expected a fill inside the bar");
  return Number.parseFloat(fill.style.width);
}

describe("ShareBar announced value", () => {
  test("announces the same one decimal the card prints, not a whole percent", () => {
    // Education is 1.6% of the portfolio. Rounded to whole percent it
    // announces 2%, which is the exact defect that removed the last bar.
    const bar = renderBar("Education", EDUCATION);
    expect(bar.getAttribute("aria-valuetext")).toBe("1.6%");
    expect(bar.getAttribute("aria-valuetext")).not.toBe("2%");
  });

  test("a large share announces its decimal too", () => {
    const bar = renderBar("Business", BUSINESS);
    expect(bar.getAttribute("aria-valuetext")).toBe("21.2%");
    expect(bar.getAttribute("aria-valuetext")).not.toBe("21%");
  });

  test("the announced value is character for character what formatShare produces", () => {
    // Not "the same number": the same string. Two formatters is how a card
    // and its bar drift apart.
    for (const share of [EDUCATION, BUSINESS, 0, 0.5, 0.204]) {
      const bar = renderBar("Group", share);
      expect(bar.getAttribute("aria-valuetext")).toBe(formatShare(share));
    }
  });

  test("is named, so it does not announce as an anonymous bar", () => {
    expect(renderBar("Education", EDUCATION).getAttribute("aria-label")).toBe(
      "Education share of the portfolio",
    );
  });

  test("carries the range a progressbar is read against", () => {
    const bar = renderBar("Education", EDUCATION);
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeCloseTo(1.631, 3);
  });
});

describe("ShareBar fill", () => {
  test("the fill tracks the real share against a full hundred percent", () => {
    expect(fillPercent(renderBar("Education", EDUCATION))).toBeCloseTo(1.631, 3);
  });

  test("a thirteen times larger group draws a thirteen times wider fill", () => {
    const business = fillPercent(renderBar("Business", BUSINESS));
    const education = fillPercent(renderBar("Education", EDUCATION));
    expect(business / education).toBeCloseTo(BUSINESS / EDUCATION, 3);
  });

  test("a group with no share draws nothing rather than a sliver", () => {
    const bar = renderBar("Cash", 0);
    expect(fillPercent(bar)).toBe(0);
    expect(bar.getAttribute("aria-valuetext")).toBe("0.0%");
  });

  test("the whole portfolio fills the bar exactly", () => {
    const bar = renderBar("Everything", 1);
    expect(fillPercent(bar)).toBe(100);
    expect(bar.getAttribute("aria-valuetext")).toBe("100.0%");
  });
});
