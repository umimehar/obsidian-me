import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { loadAnalytics } from "../data";
import { ReturnsChart } from "./ReturnsChart";

/**
 * Against the real committed corpus. The figures pinned here -- 2 of 14
 * accounts stated, 21 stated points, -4.01% in Mar 2026, 47.31% in Jan 2025 --
 * are the ones the view prints, so a corpus change reddens these rather than
 * quietly changing what the page claims.
 */
const analytics = loadAnalytics();

function renderChart() {
  render(<ReturnsChart returns={analytics.returns} series={analytics.series} />);
}

/** One account's card, found by the masked short id it is keyed on. */
function card(shortId: string): HTMLElement {
  const node = document.querySelector(`[data-returns-card="${shortId}"]`);
  if (node === null) throw new Error(`expected a returns card for ${shortId}`);
  return node as HTMLElement;
}

function chart(shortId: string): HTMLElement {
  return within(card(shortId)).getByRole("img");
}

function lines(shortId: string): SVGPathElement[] {
  return [...card(shortId).querySelectorAll("[data-returns-line]")] as unknown as SVGPathElement[];
}

afterEach(cleanup);

describe("provenance on screen", () => {
  test("states in words that 2 of 14 accounts have statement-stated rates", () => {
    renderChart();
    const note = document.querySelector("[data-returns-provenance]");
    expect(note?.textContent).toContain("2 of 14 accounts");
    expect(note?.textContent).toContain("The other 12");
  });

  test("says the other accounts' rates are computed here, not Wealthsimple's own", () => {
    renderChart();
    const text = document.querySelector("[data-returns-provenance]")?.textContent ?? "";
    expect(text).toContain("computed here");
    expect(text).toContain("approximations");
  });
});

describe("the legend states the grammar in words, not by colour", () => {
  test("names solid as stated and dashed as derived, in text", () => {
    renderChart();
    const legend = document.querySelector("[data-returns-legend]");
    const text = legend?.textContent ?? "";
    expect(text).toContain("Solid line");
    expect(text).toContain("stated on the statement");
    expect(text).toContain("Dashed line");
    expect(text).toContain("derived here");
  });

  test("names a break in the line, and says nothing is drawn at zero", () => {
    renderChart();
    const text = document.querySelector("[data-returns-legend]")?.textContent ?? "";
    expect(text).toContain("break in a line");
    expect(text).toContain("Nothing is drawn at zero");
  });
});

describe("stated and derived draw differently", () => {
  test("a stated account's lines are solid", () => {
    renderChart();
    const drawn = lines("9710");
    expect(drawn.length).toBeGreaterThan(0);
    for (const path of drawn) {
      expect(path.getAttribute("data-source")).toBe("stated");
      expect(path.getAttribute("stroke-dasharray")).toBeNull();
    }
  });

  test("a derived account's lines are dashed", () => {
    renderChart();
    const drawn = lines("d77c");
    expect(drawn.length).toBeGreaterThan(0);
    for (const path of drawn) {
      expect(path.getAttribute("data-source")).toBe("derived");
      expect(path.getAttribute("stroke-dasharray")).toBe("5 4");
    }
  });

  test("each card says its source in words on a badge", () => {
    renderChart();
    expect(card("9710").querySelector("[data-returns-source]")?.textContent).toBe(
      "Stated on statements",
    );
    expect(card("d77c").querySelector("[data-returns-source]")?.textContent).toBe("Derived here");
  });

  test("only the two stated accounts are drawn solid", () => {
    renderChart();
    const solid = [...document.querySelectorAll('[data-returns-line][data-source="stated"]')];
    const cards = new Set(
      solid.map((path) => path.closest("[data-returns-card]")?.getAttribute("data-returns-card")),
    );
    expect([...cards].sort()).toEqual(["9710", "d6d9"]);
  });
});

describe("a gap breaks the line and is never drawn at zero", () => {
  test("the managed RRSP draws one run, not a line across the months with no rate", () => {
    renderChart();
    // 2025-11, 2026-03 and 2026-04 print no current-period rate.
    const drawn = lines("d6d9");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.getAttribute("d")?.split("L")).toHaveLength(3);
  });

  test("no plotted point sits on the zero line unless its rate really is zero", () => {
    renderChart();
    // The zero gridline is positioned by its group's translate, the same way
    // every other tick is, so its y comes from there.
    const transform =
      document.querySelector("[data-zero-line]")?.parentElement?.getAttribute("transform") ?? "";
    const zeroY = Number(/translate\(0,([\d.]+)\)/.exec(transform)?.[1]);
    expect(Number.isNaN(zeroY)).toBe(false);
    // 129 dots for 127 plotted months would mean two nulls got drawn.
    const dots = document.querySelectorAll("[data-returns-dot]");
    expect(dots).toHaveLength(127);
    const onZero = [...dots].filter((dot) => Number(dot.getAttribute("cy")) === zeroY);
    // The six genuine 0.00% months on the two Chequing accounts, and no others.
    expect(onZero).toHaveLength(6);
  });

  test("no cursor marker is drawn on a month with no figure", () => {
    renderChart();
    const svg = chart("d77c");
    // Jun 2023, the first month, has no earlier statement to compare against.
    fireEvent.keyDown(svg, { key: "Home" });
    expect(card("d77c").querySelector("[data-cursor-marks]")).not.toBeNull();
    expect(card("d77c").querySelector("[data-cursor-marker]")).toBeNull();
    // Jun 2026 does have a figure, so the same crosshair gains its dot.
    fireEvent.keyDown(svg, { key: "End" });
    expect(card("d77c").querySelector("[data-cursor-marker]")).not.toBeNull();
  });

  test("an account with no computable month draws no line and says why", () => {
    renderChart();
    // Crypto has one statement, so there is nothing earlier to compare against.
    expect(lines("e2d6")).toHaveLength(0);
    expect(card("e2d6").textContent).toContain("no earlier statement to compare against");
  });
});

