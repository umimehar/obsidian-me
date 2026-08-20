import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen, within } from "@testing-library/react";
import { buildRunway } from "../../goals/runway";
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
const runway6 = buildRunway(rows6, inputs6);

function findRow(id: string) {
  const row = runway6.find((r) => r.id === id);
  if (row === undefined) throw new Error(`expected buildRunway to produce a ${id} row`);
  return row;
}

function renderTable() {
  render(
    <Theme>
      <RunwayTable rows={rows6} inputs={inputs6} />
    </Theme>,
  );
}

/**
 * The four `<td>` cells of a row, in column order, skipping the leading
 * `<th scope="row">` wrapper cell (`Table.RowHeaderCell` renders `rowheader`,
 * not `cell`, so `getAllByRole("cell")` never includes it). Index 0 is
 * Bound, 1 is Year, 2 is Unclaimed, 3 is Detail.
 */
function dataCells(testId: string): HTMLElement[] {
  return within(screen.getByTestId(testId)).getAllByRole("cell");
}

function cellAt(testId: string, index: number): HTMLElement {
  const cell = dataCells(testId)[index];
  if (cell === undefined) throw new Error(`expected a cell at index ${index} in ${testId}`);
  return cell;
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

  // Pins the literal header row, not just "wrapper appears somewhere" --
  // a header renamed to "Zzz" left the earlier assertion green because it
  // only ever checked for the word "wrapper".
  test("the header row reads exactly Wrapper, Bound, Year, Unclaimed, Detail, in that order", () => {
    renderTable();
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Wrapper",
      "Bound",
      "Year",
      "Unclaimed",
      "Detail",
    ]);
  });

  // Pins row order at the RENDER layer, not just inside buildRunway (which
  // runway.test.ts already covers). `runway.map` reordering to
  // `runway.slice().reverse().map` would leave every per-row testid lookup
  // in this file passing, since each still finds its own row -- only the
  // DOM's own top-to-bottom order catches it.
  test("rows appear in the DOM in buildRunway's own order, not reversed or shuffled by the component", () => {
    renderTable();
    const domIds = [...screen.getByRole("table").querySelectorAll("tbody tr")].map((tr) =>
      tr.getAttribute("data-testid"),
    );
    expect(domIds).toEqual(runway6.map((row) => `runway-${row.id}`));
  });
});

describe("RunwayTable, every row's Wrapper and Bound cells", () => {
  // Closes the gap where neither column had a value assertion: a `{"XX"}`
  // mutation on `row.wrapper` or `row.bound` left every existing test
  // green, since none of them read the Wrapper or Bound cell specifically.
  // Expected values come from `buildRunway` itself, not a transcribed
  // guess, so a real change to task 5's wording moves both sides together.
  for (const row of runway6) {
    test(`${row.id}: Wrapper reads "${row.wrapper}" and Bound reads "${row.bound}"`, () => {
      renderTable();
      const testId = `runway-${row.id}`;
      const wrapperCell = within(screen.getByTestId(testId)).getByRole("rowheader");
      expect(wrapperCell.textContent).toBe(row.wrapper);
      expect(cellAt(testId, 0).textContent).toBe(row.bound);
    });
  }
});

