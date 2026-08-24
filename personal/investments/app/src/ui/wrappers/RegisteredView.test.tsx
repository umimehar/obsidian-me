import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen, within } from "@testing-library/react";
import { loadAnalytics } from "../data";
import { RegisteredView } from "./RegisteredView";

/**
 * Renders against the real committed corpus (`data/analytics.json`), the
 * same standard as `Overview.test.tsx`. The figures asserted here are the
 * ones in that file: 2026 TFSA 7000/7000 unassessed, RRSP 33000/70752
 * assessed with a 13600 spousal slice, FHSA 8000/8000 with a 24000/40000
 * lifetime position, RESP 3000 against no annual limit with 550 of CESG.
 */
function renderYear(year: number) {
  render(
    <Theme>
      <RegisteredView analytics={loadAnalytics()} year={year} />
    </Theme>,
  );
}

function card(group: string) {
  const node = document.querySelector(`[data-room-line="${group}"]`);
  if (node === null) throw new Error(`expected a ${group} room line to render`);
  return node as HTMLElement;
}

/**
 * The fill bars inside one group's card. Keyed on `data-share-bar`, not on
 * `role="progressbar"`: the bar no longer claims a role, so a count keyed on
 * the role reads zero whether the bar is there or not and can never fail.
 */
function fillBars(group: string): HTMLElement[] {
  return [...card(group).querySelectorAll("[data-share-bar]")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
}

/** The width of a group's one fill, as a number of percent. */
function fillPercent(group: string): number {
  const bars = fillBars(group);
  const bar = bars[0];
  if (bars.length !== 1 || bar === undefined) {
    throw new Error(`expected exactly one fill in the ${group} card, found ${bars.length}`);
  }
  const fill = bar.querySelector("[data-share-bar-fill]");
  if (!(fill instanceof HTMLElement)) throw new Error(`expected a fill inside the ${group} bar`);
  return Number.parseFloat(fill.style.width);
}

describe("RegisteredView", () => {
  test("a year the corpus does not cover says so rather than rendering nothing", () => {
    renderYear(1999);
    expect(screen.getByText(/no registered wrapper has a statement for 1999/i)).toBeDefined();
    expect(document.querySelectorAll("[data-room-line]").length).toBe(0);
  });

  test("renders one line per registered group in the corpus year", () => {
    renderYear(2026);
    expect(document.querySelectorAll("[data-room-line]").length).toBe(4);
    for (const group of ["TFSA", "RRSP", "FHSA", "RESP"]) {
      expect(card(group)).toBeDefined();
    }
  });

  test("the real 2026 TFSA is full but reports carry-forward as not visible, with no fill", () => {
    renderYear(2026);
    const tfsa = card("TFSA");
    expect(within(tfsa).getByText("$7,000.00")).toBeDefined();
    expect(within(tfsa).getByText(/Against the \$7,000\.00 annual maximum/)).toBeDefined();
    expect(within(tfsa).getByText(/carry-forward not visible/i)).toBeDefined();
    expect(fillBars("TFSA").length).toBe(0);
    expect(within(tfsa).queryByText(/%/)).toBeNull();
    expect(within(tfsa).queryByText(/\bremaining\b/i)).toBeNull();
  });

  test("the real 2026 FHSA pairs an uncertain annual line with a real lifetime one", () => {
    renderYear(2026);
    const fhsa = card("FHSA");
    expect(within(fhsa).getByText("$8,000.00")).toBeDefined();
    expect(within(fhsa).getByText(/Against the \$8,000\.00 annual maximum/)).toBeDefined();
    expect(within(fhsa).getByText(/carry-forward not visible/i)).toBeDefined();
    expect(fillBars("FHSA").length).toBe(0);
    expect(within(fhsa).getByText(/\$24,000\.00 of \$40,000\.00/)).toBeDefined();
    expect(within(fhsa).getByText(/\$16,000\.00 remaining/)).toBeDefined();
  });

  test("the real 2025 TFSA is over its annual maximum and still renders no negative", () => {
    renderYear(2025);
    const tfsa = card("TFSA");
    expect(within(tfsa).getByText("$25,000.00")).toBeDefined();
    expect(within(tfsa).getByText(/carry-forward not visible/i)).toBeDefined();
    expect(within(tfsa).queryByText(/-\$/)).toBeNull();
    expect(fillBars("TFSA").length).toBe(0);
  });

  test("the real 2026 RRSP shows its assessed remaining and says where the figure came from", () => {
    renderYear(2026);
    const rrsp = card("RRSP");
    expect(within(rrsp).getByText(/\$37,752\.00 remaining of \$70,752\.00/)).toBeDefined();
    expect(within(rrsp).getByText(/notice of assessment/i)).toBeDefined();
    expect(within(rrsp).getByText(/\$13,600\.00.*spousal/i)).toBeDefined();
    expect(within(rrsp).getByText(/counts against your own room/i)).toBeDefined();
  });

  test("the one fill the corpus permits reads the true share, not its inverse", () => {
    renderYear(2026);
    // 33,000 of 70,752 assessed room is 46.641% used, and 53.359% is what an
    // inverted fill would draw. The width is the only place this magnitude is
    // observable, since the bar announces nothing.
    expect(fillPercent("RRSP")).toBeCloseTo(46.642, 2);
  });

  test("neither assessed year announces a whole-percent figure of its own", () => {
    // Both real instances. Radix's Progress derived aria-valuetext from the
    // value and rounded it: "47%" against a true 46.641% in 2026, "25%"
    // against 24.921% in 2025. Neither percentage is printed anywhere on
    // either card, so no reader could catch the drift. The money is the
    // figure and the bar is decoration, the ruling ShareBar already made.
    for (const year of [2026, 2025]) {
      renderYear(year);
      const bars = fillBars("RRSP");
      const bar = bars[0];
      if (bars.length !== 1 || bar === undefined) {
        throw new Error(`expected one fill in the ${year} RRSP card, found ${bars.length}`);
      }
      expect(bar.getAttribute("aria-hidden")).toBe("true");
      expect(bar.getAttribute("role")).toBeNull();
      for (const attribute of ["aria-valuetext", "aria-valuenow", "aria-valuemax"]) {
        expect(bar.getAttribute(attribute)).toBeNull();
      }
      cleanup();
    }
  });

  test("no element in the whole view states a percentage on any attribute", () => {
    // The sweep that survives the bar returning with a role, or the figure
    // reappearing on a title or a label elsewhere in the view.
    for (const year of [2026, 2025]) {
      renderYear(year);
      const nodes = [...document.querySelectorAll("[data-room-line], [data-room-line] *")];
      expect(nodes.length).toBeGreaterThan(20);
      for (const node of nodes) {
        for (const attribute of ["aria-valuetext", "aria-label", "title"]) {
          expect(node.getAttribute(attribute) ?? "").not.toMatch(/\d+(\.\d+)?%/);
        }
      }
      cleanup();
    }
  });

  test("the 2025 assessed fill draws its real share, the one announced as 25%", () => {
    renderYear(2025);
    // 15,000 of 60,191 is 24.921%, and the announcement rounded it to a
    // figure a whole 0.079 points away that appeared nowhere on the card.
    expect(fillPercent("RRSP")).toBeCloseTo(24.921, 2);
    expect(fillPercent("RRSP")).not.toBe(25);
    expect(within(card("RRSP")).getByText(/\$45,191\.00 remaining of \$60,191\.00/)).toBeDefined();
  });

  test("the real 2026 RESP has no annual limit, a lifetime position and a CESG line", () => {
    renderYear(2026);
    const resp = card("RESP");
    expect(within(resp).getByText(/no annual contribution limit/i)).toBeDefined();
    expect(within(resp).getByText(/\$3,000\.00 of \$50,000\.00/)).toBeDefined();
    expect(within(resp).getByText(/\$47,000\.00 remaining/)).toBeDefined();
    const cesg = within(resp).getByText(/CESG/i).closest("[data-cesg-line]");
    if (cesg === null) throw new Error("expected a CESG line to render");
    expect(within(cesg as HTMLElement).getByText(/\$550\.00/)).toBeDefined();
    expect(within(cesg as HTMLElement).getByText(/\$7,200\.00/)).toBeDefined();
  });

  test("the real 2026 RESP figure is derived, and says so", () => {
    renderYear(2026);
    expect(within(card("RESP")).getByText(/derived/i)).toBeDefined();
  });

  test("the real 2026 TFSA figure is stated, and carries no derived marker", () => {
    renderYear(2026);
    expect(within(card("TFSA")).queryByText(/derived/i)).toBeNull();
  });

  test("no room line anywhere in the corpus renders a negative figure", () => {
    for (const year of [2023, 2024, 2025, 2026]) {
      renderYear(year);
      expect(screen.queryByText(/-\$/)).toBeNull();
      expect(screen.queryByText(/\$-/)).toBeNull();
      cleanup();
    }
  });
});
