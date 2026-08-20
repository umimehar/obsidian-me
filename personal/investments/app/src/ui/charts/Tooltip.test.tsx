import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { formatCurrency } from "../format";
import { expectNoCoarseForm } from "../testSupport/coarseForm";
import {
  ChartTooltip,
  CursorAnnouncement,
  linesToTooltipContent,
  tooltipAnchorStyle,
  tooltipAnnouncement,
  tooltipContent,
} from "./Tooltip";

/** The real corpus's last point: 2026-06, all eleven counted accounts reporting. */
const LAST = { marketValue: 241739.67, bookCost: 223675.08, accountCount: 11 };

describe("tooltipContent for a stated month", () => {
  test("names the month, in the same short form the axis uses", () => {
    expect(tooltipContent("2026-06", LAST, 11).header).toBe("Jun 2026");
  });

  test("prints the market value to the cent, never rounded to the axis's precision, as its own row", () => {
    // $241,740 is what the 0-decimal axis formatter says. The chart has
    // announced that figure for this exact point once already.
    const content = tooltipContent("2026-06", LAST, 11);
    expect(content.rows).toContainEqual({ label: "Market value", value: "$241,739.67" });
    expectNoCoarseForm(content.rows.map((row) => row.value).join(" "), LAST.marketValue);
  });

  test("prints the book cost to the cent as its own row, separate from its caveat", () => {
    const content = tooltipContent("2026-06", LAST, 11);
    expect(content.rows).toContainEqual({ label: "Book cost", value: "$223,675.08" });
    // The row is the figure alone -- no caveat welded onto it as a run-on.
    const bookRow = content.rows.find((row) => row.label === "Book cost");
    expect(bookRow?.value).not.toMatch(/approximate/i);
  });

  test("states the book-cost caveat as its own footnote, not deleted, only relocated", () => {
    const content = tooltipContent("2026-06", LAST, 11);
    const caveat = content.footnotes.find((line) => /approximate/i.test(line));
    expect(caveat).toBeDefined();
    expect(caveat).toMatch(/USD holdings/i);
    expect(caveat).toMatch(/not a filing figure/i);
  });

  test("states how many of the counted accounts reported that month, as a footnote", () => {
    expect(tooltipContent("2026-06", LAST, 11).footnotes).toContain(
      "11 of 11 accounts reported this month",
    );
  });

  test("an early month says it reflects fewer accounts, rather than implying a drop", () => {
    // 2023-06 is two accounts of the eleven, open and unfunded.
    const content = tooltipContent("2023-06", { marketValue: 0, bookCost: 0, accountCount: 2 }, 11);
    expect(content.footnotes).toContain("2 of 11 accounts reported this month");
  });

  test("a single reporting account reads as one account, not one accounts", () => {
    const content = tooltipContent(
      "2026-01",
      { marketValue: 10, bookCost: 10, accountCount: 1 },
      1,
    );
    expect(content.footnotes).toContain("1 of 1 account reported this month");
  });

  test("a real zero balance is stated as a figure, since it is one", () => {
    // 2023-06 really is $0.00 across two open, unfunded accounts. That is a
    // known figure and must read differently from a month with no statement.
    const content = tooltipContent("2023-06", { marketValue: 0, bookCost: 0, accountCount: 2 }, 11);
    expect(content.rows).toContainEqual({ label: "Market value", value: "$0.00" });
    expect(content.footnotes.join(" ")).not.toMatch(/no statement/i);
  });
});

describe("tooltipContent for a month with no statement", () => {
  test("says there is no statement, states no figure at all, and has nothing to align", () => {
    const content = tooltipContent("2024-02", null, 11);
    expect(content.header).toBe("Feb 2024");
    expect(content.rows).toEqual([]);
    expect(content.footnotes).toEqual(["No statement for this month"]);
    // Not $0.00, and not a neighbour's figure interpolated across the gap.
    expect(content.footnotes.join(" ")).not.toContain("$");
    expect(content.footnotes.join(" ")).not.toMatch(/accounts? reported/);
  });
});