describe("RunwayTable, the Detail column", () => {
  test("the CESG row's Detail cell states buildRunway's own note verbatim", () => {
    renderTable();
    const note = findRow("cesg").note;
    expect(cellAt("runway-cesg", 3).textContent).toBe(note);
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

  test("the Unclaimed cell specifically carries the figure, not some other cell", () => {
    renderTable();
    expect(cellAt("runway-cesg", 2).textContent).toBe(formatCurrency(550));
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
    expect(cellAt("runway-tfsa", 1).textContent ?? "").toMatch(/no lifetime cap/i);
  });

  test("the unclaimed cell states there is no cap concept to leave anything unclaimed against", () => {
    renderTable();
    expect(cellAt("runway-tfsa", 2).textContent ?? "").toMatch(/no lifetime cap/i);
  });
});

describe("RunwayTable, a null unclaimed figure never reads as zero or as blank", () => {
  // Isolated to the Unclaimed cell alone (index 2), never the whole row --
  // a row-wide `trim().length > 0` check is satisfied by the Wrapper,
  // Bound, Year and Detail cells no matter what the Unclaimed cell holds,
  // which is exactly why a dash or a blank Unclaimed cell would have stayed
  // undetected under that assertion. `/[a-z]/i` requires real prose, not
  // just "some character", so a lone dash or an empty string both fail it.
  test("every row but cesg carries real words in its Unclaimed cell, never $0.00, a dash, or blank", () => {
    renderTable();
    for (const id of ["fhsa-cap", "fhsa-close", "resp-cap", "rrsp-last", "tfsa"]) {
      const cell = cellAt(`runway-${id}`, 2);
      const text = cell.textContent ?? "";
      expect(text).not.toMatch(/\$0\.00/);
      expect(text).not.toMatch(/^-+$/);
      expect(text).toMatch(/[a-z]/i);
    }
  });

  test("a reached lifetime cap (fhsa-cap, resp-cap) reads differently from a statutory row with no leftover concept (fhsa-close, rrsp-last)", () => {
    renderTable();
    const capReached = cellAt("runway-fhsa-cap", 2).textContent;
    const statutory = cellAt("runway-fhsa-close", 2).textContent;
    expect(capReached).not.toBe(statutory);
    expect(capReached ?? "").toMatch(/cap/i);
    expect(statutory ?? "").toMatch(/statutory/i);
  });

  test("the statutory rows and the TFSA's no-cap row also read differently from each other", () => {
    renderTable();
    const statutory = cellAt("runway-rrsp-last", 2).textContent;
    const noCap = cellAt("runway-tfsa", 2).textContent;
    expect(statutory).not.toBe(noCap);
  });
});

describe("RunwayTable, the out-of-window year", () => {
  test("states the projected window's own range, read off the real rows", () => {
    renderTable();
    const text = document.querySelector("[data-runway-window]")?.textContent ?? "";
    expect(text).toContain("2026");
    expect(text).toContain("2056");
  });

  // The rate slider moves the chart and every goal card beside this table,
  // but touches none of this table's own years -- a fact stated three times
  // in doc comments and the plan, and nowhere a reader of the page would
  // ever see it. Without a sentence saying so, a reader who drags the rate
  // and watches this table hold still has no way to tell a stale table from
  // a correct one.
  test("states that these years do not move with the return rate, and why", () => {
    renderTable();
    const text = document.querySelector("[data-runway-window]")?.textContent ?? "";
    expect(text).toMatch(/none of the years in this table move when you change the return rate/i);
    expect(text).toMatch(/contribution cap is filled by money going in, not by investment growth/i);
  });

  // A swapped window ("runs from 2056 to 2026") still contains both
  // literal years, so a plain `toContain` pair passes it -- only checking
  // that the start year's occurrence precedes the end year's catches a
  // reversal. `indexOf` on the SAME string a swap would corrupt, not a
  // second copy, so this fails on both a swap and a deletion of either year.
  test("states the range in the right order: the start year before the end year, not swapped", () => {
    renderTable();
    const text = document.querySelector("[data-runway-window]")?.textContent ?? "";
    const startIndex = text.indexOf("2026");
    const endIndex = text.indexOf("2056", startIndex + 1);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(startIndex);
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

describe("RunwayTable, a cap never reached inside a short window", () => {
  // The same one-year fixture `runway.test.ts` uses to exercise
  // `capBound`'s never-reached branch, rendered through the component this
  // time -- proving "Not reached within the window above." actually
  // reaches the screen, not just `buildRunway`'s return value.
  const shortInputs = projectionInputs(analytics, { returnRate: 0.06, years: 1 });
  const shortRows = projectYears(shortInputs);

  test("the FHSA cap's year cell says it was not reached within the window, not a fabricated year", () => {
    render(
      <Theme>
        <RunwayTable rows={shortRows} inputs={shortInputs} />
      </Theme>,
    );
    const cell = cellAt("runway-fhsa-cap", 1);
    expect(cell.textContent ?? "").toMatch(/not reached/i);
  });
});

describe("RunwayTable, every group excluded", () => {
  // Reachable by corpus even though not by today's UI: `PROJECTION_GROUP_ORDER`
  // includes `Corporate`, which `buildRunway` never produces a row for, so a
  // scope covering only `Corporate` yields zero runway rows.
  test("states the absence in words rather than rendering nothing", () => {
    const emptyInputs = { ...inputs6, groups: [] as const };
    const emptyRows = projectYears(emptyInputs);
    render(
      <Theme>
        <RunwayTable rows={emptyRows} inputs={emptyInputs} />
      </Theme>,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.querySelector("[data-runway-empty]")).not.toBeNull();
    // Isolated to the message text itself, not the whole container: the
    // container also holds the h3 heading, whose own non-empty text would
    // keep a row-wide `trim().length > 0` check green even if the message
    // sentence beside it were blanked out.
    const message = document.querySelector("[data-runway-empty-message]")?.textContent ?? "";
    expect(message).toMatch(/[a-z]/i);
    expect(message).not.toMatch(/^-+$/);
    expect(screen.getByRole("heading", { level: 3, name: /room runway/i })).toBeDefined();
  });
});

describe("RunwayTable, an empty rows array is a caller bug, not a state to render", () => {
  // `ProjectionsView` renders its own `EmptyState` whenever `rows` is
  // empty, so this component's one real caller never reaches here with
  // `rows={[]}`. Fails fast rather than rendering a table whose window
  // line and cap rows would misstate a wrapper's own rules (see the
  // comment on `RunwayTable` itself).
  test("throws rather than rendering a table built from no projection", () => {
    expect(() =>
      render(
        <Theme>
          <RunwayTable rows={[]} inputs={inputs6} />
        </Theme>,
      ),
    ).toThrow(/non-empty projection/);
  });
});