describe("the audited figures are visible, not only on hover", () => {
  test("a stated card prints its latest month and since-inception rate", () => {
    renderChart();
    expect(card("9710").querySelector("[data-stated-headline]")?.textContent).toBe(
      "Latest statement, Mar 2026: this month -4.01%, since inception 12.15%.",
    );
  });

  test("the visible figures keep two decimals, same as the readout", () => {
    renderChart();
    const text = card("9710").querySelector("[data-stated-headline]")?.textContent ?? "";
    expect(text).not.toContain("-4%");
    expect(text).not.toContain("12%");
    expect(text).not.toContain("12.2%");
  });

  test("a statement with no month rate says so, never 0.00%", () => {
    renderChart();
    const text = card("d6d9").querySelector("[data-stated-headline]")?.textContent ?? "";
    expect(text).toBe(
      "Latest statement, Apr 2026: no rate stated for this month, since inception 10.31%.",
    );
    expect(text).not.toContain("0.00%");
  });

  test("only the two stated accounts carry one, since only they have a statement rate", () => {
    renderChart();
    const headlines = [...document.querySelectorAll("[data-stated-headline]")].map((node) =>
      node.closest("[data-returns-card]")?.getAttribute("data-returns-card"),
    );
    expect(headlines.sort()).toEqual(["9710", "d6d9"]);
  });
});

describe("a near-flat card says its range in words", () => {
  test("the managed RRSP states the range its 0.24 point span cannot show", () => {
    renderChart();
    expect(card("d6d9").querySelector("[data-flat-range]")?.textContent).toBe(
      "Every month with a figure falls between -0.07% and 0.17%, so the line is flat on the shared axis.",
    );
  });

  test("an account whose every month is the same rate reads as a single figure", () => {
    renderChart();
    // Chequing 18a3 sat still: both its computable months are 0.00%.
    expect(card("18a3").querySelector("[data-flat-range]")?.textContent).toBe(
      "Every month with a figure is 0.00%, so the line is flat on the shared axis.",
    );
  });

  test("an account with a real spread gets no note, so the note stays meaningful", () => {
    renderChart();
    // The self-directed TFSA spans 20.6 points and the managed TFSA 51.3.
    expect(card("d77c").querySelector("[data-flat-range]")).toBeNull();
    expect(card("9710").querySelector("[data-flat-range]")).toBeNull();
  });

  test("exactly the four cards whose span is under 2% of the shared axis carry one", () => {
    renderChart();
    const flat = [...document.querySelectorAll("[data-flat-range]")].map((node) =>
      node.closest("[data-returns-card]")?.getAttribute("data-returns-card"),
    );
    expect(flat.sort()).toEqual(["18a3", "2b74", "8cd3", "d6d9"]);
  });
});

describe("the rate axis", () => {
  test("labels its ticks in whole percent, the one place a rate is rounded", () => {
    renderChart();
    const ticks = [...card("9710").querySelectorAll("text")].map((node) => node.textContent);
    expect(ticks).toContain("0%");
    // Never "0.00%" on an axis: the two-decimal precision belongs to the
    // figures a reader can actually read off a point, not to a gridline.
    for (const tick of ticks) expect(tick).not.toMatch(/\.\d/);
  });

  test("the domain holds every month, so -20.83% is not clipped below the box", () => {
    renderChart();
    // 200 tall less the 12 top and 24 bottom margins. A zero-floored y domain
    // would put every negative month below this floor, off the chart.
    const innerHeight = 164;
    const ys = [...document.querySelectorAll("[data-returns-dot]")].map((dot) =>
      Number(dot.getAttribute("cy")),
    );
    expect(ys).toHaveLength(127);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(innerHeight);
    // And the negatives really do sit below the zero line, not clamped onto it.
    const transform =
      document.querySelector("[data-zero-line]")?.parentElement?.getAttribute("transform") ?? "";
    const zeroY = Number(/translate\(0,([\d.]+)\)/.exec(transform)?.[1]);
    expect(ys.filter((y) => y > zeroY).length).toBeGreaterThan(0);
  });
});

