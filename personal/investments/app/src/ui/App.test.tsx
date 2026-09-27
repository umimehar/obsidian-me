import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { GOLDENS } from "../goldens";
import { App } from "./App";
import { formatCurrency, formatGainWithShare } from "./format";
import { clickTab } from "./testSupport/clickTab";
import { coarseForm, expectNoCoarseForm } from "./testSupport/coarseForm";

function roomCard(group: string) {
  const node = document.querySelector(`[data-room-line="${group}"]`);
  if (node === null) throw new Error(`expected a ${group} room line to render`);
  return node as HTMLElement;
}

afterEach(() => {
  window.location.hash = "";
});

describe("App", () => {
  test("the default route renders This month, with the tab marked active", () => {
    render(<App />);
    expect(window.location.hash).toBe("");
    expect(screen.getByRole("tab", { name: /^This month\b/, selected: true })).toBeDefined();
    expect(document.querySelector("[data-month-flows]")).not.toBeNull();
  });

  test("the growth tab holds the returns chart, with its provenance stated", () => {
    render(<App />);
    clickTab("Growth");
    expect(document.querySelectorAll("[data-returns-card]").length).toBe(
      GOLDENS.returnsChartedCount,
    );
    expect(document.querySelector("[data-returns-provenance]")?.textContent).toContain(
      `2 of ${GOLDENS.returnsChartedCount} accounts`,
    );
  });

  test("the contributions tab holds the contributions chart, one card per wrapper", () => {
    render(<App />);
    clickTab("Contributions");
    expect(document.querySelectorAll("[data-contributions-card]").length).toBe(4);
    expect(document.querySelector("[data-contributions-provenance]")?.textContent).toContain(
      "1 of 4 wrappers states every figure it draws",
    );
  });

  test("the contributions tab also holds the monthly cashflow chart", () => {
    render(<App />);
    clickTab("Contributions");
    expect(screen.getByRole("heading", { name: "Monthly cashflow" })).toBeDefined();
    expect(document.querySelectorAll('[data-cashflow-bar="deposit"]').length).toBeGreaterThan(0);
  });

  test("the growth tab also holds the cost gap chart", () => {
    render(<App />);
    clickTab("Growth");
    expect(
      screen.getByRole("heading", { name: "Value at market against value at cost" }),
    ).toBeDefined();
    expect(document.querySelectorAll("[data-cost-gap-bar]").length).toBeGreaterThan(0);
  });

  /**
   * The panel is the mount point, and three charts have been deletable from
   * their panel with the suite green. This asserts the projections view is
   * actually reachable from the tab, drawing both halves of its seam, and
   * defaulting to the 6% assumption rather than the fitted rate.
   */
  test("the future tab holds the projection, seam and all", () => {
    render(<App />);
    clickTab("Future");
    expect(document.querySelector("[data-projection-chart]")).not.toBeNull();
    expect(document.querySelector("[data-seam]")?.getAttribute("data-seam-period")).toBe(
      GOLDENS.projection.seamPeriod,
    );
    expect(document.querySelector("[data-history-line]")).not.toBeNull();
    expect(document.querySelector("[data-projection-line]")).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Today's dollars", checked: true })).toBeDefined();
    expect(document.querySelector("[data-retirement-tile]")).not.toBeNull();
    expect(document.querySelector("[data-apply-fitted]")).toBeNull();
  });

  test("renders the overview on portfolio, the tax view on income, and the room lines on contributions", () => {
    render(<App />);
    clickTab("Portfolio");
    expect(document.querySelector("[data-portfolio-total]")?.textContent).toBe(
      formatCurrency(GOLDENS.portfolio.total),
    );
    expect(document.querySelectorAll("[data-overview-group]").length).toBeGreaterThan(0);

    clickTab("Income");
    expect(document.querySelector("[data-tax-income]")).not.toBeNull();
    expect(document.querySelector("[data-income-year-table]")).not.toBeNull();

    clickTab("Contributions");
    expect(document.querySelectorAll("[data-room-line]").length).toBe(4);
  });

  test("the reconciliation view renders beneath the figures it reconciles", () => {
    render(<App />);
    clickTab("Data");
    expect(document.querySelector("[data-recon-ground-truth]")).not.toBeNull();
    // Every finding but the ground-truth line, which is promoted into the
    // headline card rather than dropped.
    expect(document.querySelectorAll("[data-finding-row]").length).toBe(
      GOLDENS.reconciliation.findingCount - 1,
    );
  });

  test("the year control drives both the room lines and the tax figures", () => {
    render(<App />);
    clickTab("Contributions");
    expect(within(roomCard("TFSA")).getByText("$7,000.00")).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: "2025" }));
    expect(within(roomCard("TFSA")).getByText("$25,000.00")).toBeDefined();

    // Switching tabs proves the year is shared state, not a control local
    // to the contributions panel: the income tab's own tax view already
    // reads 2025 without being touched.
    clickTab("Income");
    const income = document.querySelector("[data-tax-income]");
    if (income === null) throw new Error("expected the tax income section to render");
    expect(
      within(income as HTMLElement).getByText(
        formatCurrency(GOLDENS.incomeByYear["2025"].realizedGains),
      ),
    ).toBeDefined();
  });

  test("the hero and its chart show only on portfolio; other tabs carry the summary strip instead", () => {
    render(<App />);
    clickTab("Portfolio");
    expect(document.querySelector("[data-portfolio-total]")).not.toBeNull();
    expect(document.querySelector("svg[role='img'] title")).not.toBeNull();
    expect(
      [...document.querySelectorAll("svg title")].some(
        (title) => title.textContent === "Portfolio value over time",
      ),
    ).toBe(true);
    expect(document.querySelector("[data-summary-strip]")).toBeNull();

    clickTab("Growth");
    expect(document.querySelector("[data-portfolio-total]")).toBeNull();
    expect(
      [...document.querySelectorAll("svg title")].some(
        (title) => title.textContent === "Portfolio value over time",
      ),
    ).toBe(false);
    const strip = document.querySelector("[data-summary-strip]");
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain(formatCurrency(GOLDENS.portfolio.total));

    // The year filter stays reachable on every tab, growth included.
    expect(screen.getByRole("radiogroup", { name: "Year" })).toBeDefined();
  });

  test("the summary strip on every non-portfolio tab states the gain against book cost", () => {
    render(<App />);
    const gainText = formatGainWithShare(GOLDENS.portfolio.gain, GOLDENS.portfolio.bookCost);

    for (const label of ["Growth", "Income", "Contributions", "Future", "Data"]) {
      clickTab(label);
      const strip = document.querySelector("[data-summary-strip]");
      expect(strip).not.toBeNull();
      expect(strip?.textContent).toContain(gainText);
    }

    // The year filter reaches Data too, not only Growth and Plan.
    clickTab("Data");
    expect(screen.getByRole("radiogroup", { name: "Year" })).toBeDefined();
  });

  test("the portfolio total never changes as the overview lens changes", () => {
    // The strongest single invariant in this codebase: all three lenses
    // regroup the same money, so the headline total above the tabs must
    // never move when the account-grouping lens does.
    render(<App />);
    clickTab("Portfolio");
    const total = () => document.querySelector("[data-portfolio-total]")?.textContent;
    expect(total()).toBe(formatCurrency(GOLDENS.portfolio.total));

    fireEvent.click(screen.getByRole("radio", { name: /account/i }));
    expect(total()).toBe(formatCurrency(GOLDENS.portfolio.total));

    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
    expect(total()).toBe(formatCurrency(GOLDENS.portfolio.total));

    fireEvent.click(screen.getByRole("radio", { name: /registration/i }));
    expect(total()).toBe(formatCurrency(GOLDENS.portfolio.total));
  });
});

