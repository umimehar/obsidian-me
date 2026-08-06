import { describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ShareBar } from "./ShareBar";

/** The two real purpose-lens shares that a whole-percent rounding visibly distorts. */
const EDUCATION = 3943.98 / 241739.67;
const BUSINESS = 51232.39 / 241739.67;

/** One bar at a time, so a test that renders several reads the one it just drew. */
function renderBar(label: string, share: number): HTMLElement {
  cleanup();
  render(<ShareBar label={label} share={share} />);
  const node = document.querySelector("[data-share-bar]");
  if (!(node instanceof HTMLElement)) throw new Error("expected a share bar to render");
  return node;
}

/** The fill's width, as a number of percent. */
function fillPercent(bar: HTMLElement): number {
  const fill = bar.querySelector("[data-share-bar-fill]");
  if (!(fill instanceof HTMLElement)) throw new Error("expected a fill inside the bar");
  return Number.parseFloat(fill.style.width);
}

describe("ShareBar announces nothing", () => {
  test("is hidden from assistive tech, so it cannot state a figure at all", () => {
    // The card's own text carries the share at one decimal. A bar that also
    // announced it would be a second copy to round, which is how 1.6% was
    // announced as 2% twice already.
    expect(renderBar("Education", EDUCATION).getAttribute("aria-hidden")).toBe("true");
  });

  test("claims no widget role and carries no value attribute to be rounded", () => {
    const bar = renderBar("Education", EDUCATION);
    expect(bar.getAttribute("role")).toBeNull();
    for (const attribute of ["aria-valuetext", "aria-valuenow", "aria-valuemax", "aria-valuemin"]) {
      expect(bar.getAttribute(attribute)).toBeNull();
    }
  });

  test("its subtree states no percentage in text either", () => {
    const bar = renderBar("Education", EDUCATION);
    expect(bar.textContent ?? "").toBe("");
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

  test("the fill keeps the full share, undistorted by any rounding", () => {
    // 1.631% and 21.192%, not 2% and 21%. The width is now the only place
    // the precision is observable, so it is the place that pins it.
    expect(fillPercent(renderBar("Education", EDUCATION))).not.toBeCloseTo(2, 1);
    expect(fillPercent(renderBar("Business", BUSINESS))).toBeCloseTo(21.193, 3);
  });

  test("a group with no share draws nothing rather than a sliver", () => {
    expect(fillPercent(renderBar("Cash", 0))).toBe(0);
  });

  test("the whole portfolio fills the bar exactly", () => {
    expect(fillPercent(renderBar("Everything", 1))).toBe(100);
  });
});