describe("tooltipAnnouncement, the single sentence spoken for a tooltipContent value", () => {
  test("joins header, rows and footnotes the same way the old flat line list did", () => {
    const content = tooltipContent("2026-06", LAST, 11);
    expect(tooltipAnnouncement(content)).toBe(
      "Jun 2026. Market value $241,739.67. Book cost $223,675.08. " +
        "11 of 11 accounts reported this month. " +
        "Book cost is approximate for USD holdings and not a filing figure.",
    );
  });

  test("the gap month reads as one sentence too", () => {
    expect(tooltipAnnouncement(tooltipContent("2024-02", null, 11))).toBe(
      "Feb 2024. No statement for this month.",
    );
  });

  // The property this project actually cares about: no second `formatCurrency`
  // call anywhere between what is rendered and what is spoken. Walking the
  // structure and comparing character for character is what proves that,
  // rather than eyeballing one hand-written expected string.
  test("every figure the announcement speaks appears character for character in a rendered row, in no coarser form", () => {
    const content = tooltipContent("2026-06", LAST, 11);
    const announced = tooltipAnnouncement(content);
    for (const row of content.rows) {
      expect(announced).toContain(row.value);
    }
    expect(announced).toContain(formatCurrency(LAST.marketValue));
    expect(announced).toContain(formatCurrency(LAST.bookCost));
    expectNoCoarseForm(announced, LAST.marketValue);
    expectNoCoarseForm(announced, LAST.bookCost);
  });
});

