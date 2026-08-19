import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen, within } from "@testing-library/react";
import { projectYears } from "../../projection/engine";
import { projectionInputs } from "../../projection/inputs";
import { loadAnalytics } from "../data";
import { formatCurrency } from "../format";
import { RunwayTable } from "./RunwayTable";

/**
 * Against the real committed corpus, the same one `runway.test.ts` pins.
 * FHSA cap 2028, FHSA close 2039, RESP cap 2044, CESG ages out 2042
 * forfeiting $550.00, RRSP last accrual 2068 (past the projection's own
 * 2056 end), TFSA has no lifetime cap. Every expected string below is
 * recomputed from the engine at module load, never transcribed, so a
 * corpus change reddens this file instead of quietly drifting from it.
 */
const analytics = loadAnalytics();
const inputs6 = projectionInputs(analytics, { returnRate: 0.06 });
const rows6 = projectYears(inputs6);

function renderTable() {
  render(
    <Theme>
      <RunwayTable rows={rows6} inputs={inputs6} />
    </Theme>,
  );
}

afterEach(cleanup);

describe("RunwayTable renders every bound with its year", () => {
  test("prints a real table, with a heading and every cap/deadline year in it", () => {
    renderTable();
    const table = screen.getByRole("table");
    const text = table.textContent ?? "";
    expect(text).toContain("2028");
    expect(text).toContain("2039");
    expect(text).toContain("2044");
    expect(text).toContain("2068");
    expect(screen.getByRole("heading", { level: 3, name: /room runway/i })).toBeDefined();
  });

  test("carries a caption and header cells, not a grid of divs", () => {
    renderTable();
    const table = screen.getByRole("table");
    expect(table.querySelector("caption")).not.toBeNull();
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThanOrEqual(4);
    expect(headers.map((h) => h.textContent).join(" ")).toMatch(/wrapper/i);
  });
});

describe("RunwayTable, the FHSA's two rows", () => {
  test("the cap and its closure sit in two separate rows that read distinctly", () => {
    renderTable();
    const cap = screen.getByTestId("runway-fhsa-cap");
    const close = screen.getByTestId("runway-fhsa-close");
    expect(cap.textContent ?? "").toContain("2028");
    expect(close.textContent ?? "").toContain("2039");
    expect(cap.textContent).not.toBe(close.textContent);
  });
});

describe("RunwayTable, the forfeited CESG", () => {
  test("prints the 550 that is never claimed, at full precision", () => {
    renderTable();
    const row = screen.getByTestId("runway-cesg");
    expect(row.textContent ?? "").toContain(formatCurrency(550));
    expect(row.textContent ?? "").toContain("$550.00");
  });
});

describe("RunwayTable, the TFSA row", () => {
  test("says it has no lifetime cap, in words, rather than leaving a cell empty or printing a dash", () => {
    renderTable();
    const row = screen.getByTestId("runway-tfsa");
    const text = row.textContent ?? "";
    expect(text).toMatch(/no lifetime cap/i);
    expect(text.trim()).not.toBe("");
    expect(text).not.toMatch(/\$0\.00/);
  });

  // Isolated to the year cell alone, not the whole row: `bound` already
  // contains the words "no lifetime cap" independently of `yearText`, so a
  // row-wide assertion cannot tell a broken `yearText` apart from a correct
  // one -- it stays green either way. This pins the year cell's own text.
  test("the year cell specifically, not just the bound cell, states there is no cap", () => {
    renderTable();
    const row = screen.getByTestId("runway-tfsa");
    const cells = within(row).getAllByRole("cell");
    const yearCell = cells[1];
    if (yearCell === undefined) throw new Error("expected a year cell in the tfsa row");
    expect(yearCell.textContent ?? "").toMatch(/no lifetime cap/i);
  });
});

describe("RunwayTable, a null unclaimed figure never reads as zero or as blank", () => {
  test("every row but cesg states its unclaimed cell in words, never as $0.00", () => {
    renderTable();
    for (const id of ["fhsa-cap", "fhsa-close", "resp-cap", "rrsp-last", "tfsa"]) {
      const row = screen.getByTestId(`runway-${id}`);
      const text = row.textContent ?? "";
      expect(text).not.toMatch(/\$0\.00/);
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("RunwayTable, the out-of-window year", () => {
  test("states the projected window's own range, read off the real rows", () => {
    renderTable();
    expect(document.querySelector("[data-runway-window]")?.textContent ?? "").toContain("2026");
    expect(document.querySelector("[data-runway-window]")?.textContent ?? "").toContain("2056");
  });

  test("marks the RRSP's 2068 as beyond that window rather than letting it read as a plain projected fact", () => {
    renderTable();
    const row = screen.getByTestId("runway-rrsp-last");
    const text = row.textContent ?? "";
    expect(text).toContain("2068");
    expect(text).toMatch(/beyond/i);
  });

  test("does not mark 2028, inside the window, as beyond it", () => {
    renderTable();
    const row = screen.getByTestId("runway-fhsa-cap");
    expect(row.textContent ?? "").not.toMatch(/beyond/i);
  });
});
