import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { loadAnalytics } from "../data";
import { ContributionsChart, GENERIC_LIMIT_DASH } from "./ContributionsChart";
import { DERIVED_DASH } from "./source";

/**
 * Against the real committed corpus. The figures pinned here -- 2026's
 * 33,000 RRSP, 8,000 FHSA, 7,000 TFSA and derived 3,000 RESP, the 21,000
 * TFSA of 2025 against a 7,000 generic maximum, and the RESP's absent limit
 * -- are the ones the chart prints, so a corpus change reddens these rather
 * than quietly changing what the page claims.
 */
const analytics = loadAnalytics();

function renderChart() {
  render(<ContributionsChart analytics={analytics} />);
}

function card(group: string): HTMLElement {
  const node = document.querySelector(`[data-contributions-card="${group}"]`);
  if (node === null) throw new Error(`expected a contributions card for ${group}`);
  return node as HTMLElement;
}

function bars(group: string): Element[] {
  return [...card(group).querySelectorAll("[data-contribution-bar]")];
}

function bar(group: string, year: number): Element {
  const found = bars(group).find((node) => node.getAttribute("data-year") === String(year));
  if (found === undefined) throw new Error(`expected a ${group} bar for ${year}`);
  return found;
}

function limitLines(group: string): Element[] {
  return [...card(group).querySelectorAll("[data-limit-line]")];
}

function chart(group: string): HTMLElement {
  return within(card(group)).getByRole("img");
}

afterEach(cleanup);

describe("one card per wrapper, four years each", () => {
  test("draws the four registered wrappers", () => {
    renderChart();
    expect(
      [...document.querySelectorAll("[data-contributions-card]")].map((node) =>
        node.getAttribute("data-contributions-card"),
      ),
    ).toEqual(["TFSA", "RRSP", "FHSA", "RESP"]);
  });

  test("names every year on the axis, drawn or not", () => {
    renderChart();
    const labels = [...card("RESP").querySelectorAll("[data-year-label]")].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(["2023", "2024", "2025", "2026"]);
  });
});

describe("the figures the bars state", () => {
  test("2026: RRSP 33,000, FHSA 8,000, TFSA 7,000, RESP 3,000", () => {
    renderChart();
    expect(card("RRSP").querySelector('[data-year-figure="2026"]')?.textContent).toBe("$33,000.00");
    expect(card("FHSA").querySelector('[data-year-figure="2026"]')?.textContent).toBe("$8,000.00");
    expect(card("TFSA").querySelector('[data-year-figure="2026"]')?.textContent).toBe("$7,000.00");
    expect(card("RESP").querySelector('[data-year-figure="2026"]')?.textContent).toBe("$3,000.00");
  });

  test("2025's TFSA is 21,000 and its RRSP 14,000", () => {
    renderChart();
    expect(card("TFSA").querySelector('[data-year-figure="2025"]')?.textContent).toBe("$21,000.00");
    expect(card("RRSP").querySelector('[data-year-figure="2025"]')?.textContent).toBe("$14,000.00");
  });

  test("2023 and 2024 TFSA are 3,388 and 4,058, with cents kept", () => {
    renderChart();
    expect(card("TFSA").querySelector('[data-year-figure="2023"]')?.textContent).toBe("$3,388.00");
    expect(card("TFSA").querySelector('[data-year-figure="2024"]')?.textContent).toBe("$4,058.00");
  });

  test("the axis is topped by the RRSP's assessed limit and the TFSA's largest year", () => {
    renderChart();
    const ticks = (group: string) =>
      [...card(group).querySelectorAll("text")]
        .map((node) => node.textContent ?? "")
        .filter((text) => text.startsWith("$"));
    expect(ticks("RRSP")).toContain("$80,000");
    expect(ticks("TFSA")).toContain("$20,000");
    expect(ticks("RESP")).toContain("$3,000");
  });

  test("a bar's height is proportional to the figure beneath it", () => {
    renderChart();
    const tall = Number(bar("TFSA", 2025).getAttribute("height"));
    const short = Number(bar("TFSA", 2026).getAttribute("height"));
    expect(tall / short).toBeCloseTo(3, 5);
  });
});