describe("linesToTooltipContent, the adapter every other chart's tooltip renders through", () => {
  test("the first line becomes the header, the rest become footnotes, no rows", () => {
    const content = linesToTooltipContent(["Gap $100.00, approximate", "2 accounts reported"]);
    expect(content).toEqual({
      header: "Gap $100.00, approximate",
      rows: [],
      footnotes: ["2 accounts reported"],
    });
  });

  test("an empty line list has an empty header rather than throwing", () => {
    expect(linesToTooltipContent([])).toEqual({ header: "", rows: [], footnotes: [] });
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
});

describe("ChartTooltip, given the new structured content", () => {
  test("renders the header, both rows' labels and values, and both footnotes", () => {
    const content = tooltipContent("2026-06", LAST, 11);
    render(<ChartTooltip content={content} />);
    expect(screen.getByText("Jun 2026")).toBeDefined();
    expect(screen.getByText("Market value")).toBeDefined();
    expect(screen.getByText("$241,739.67")).toBeDefined();
    expect(screen.getByText("Book cost")).toBeDefined();
    expect(screen.getByText("$223,675.08")).toBeDefined();
    expect(screen.getByText("11 of 11 accounts reported this month")).toBeDefined();
    expect(
      screen.getByText("Book cost is approximate for USD holdings and not a filing figure"),
    ).toBeDefined();
  });

  test("draws a separator between the header and the row column, and another before the footnotes", () => {
    const content = tooltipContent("2026-06", LAST, 11);
    render(<ChartTooltip content={content} />);
    const tooltip = document.querySelector("[data-chart-tooltip]");
    expect(tooltip?.querySelectorAll("hr").length).toBe(2);
  });

  test("the gap tooltip renders the no-statement wording, no money, and no separator", () => {
    render(<ChartTooltip content={tooltipContent("2024-02", null, 11)} />);
    expect(screen.getByText("No statement for this month")).toBeDefined();
    expect(document.body.textContent ?? "").not.toContain("$");
    expect(document.querySelector("[data-chart-tooltip]")?.querySelectorAll("hr").length).toBe(0);
  });

  test("figures use tabular-nums, so the two rows line up digit for digit", () => {
    // A wiring proxy, not a rendered-column proof: happy-dom has no layout
    // engine, so it cannot show the two figures visually aligned the way a
    // browser measurement can. What this DOES prove is that the property
    // that makes alignment possible is actually set on the value cells.
    render(<ChartTooltip content={tooltipContent("2026-06", LAST, 11)} />);
    const marketValue = screen.getByText("$241,739.67");
    expect(marketValue.style.fontVariantNumeric).toBe("tabular-nums");
  });

  test("the row-bearing tooltip has a minimum and maximum width; the flat-line tooltip keeps neither", () => {
    render(<ChartTooltip content={tooltipContent("2026-06", LAST, 11)} />);
    const withRows = document.querySelector("[data-chart-tooltip]");
    if (!(withRows instanceof HTMLElement)) throw new Error("expected the tooltip to render");
    expect(withRows.style.minWidth).toBe("300px");
    expect(withRows.style.maxWidth).toBe("340px");
    // border-box, so 300/340 are the true rendered footprint (border and
    // padding included), not just the content box -- see the fix report for
    // the browser measurement that depends on this.
    expect(withRows.style.boxSizing).toBe("border-box");
  });

  test("is hidden from assistive tech, because the announcement speaks the same words", () => {
    // Two spoken copies of one figure is how the figures drifted apart
    // before. CursorAnnouncement is the single announced copy.
    render(<ChartTooltip content={tooltipContent("2026-06", LAST, 11)} />);
    expect(document.querySelector("[data-chart-tooltip]")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  test("keys repeated footnotes apart, so React raises no duplicate-key warning", () => {
    // Keying on the footnote's own text renders both children and warns,
    // which the zero-warnings policy does not allow. React only complains
    // through console.error, so that is where the assertion has to look.
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      render(
        <ChartTooltip
          content={{ header: "Jun 2026", rows: [], footnotes: ["Repeated", "Repeated"] }}
        />,
      );
    } finally {
      console.error = original;
    }
    expect(screen.getAllByText("Repeated").length).toBe(2);
    expect(errors.map((args) => args.join(" ")).join(" ")).not.toMatch(/same key/i);
  });

  test("still renders a chart's own flat line list, unchanged, through the lines prop", () => {
    // The five charts that were not part of this redesign (return rates,
    // contributions, cashflow, cost gap, projection) still pass `lines`
    // directly. Nothing about their own tooltip functions changed.
    render(<ChartTooltip lines={["Gap $100.00, approximate", "2 accounts reported this month"]} />);
    expect(screen.getByText("Gap $100.00, approximate")).toBeDefined();
    expect(screen.getByText("2 accounts reported this month")).toBeDefined();
    expect(document.querySelector("[data-chart-tooltip]")?.querySelectorAll("hr").length).toBe(0);
  });
});

describe("CursorAnnouncement, given the new structured content", () => {
  test("is a polite live region, so a move along the series is spoken", () => {
    render(<CursorAnnouncement content={tooltipContent("2026-06", LAST, 11)} />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  test("speaks exactly what tooltipAnnouncement produces for the same content", () => {
    const content = tooltipContent("2026-06", LAST, 11);
    render(<CursorAnnouncement content={content} />);
    expect(screen.getByRole("status").textContent).toBe(tooltipAnnouncement(content));
    expect(screen.getByRole("status").textContent).toContain("$241,739.67");
  });

  test("stays in the tree when the cursor is away, since a region added late is not announced", () => {
    render(<CursorAnnouncement content={null} />);
    const region = screen.getByRole("status");
    expect(region).toBeDefined();
    expect(region.textContent).toBe("");
  });

  test("is off screen rather than display:none, which would silence it", () => {
    render(<CursorAnnouncement content={{ header: "Jun 2026", rows: [], footnotes: [] }} />);
    const region = screen.getByRole("status");
    if (!(region instanceof HTMLElement)) throw new Error("expected an html live region");
    expect(region.style.display).not.toBe("none");
    expect(region.style.position).toBe("absolute");
    expect(region.style.clipPath).toBe("inset(50%)");
  });

  test("still speaks a chart's own flat line list, unchanged, through the lines prop", () => {
    render(<CursorAnnouncement lines={["Gap $100.00, approximate", "2 accounts reported"]} />);
    expect(screen.getByRole("status").textContent).toBe(
      "Gap $100.00, approximate. 2 accounts reported.",
    );
  });

  test("an empty flat line list still announces nothing, through the lines prop", () => {
    render(<CursorAnnouncement lines={[]} />);
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