describe("the accessible summary", () => {
  test("names the account, its source and how many months actually have a figure", () => {
    renderChart();
    const label = chart("9710").getAttribute("aria-label") ?? "";
    expect(label).toContain("TFSA (managed) monthly return rates");
    expect(label).toContain("stated on Wealthsimple statements");
    expect(label).toContain("from Jan 2025 to Mar 2026");
    expect(label).toContain("15 of 15 months have a figure");
  });

  test("a derived account's summary says the rates are computed here", () => {
    renderChart();
    const label = chart("d77c").getAttribute("aria-label") ?? "";
    expect(label).toContain("derived here rather than stated on a statement");
    expect(label).toContain("from Jun 2023 to Jun 2026");
    expect(label).toContain("34 of 37 months have a figure");
    expect(label).toContain("left blank rather than drawn as zero");
  });

  test("an account whose every month has a figure omits the blank-months clause", () => {
    renderChart();
    expect(chart("9710").getAttribute("aria-label")).not.toContain("left blank");
  });
});

describe("the cursor announces the rate at the printed precision", () => {
  test("a stated month announces two decimals, not a rounded whole percent", () => {
    renderChart();
    const svg = chart("9710");
    fireEvent.keyDown(svg, { key: "Home" });
    // Jan 2025 states 47.31% for the month and 13.41% since inception.
    const spoken = card("9710").querySelector("[data-cursor-announcement]")?.textContent ?? "";
    expect(spoken).toContain("This month 47.31%");
    expect(spoken).toContain("Since inception 13.41%");
    expect(spoken).not.toContain("47%");
  });

  test("a negative stated month keeps its sign in both the tooltip and the announcement", () => {
    renderChart();
    const svg = chart("9710");
    fireEvent.keyDown(svg, { key: "End" });
    // The last stated month, Mar 2026, is -4.01%.
    expect(card("9710").querySelector("[data-cursor-announcement]")?.textContent).toContain(
      "This month -4.01%",
    );
    expect(card("9710").querySelector("[data-chart-tooltip]")?.textContent).toContain(
      "This month -4.01%",
    );
  });

  test("a null horizon is announced as not applicable, never as 0.00%", () => {
    renderChart();
    const svg = chart("d6d9");
    fireEvent.keyDown(svg, { key: "Home" });
    const spoken = card("d6d9").querySelector("[data-cursor-announcement]")?.textContent ?? "";
    // Nov 2025 is the managed RRSP's first statement: no month rate, no one
    // year rate, and -4.68% since inception.
    expect(spoken).toContain("No rate stated for this month");
    expect(spoken).toContain("Since inception -4.68%");
    expect(spoken).toContain("Not applicable at this account's age");
    expect(spoken).not.toContain("0.00%");
  });

  test("a derived month with no figure announces its reason instead of a rate", () => {
    renderChart();
    const svg = chart("d77c");
    fireEvent.keyDown(svg, { key: "Home" });
    const spoken = card("d77c").querySelector("[data-cursor-announcement]")?.textContent ?? "";
    expect(spoken).toContain("Jun 2023");
    expect(spoken).toContain("No figure: no earlier statement to compare against");
    expect(spoken).not.toContain("0.00%");
  });

  test("the visible tooltip and the accessible name carry the same words", () => {
    renderChart();
    const svg = chart("d77c");
    fireEvent.keyDown(svg, { key: "End" });
    const tooltip = card("d77c").querySelector("[data-chart-tooltip]")?.textContent ?? "";
    expect(tooltip).toContain("This month 0.91%");
    expect(svg.getAttribute("aria-label")).toContain("This month 0.91%");
  });
});

describe("the chart is a responsive graphic", () => {
  test("every card scales by viewBox rather than a fixed pixel width", () => {
    renderChart();
    for (const svg of document.querySelectorAll("svg[role='img']")) {
      expect(svg.getAttribute("viewBox")).toBe("0 0 720 200");
      expect(svg.getAttribute("width")).toBeNull();
    }
  });

  test("renders one card per account in the corpus, stated ones first", () => {
    renderChart();
    const cards = [...document.querySelectorAll("[data-returns-card]")].map((node) =>
      node.getAttribute("data-returns-card"),
    );
    expect(cards).toHaveLength(14);
    expect(cards.slice(0, 2)).toEqual(["9710", "d6d9"]);
  });

  test("a Chequing account is marked as excluded from totals, same as the Overview", () => {
    renderChart();
    expect(card("18a3").textContent).toContain("Excluded from totals");
    expect(card("d77c").textContent).not.toContain("Excluded from totals");
  });
});

describe("the empty corpus", () => {
  test("says there is nothing to chart rather than drawing an empty axis", () => {
    render(<ReturnsChart returns={[]} series={[]} />);
    expect(screen.getByText("No return history yet.")).toBeDefined();
    expect(document.querySelector("[data-returns-card]")).toBeNull();
  });
});
