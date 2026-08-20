import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ChartTooltip, CursorAnnouncement, tooltipAnchorStyle, tooltipLines } from "./Tooltip";

/** The real corpus's last point: 2026-06, all eleven counted accounts reporting. */
const LAST = { marketValue: 241739.67, bookCost: 223675.08, accountCount: 11 };

describe("tooltipLines for a stated month", () => {
  test("names the month, in the same short form the axis uses", () => {
    expect(tooltipLines("2026-06", LAST, 11)[0]).toBe("Jun 2026");
  });

  test("prints the market value to the cent, never rounded to the axis's precision", () => {
    // $241,740 is what the 0-decimal axis formatter says. The chart has
    // announced that figure for this exact point once already.
    const lines = tooltipLines("2026-06", LAST, 11);
    expect(lines).toContain("Market value $241,739.67");
    expect(lines.join(" ")).not.toContain("$241,740");
  });

  test("prints the book cost to the cent and labels it approximate", () => {
    const lines = tooltipLines("2026-06", LAST, 11);
    const book = lines.find((line) => line.startsWith("Book cost"));
    expect(book).toContain("$223,675.08");
    expect(book).toMatch(/approximate/i);
    expect(book).toMatch(/not a filing figure/i);
  });

  test("states how many of the counted accounts reported that month", () => {
    expect(tooltipLines("2026-06", LAST, 11)).toContain("11 of 11 accounts reported this month");
  });

  test("an early month says it reflects fewer accounts, rather than implying a drop", () => {
    // 2023-06 is two accounts of the eleven, open and unfunded.
    const lines = tooltipLines("2023-06", { marketValue: 0, bookCost: 0, accountCount: 2 }, 11);
    expect(lines).toContain("2 of 11 accounts reported this month");
  });

  test("a single reporting account reads as one account, not one accounts", () => {
    const lines = tooltipLines("2026-01", { marketValue: 10, bookCost: 10, accountCount: 1 }, 1);
    expect(lines).toContain("1 of 1 account reported this month");
  });

  test("a real zero balance is stated as a figure, since it is one", () => {
    // 2023-06 really is $0.00 across two open, unfunded accounts. That is a
    // known figure and must read differently from a month with no statement.
    const lines = tooltipLines("2023-06", { marketValue: 0, bookCost: 0, accountCount: 2 }, 11);
    expect(lines).toContain("Market value $0.00");
    expect(lines.join(" ")).not.toMatch(/no statement/i);
  });
});

describe("tooltipLines for a month with no statement", () => {
  test("says there is no statement, and states no figure at all", () => {
    const lines = tooltipLines("2024-02", null, 11);
    expect(lines[0]).toBe("Feb 2024");
    expect(lines).toContain("No statement for this month");
    // Not $0.00, and not a neighbour's figure interpolated across the gap.
    expect(lines.join(" ")).not.toContain("$");
    expect(lines.join(" ")).not.toMatch(/accounts? reported/);
  });
});

