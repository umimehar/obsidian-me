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
    expect(tfsa.querySelectorAll('[role="progressbar"]').length).toBe(0);
    expect(within(tfsa).queryByText(/%/)).toBeNull();
    expect(within(tfsa).queryByText(/\bremaining\b/i)).toBeNull();
  });

  test("the real 2026 FHSA pairs an uncertain annual line with a real lifetime one", () => {
    renderYear(2026);
    const fhsa = card("FHSA");
    expect(within(fhsa).getByText("$8,000.00")).toBeDefined();
    expect(within(fhsa).getByText(/Against the \$8,000\.00 annual maximum/)).toBeDefined();
    expect(within(fhsa).getByText(/carry-forward not visible/i)).toBeDefined();
    expect(fhsa.querySelectorAll('[role="progressbar"]').length).toBe(0);
    expect(within(fhsa).getByText(/\$24,000\.00 of \$40,000\.00/)).toBeDefined();
    expect(within(fhsa).getByText(/\$16,000\.00 remaining/)).toBeDefined();
  });

  test("the real 2025 TFSA is over its annual maximum and still renders no negative", () => {
    renderYear(2025);
    const tfsa = card("TFSA");
    expect(within(tfsa).getByText("$25,000.00")).toBeDefined();
    expect(within(tfsa).getByText(/carry-forward not visible/i)).toBeDefined();
    expect(within(tfsa).queryByText(/-\$/)).toBeNull();
    expect(tfsa.querySelectorAll('[role="progressbar"]').length).toBe(0);
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
    // 33,000 of 70,752 assessed room is 47%, and 53% is what an inverted fill
    // would show. This is the only percentage in the whole view.
    const fill = card("RRSP").querySelector('[role="progressbar"]');
    if (fill === null) throw new Error("expected the assessed RRSP line to render a fill");
    expect(fill.getAttribute("aria-valuetext")).toBe("47%");
    expect(fill.getAttribute("aria-label")).toBe("RRSP room used");
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