/**
 * The headline's book value and gain, from the real committed corpus -- the
 * same figures pinned in `groupGain.test.ts`'s "the registration lens's
 * per-group gains sum to the portfolio-level gap" test, now the third leg
 * of that same cross-check (portfolio-level, group-summed, and rendered
 * DOM all agreeing) rather than a second test asserting the same sum a
 * different way.
 *
 * Scoped with `headlineBlock()` rather than a page-wide query: `Overview`
 * (the default tab) renders its own `GroupGainLine` per card using the same
 * `data-group-book-value`/`data-group-gain` hooks, so an unscoped query
 * would see up to eight of them at once.
 */
/**
 * The headline's "Book value $X" run, as a regex: the label and the figure
 * are separate elements, so a plain string matcher never sees them together.
 */
function bookValueText(): RegExp {
  return new RegExp(
    `Book value ${formatCurrency(GOLDENS.portfolio.bookCost).replace(/[$.]/g, "\\$&")}`,
  );
}

function headlineBlock(): HTMLElement {
  const total = document.querySelector("[data-portfolio-total]");
  const block = total?.parentElement;
  if (!(block instanceof HTMLElement)) throw new Error("expected the headline block to render");
  return block;
}

describe("the headline book value and gain", () => {
  test("prints the corpus's book value and gain, from the same GroupGainLine the cards use", () => {
    render(<App />);
    clickTab("Portfolio");
    const block = within(headlineBlock());
    expect(block.getByText(bookValueText())).toBeDefined();
    const gain = block.getByText(
      formatGainWithShare(GOLDENS.portfolio.gain, GOLDENS.portfolio.bookCost),
    );
    expect(gain).toBeDefined();
    expect(gain.getAttribute("data-accent-color")).toBe("jade");
  });

  test("the USD book cost caveat appears exactly once on every tab, inside its about these numbers note", () => {
    // GroupGainLine used to print this sentence on the headline AND on
    // every group card -- eight or nine repeats of the same caveat on one
    // tab. It now lives once, in the tab's own AboutNumbers disclosure.
    render(<App />);
    for (const tab of ["Portfolio", "Growth", "Income", "Contributions", "Future", "Data"]) {
      clickTab(tab);
      const matches = screen.getAllByText(/An estimate: book cost for USD holdings/);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.closest("[data-about-numbers]")).not.toBeNull();
    }
  });

  test("no figure here announces coarser than what it prints", () => {
    render(<App />);
    clickTab("Portfolio");
    const text = headlineBlock().textContent ?? "";
    for (const figure of [
      GOLDENS.portfolio.total,
      GOLDENS.portfolio.bookCost,
      GOLDENS.portfolio.gain,
    ]) {
      expect(text).toContain(formatCurrency(figure));
      expectNoCoarseForm(text, figure);
    }
    // The coarse form of the gain is asserted explicitly, because when
    // rounding goes UP its digits differ from the precise figure's -- a
    // guard keyed on truncating the precise form could never fire against
    // it. See the precision rule in the investments CLAUDE.md.
    const gain = GOLDENS.portfolio.gain;
    expect(coarseForm(gain)).toBe(`$${Math.round(gain).toLocaleString("en-CA")}`);
  });

  test("the same book value and gain reappear, unchanged, on returning to portfolio", () => {
    // The headline itself now lives only on the Portfolio tab (see the hero
    // and its chart test above); this pins that leaving and coming back
    // does not drift the figures it shows.
    render(<App />);
    for (const label of ["Growth", "Income", "Contributions", "Future", "Data"]) {
      fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${label}\\b`) }), {
        button: 0,
      });
      expect(document.querySelector("[data-summary-strip]")?.textContent).toContain(
        formatCurrency(GOLDENS.portfolio.total),
      );
    }
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Portfolio\b/ }), { button: 0 });
    const block = within(headlineBlock());
    expect(block.getByText(bookValueText())).toBeDefined();
    expect(
      block.getByText(formatGainWithShare(GOLDENS.portfolio.gain, GOLDENS.portfolio.bookCost)),
    ).toBeDefined();
  });

  test("introduces no heading, per the headline-figures-are-not-a-section-name rule", () => {
    // `queryByRole("heading")` over the whole block was wrong: the block's own
    // `<h2>` label ("Portfolio total as of ...") is legitimately inside it, so
    // that query always found a heading and could never pass -- it also hung
    // the whole suite at the 5000ms per-test budget. A direct, scoped
    // `querySelectorAll` is both bounded and more literal about the intent:
    // exactly one heading in the block, and it is the existing section label,
    // not one contributed by the new book value/gain figures.
    render(<App />);
    clickTab("Portfolio");
    const headings = headlineBlock().querySelectorAll("h1, h2, h3, h4, h5, h6");
    expect(headings.length).toBe(1);
    expect(headings[0]?.tagName).toBe("H2");
    expect(headings[0]?.textContent).toMatch(/^Portfolio total/);
  });
});