describe("tooltipAnchorStyle", () => {
  test("tracks the cursor as a fraction of the chart, never as a pixel offset", () => {
    // The chart is laid out at width: 100%, so a pixel left would put the
    // readout somewhere else on every viewport.
    expect(tooltipAnchorStyle(400, 800).left).toBe("50%");
    expect(tooltipAnchorStyle(200, 800).left).toBe("25%");
  });

  test("hugs the near edge at either end, so the readout stays inside the card", () => {
    expect(tooltipAnchorStyle(0, 800).transform).toBe("translateX(0)");
    expect(tooltipAnchorStyle(800, 800).transform).toBe("translateX(-100%)");
    expect(tooltipAnchorStyle(400, 800).transform).toBe("translateX(-50%)");
  });

  test("an x past either end clamps rather than positioning off the chart", () => {
    expect(tooltipAnchorStyle(-90, 800).left).toBe("0%");
    expect(tooltipAnchorStyle(9000, 800).left).toBe("100%");
  });

  test("defaults to an absolute overlay that does not reserve layout space", () => {
    const style = tooltipAnchorStyle(400, 800);
    expect(style.position).toBe("absolute");
    expect(style.display).toBeUndefined();
  });

  test("reserveSpace switches to a relative, shrink-to-fit box instead", () => {
    // This is what stops a Radix Card's `contain: paint` from clipping the
    // tooltip: relative positioning keeps the box in normal flow, so the
    // card grows to fit it instead of the tooltip escaping the card's own
    // box. `display: inline-block` alongside it is not decorative -- a
    // plain `position: relative` div stretches to the full container width,
    // which would break the centre/edge math below (it centres on half of
    // that instead of half of the tooltip's own width).
    const style = tooltipAnchorStyle(400, 800, true);
    expect(style.position).toBe("relative");
    expect(style.display).toBe("inline-block");
  });

  test("reserveSpace does not change the horizontal tracking math", () => {
    // The whole point of sharing this function is that the two modes agree
    // on where the cursor is; only how the box is laid out should differ.
    for (const x of [0, 200, 400, 800, 9000]) {
      const overlay = tooltipAnchorStyle(x, 800);
      const reserved = tooltipAnchorStyle(x, 800, true);
      expect(reserved.left).toBe(overlay.left);
      expect(reserved.transform).toBe(overlay.transform);
    }
  });
});

describe("ChartTooltip", () => {
  test("renders every line it was given", () => {
    const lines = tooltipLines("2026-06", LAST, 11);
    render(<ChartTooltip lines={lines} />);
    for (const line of lines) {
      expect(screen.getByText(line)).toBeDefined();
    }
  });

  test("the gap tooltip renders the no-statement wording and no money", () => {
    render(<ChartTooltip lines={tooltipLines("2024-02", null, 11)} />);
    expect(screen.getByText("No statement for this month")).toBeDefined();
    expect(document.body.textContent ?? "").not.toContain("$");
  });

  test("is hidden from assistive tech, because the announcement speaks the same words", () => {
    // Two spoken copies of one figure is how the figures drifted apart
    // before. CursorAnnouncement is the single announced copy.
    render(<ChartTooltip lines={tooltipLines("2026-06", LAST, 11)} />);
    expect(document.querySelector("[data-chart-tooltip]")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  test("keys repeated lines apart, so React raises no duplicate-key warning", () => {
    // Keying on the line's own text renders both children and warns, which
    // the zero-warnings policy does not allow. React only complains through
    // console.error, so that is where the assertion has to look.
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      render(<ChartTooltip lines={["Jun 2026", "Jun 2026"]} />);
    } finally {
      console.error = original;
    }
    expect(screen.getAllByText("Jun 2026").length).toBe(2);
    expect(errors.map((args) => args.join(" ")).join(" ")).not.toMatch(/same key/i);
  });
});

describe("CursorAnnouncement", () => {
  test("is a polite live region, so a move along the series is spoken", () => {
    render(<CursorAnnouncement lines={tooltipLines("2026-06", LAST, 11)} />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  test("speaks the same lines the tooltip prints, in one sentence", () => {
    const lines = tooltipLines("2026-06", LAST, 11);
    render(<CursorAnnouncement lines={lines} />);
    expect(screen.getByRole("status").textContent).toBe(`${lines.join(". ")}.`);
    expect(screen.getByRole("status").textContent).toContain("$241,739.67");
  });

  test("stays in the tree when the cursor is away, since a region added late is not announced", () => {
    render(<CursorAnnouncement lines={[]} />);
    const region = screen.getByRole("status");
    expect(region).toBeDefined();
    expect(region.textContent).toBe("");
  });

  test("is off screen rather than display:none, which would silence it", () => {
    render(<CursorAnnouncement lines={["Jun 2026"]} />);
    const region = screen.getByRole("status");
    if (!(region instanceof HTMLElement)) throw new Error("expected an html live region");
    expect(region.style.display).not.toBe("none");
    expect(region.style.position).toBe("absolute");
    expect(region.style.clipPath).toBe("inset(50%)");
  });
});