describe("a year with no statement is drawn as nothing, never as zero", () => {
  test("the RESP draws one bar, for the one year it has statements", () => {
    renderChart();
    expect(bars("RESP").map((node) => node.getAttribute("data-year"))).toEqual(["2026"]);
  });

  test("the RRSP draws no bar for 2023 or 2024", () => {
    renderChart();
    expect(bars("RRSP").map((node) => node.getAttribute("data-year"))).toEqual(["2025", "2026"]);
  });

  test("an undrawn year says so in words rather than printing a zero", () => {
    renderChart();
    const text = card("RESP").querySelector('[data-year-figure="2024"]')?.textContent ?? "";
    expect(text).toBe("no statement");
    expect(text).not.toContain("0");
  });
});

describe("the limit line, and the trap it is built around", () => {
  test("the RESP draws no limit line at all, in any year", () => {
    renderChart();
    expect(limitLines("RESP")).toHaveLength(0);
  });

  test("the RESP says in words that it has no annual limit", () => {
    renderChart();
    const note = card("RESP").querySelector("[data-no-limit-note]")?.textContent ?? "";
    expect(note).toContain("no annual contribution limit");
  });

  test("no other wrapper's maximum leaks in as a RESP ceiling", () => {
    renderChart();
    const text = card("RESP").textContent ?? "";
    expect(text).not.toContain("annual maximum");
    expect(text).not.toContain("$7,000.00");
    expect(text).not.toContain("$0.00");
  });

  test("a wrapper with a maximum draws one line per drawn year only", () => {
    renderChart();
    expect(limitLines("TFSA").map((node) => node.getAttribute("data-year"))).toEqual([
      "2023",
      "2024",
      "2025",
      "2026",
    ]);
    expect(limitLines("RRSP").map((node) => node.getAttribute("data-year"))).toEqual([
      "2025",
      "2026",
    ]);
  });

  test("only RRSP 2026 is drawn as assessed", () => {
    renderChart();
    const assessed = [...document.querySelectorAll('[data-limit-line][data-assessed="true"]')];
    expect(assessed).toHaveLength(1);
    expect(assessed[0]?.getAttribute("data-year")).toBe("2026");
    expect(
      assessed[0]?.closest("[data-contributions-card]")?.getAttribute("data-contributions-card"),
    ).toBe("RRSP");
  });

  /**
   * `data-assessed` is a test hook, not a rendered mark. What a reader
   * actually sees is the dash, and without these three the dash, the stroke
   * and the height can all be dropped or halved with a green suite. A
   * generic line rendered solid is the worst of the three: the legend's own
   * words then convert a $7,000 published maximum into an apparent assessed
   * ceiling, and the TFSA's 2025 bar reads as a real over-contribution.
   */
  test("the generic maximum renders dashed and the assessed limit renders solid", () => {
    renderChart();
    for (const line of limitLines("TFSA")) {
      expect(line.getAttribute("stroke-dasharray")).toBe(GENERIC_LIMIT_DASH);
    }
    const assessed = limitLines("RRSP").find((node) => node.getAttribute("data-year") === "2026");
    const generic = limitLines("RRSP").find((node) => node.getAttribute("data-year") === "2025");
    expect(assessed?.getAttribute("stroke-dasharray")).toBeNull();
    expect(generic?.getAttribute("stroke-dasharray")).toBe(GENERIC_LIMIT_DASH);
  });

  test("both limit lines are stroked, so neither renders invisible", () => {
    renderChart();
    for (const line of [...limitLines("TFSA"), ...limitLines("RRSP")]) {
      const stroke = line.getAttribute("stroke") ?? "";
      expect(stroke).not.toBe("");
      expect(stroke).not.toBe("none");
    }
  });

  /**
   * The line's height is a figure, the same as the bar's. Asserting only
   * that it sits above the bar leaves it free to be drawn at half its real
   * value. The ratio is taken against the bar's own baseline, so it pins the
   * figure without pinning the niced domain the axis happens to land on.
   */
  test("the assessed line is drawn at 70,752 against a 33,000 bar, not at some fraction of it", () => {
    renderChart();
    const rrsp = bar("RRSP", 2026);
    const baseline = Number(rrsp.getAttribute("y")) + Number(rrsp.getAttribute("height"));
    const line = limitLines("RRSP").find((node) => node.getAttribute("data-year") === "2026");
    const limitHeight = baseline - Number(line?.getAttribute("y1"));
    const barHeight = baseline - Number(rrsp.getAttribute("y"));
    expect(limitHeight / barHeight).toBeCloseTo(70752 / 33000, 6);
  });

  test("the 2025 TFSA sits above its generic maximum and is never called an over-contribution", () => {
    renderChart();
    const line = limitLines("TFSA").find((node) => node.getAttribute("data-year") === "2025");
    const barTop = Number(bar("TFSA", 2025).getAttribute("y"));
    expect(Number(line?.getAttribute("y1"))).toBeGreaterThan(barTop);
    const text = card("TFSA").textContent ?? "";
    expect(text).not.toContain("over-contribut");
    expect(text).not.toContain("Over");
    expect(text).not.toContain("exceed");
  });

  test("no card labels a bar as an over-contribution", () => {
    renderChart();
    for (const group of ["TFSA", "RRSP", "FHSA", "RESP"]) {
      const text = card(group).textContent ?? "";
      expect(text).not.toContain("over-contribut");
      expect(text).not.toContain("over the limit");
      expect(text).not.toContain("excess");
    }
  });

  test("the only mention of an over-contribution on the page is the legend denying it", () => {
    renderChart();
    const legend = document.querySelector("[data-contributions-legend]")?.textContent ?? "";
    expect(legend).toContain("is not an over-contribution");
    const body = document.body.textContent ?? "";
    expect(body.split("over-contribut")).toHaveLength(2);
  });
});

/**
 * Not a case the committed corpus reaches, and the reason it is written
 * anyway: "no ceiling is drawn" and "this wrapper has no ceiling" are two
 * different claims, and a wrapper with no statements at all produces the
 * first while looking exactly like the second.
 */
describe("a wrapper the corpus covers in no year at all", () => {
  function renderWithoutTfsaAccounts() {
    render(
      <ContributionsChart
        analytics={{
          ...analytics,
          series: analytics.series.filter((account) => account.kind !== "TFSA"),
        }}
      />,
    );
  }

  test("says no statement covers it, and never that it has no annual limit", () => {
    renderWithoutTfsaAccounts();
    const text = card("TFSA").textContent ?? "";
    expect(text).toContain("No statement covers this wrapper");
    expect(text).not.toContain("no annual contribution limit");
    expect(card("TFSA").querySelector("[data-no-limit-note]")).toBeNull();
  });

  test("the provenance note counts only the wrappers that state something", () => {
    renderWithoutTfsaAccounts();
    const text = document.querySelector("[data-contributions-provenance]")?.textContent ?? "";
    expect(text).toContain("2 of 3 wrappers");
    expect(text).not.toContain("of 4 wrappers");
  });
});

describe("stated and derived are drawn differently, and said in words", () => {
  test("a stated wrapper's bars carry no hatch", () => {
    renderChart();
    for (const node of bars("TFSA")) {
      expect(node.getAttribute("data-source")).toBe("stated");
      expect(node.getAttribute("fill")).not.toContain("url(#");
    }
  });

  test("the RESP's derived bar is hatched", () => {
    renderChart();
    const resp = bar("RESP", 2026);
    expect(resp.getAttribute("data-source")).toBe("derived");
    expect(resp.getAttribute("fill")).toContain("url(#");
  });

  /**
   * A fill of `url(#missing)` is a dangling reference: the bar renders
   * unfilled and the assertion that the fill string contains `url(#` stays
   * true. The pattern the fill names has to exist.
   */
  test("the hatch the derived bar's fill names is a pattern that exists in the document", () => {
    renderChart();
    const fill = bar("RESP", 2026).getAttribute("fill") ?? "";
    const id = /^url\(#(.+)\)$/.exec(fill)?.[1];
    expect(id).toBeDefined();
    const pattern = document.getElementById(id ?? "");
    expect(pattern).not.toBeNull();
    expect(pattern?.tagName.toLowerCase()).toBe("pattern");
    expect(pattern?.querySelector("line")).not.toBeNull();
  });

  /**
   * The two dashes carry two different claims across two charts, and the
   * legend text is what actually distinguishes them. A swatch that goes
   * solid under a label reading "Dashed line" breaks the only thing holding
   * the distinction up.
   */
  test("the generic dash is not the derived dash of the returns chart", () => {
    expect(GENERIC_LIMIT_DASH).not.toBe(DERIVED_DASH);
  });

  test("the legend's generic swatch is dashed and its assessed swatch is solid", () => {
    renderChart();
    const legend = document.querySelector("[data-contributions-legend]");
    const generic = legend?.querySelector('[data-legend-swatch="generic"]');
    const assessed = legend?.querySelector('[data-legend-swatch="assessed"]');
    expect(generic?.getAttribute("stroke-dasharray")).toBe(GENERIC_LIMIT_DASH);
    expect(assessed?.getAttribute("stroke-dasharray")).toBeNull();
  });

  test("the RESP card says its figure is derived rather than printed", () => {
    renderChart();
    expect(card("RESP").textContent).toContain("Derived here");
  });

  test("the legend names solid and hatched in words, not by colour", () => {
    renderChart();
    const text = document.querySelector("[data-contributions-legend]")?.textContent ?? "";
    expect(text).toContain("Solid bar");
    expect(text).toContain("stated on the statements");
    expect(text).toContain("Hatched bar");
    expect(text).toContain("derived here");
    expect(text).toContain("No bar");
  });

  test("the legend says a bar at or past the annual maximum is not an over-contribution", () => {
    renderChart();
    const text = document.querySelector("[data-contributions-legend]")?.textContent ?? "";
    expect(text).toContain("Carry-forward");
    expect(text).toContain("not an over-contribution");
  });

  test("the provenance note counts the wrappers rather than asserting a number", () => {
    renderChart();
    const text = document.querySelector("[data-contributions-provenance]")?.textContent ?? "";
    expect(text).toContain("3 of 4 wrappers");
    expect(text).toContain("RESP");
    expect(text).toContain("excludes government grants");
  });
});

describe("the readout carries full precision, in one copy", () => {
  function focusAndStep(group: string): string {
    const svg = chart(group);
    fireEvent.keyDown(svg, { key: "End" });
    return svg.getAttribute("aria-label") ?? "";
  }

  test("the accessible name, the announcement and the tooltip state one identical figure", () => {
    renderChart();
    const label = focusAndStep("RESP");
    expect(label).toContain("Contributed $3,000.00");
    const announced = card("RESP").querySelector("[data-cursor-announcement]")?.textContent ?? "";
    expect(announced).toContain("Contributed $3,000.00");
    const tooltip = card("RESP").querySelector("[data-chart-tooltip]")?.textContent ?? "";
    expect(tooltip).toContain("Contributed $3,000.00");
  });

  test("the RRSP's assessed 2026 states its real remaining", () => {
    renderChart();
    expect(focusAndStep("RRSP")).toContain("$37,752.00 remaining of the $70,752.00 assessed limit");
  });

  test("a generic maximum announces the carry-forward caveat instead of a remaining", () => {
    renderChart();
    const svg = chart("TFSA");
    fireEvent.keyDown(svg, { key: "Home" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    const label = svg.getAttribute("aria-label") ?? "";
    expect(label).toContain("Contributed $21,000.00");
    expect(label).toContain("Against the $7,000.00 annual maximum");
    expect(label).toContain("not an over-contribution");
  });

  test("a year with no statement announces the absence, not a zero", () => {
    renderChart();
    const svg = chart("RESP");
    fireEvent.keyDown(svg, { key: "Home" });
    const label = svg.getAttribute("aria-label") ?? "";
    expect(label).toContain("No statement for this year");
    expect(label).not.toContain("$0.00");
  });

  test("the multi-month lump behind RRSP 2025 is announced as covering eleven months", () => {
    renderChart();
    const svg = chart("RRSP");
    fireEvent.keyDown(svg, { key: "Home" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    const label = svg.getAttribute("aria-label") ?? "";
    expect(label).toContain("$12,000.00 stated at Nov 2025 covers 11 months");
    expect(label).toContain("3 months state no contributions figure");
  });
});

describe("the accessible summary each card carries", () => {
  test("names the wrapper, its range and how many years actually have a figure", () => {
    renderChart();
    const label = chart("RESP").getAttribute("aria-label") ?? "";
    expect(label).toContain("RESP contributions by calendar year, 2023 to 2026");
    expect(label).toContain("1 of 4 years has a figure");
    expect(label).toContain("left blank rather than drawn as zero");
  });

  test("says the RESP has no ceiling drawn", () => {
    renderChart();
    expect(chart("RESP").getAttribute("aria-label")).toContain("no annual contribution limit");
  });

  test("the chart is a graphic with a title and is reachable by keyboard", () => {
    renderChart();
    const svg = chart("TFSA");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(within(card("TFSA")).getByTitle("TFSA contributions by calendar year")).toBeDefined();
  });

  test("is responsive, sized by its viewBox rather than a fixed pixel width", () => {
    renderChart();
    const svg = chart("TFSA");
    expect(svg.getAttribute("viewBox")).toBe("0 0 720 260");
    expect(svg.getAttribute("width")).toBeNull();
  });
});
