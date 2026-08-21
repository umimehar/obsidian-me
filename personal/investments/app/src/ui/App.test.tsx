import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "./App";
import { formatCurrency } from "./format";
import { coarseForm, expectNoCoarseForm } from "./testSupport/coarseForm";

function roomCard(group: string) {
  const node = document.querySelector(`[data-room-line="${group}"]`);
  if (node === null) throw new Error(`expected a ${group} room line to render`);
  return node as HTMLElement;
}

/**
 * Radix's TabsTrigger renders its label twice -- once visible, once hidden
 * at bold weight, so the visible width never shifts on select -- which
 * doubles the accessible name. Matching a prefix sidesteps that
 * implementation detail. Activation is on pointerdown, not click, so the
 * mousedown event is what a real pointer press sends.
 */
function clickTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${name}\\b`) }), { button: 0 });
}

afterEach(() => {
  window.location.hash = "";
});

describe("App", () => {
  test("the growth tab holds the returns chart, with its provenance stated", () => {
    render(<App />);
    clickTab("Growth");
    expect(document.querySelectorAll("[data-returns-card]").length).toBe(14);
    expect(document.querySelector("[data-returns-provenance]")?.textContent).toContain(
      "2 of 14 accounts",
    );
  });

  test("the growth tab also holds the contributions chart, one card per wrapper", () => {
    render(<App />);
    clickTab("Growth");
    expect(document.querySelectorAll("[data-contributions-card]").length).toBe(4);
    expect(document.querySelector("[data-contributions-provenance]")?.textContent).toContain(
      "1 of 4 wrappers states every figure it draws",
    );
  });

  test("the growth tab also holds the monthly cashflow chart", () => {
    render(<App />);
    clickTab("Growth");
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
  test("the projections tab holds the projection, seam and all", () => {
    render(<App />);
    clickTab("Projections");
    expect(document.querySelector("[data-projection-chart]")).not.toBeNull();
    expect(document.querySelector("[data-seam]")?.getAttribute("data-seam-period")).toBe("2026-06");
    expect(document.querySelector("[data-history-line]")).not.toBeNull();
    expect(document.querySelector("[data-projection-line]")).not.toBeNull();
    expect(document.querySelector("[data-projection-rate]")?.textContent).toBe(
      "Rate in use: 6.00% a year.",
    );
    expect(document.querySelector("[data-projection-end-value]")?.textContent).toBe(
      "$7,636,455.38",
    );
  });

  test("renders the overview, the registered wrappers and the tax view together", () => {
    render(<App />);
    expect(document.querySelector("[data-portfolio-total]")?.textContent).toBe("$241,739.67");

    clickTab("Wrappers");
    expect(document.querySelectorAll("[data-room-line]").length).toBe(4);

    clickTab("Tax");
    expect(document.querySelector("[data-tax-income]")).not.toBeNull();
  });

  test("the reconciliation view renders beneath the figures it reconciles", () => {
    render(<App />);
    clickTab("Reconciliation");
    expect(document.querySelector("[data-recon-ground-truth]")).not.toBeNull();
    // 89 group rows plus the ground-truth line promoted into the headline card.
    expect(document.querySelectorAll("[data-finding-row]").length).toBe(89);
  });

  test("the year control drives both the room lines and the tax figures", () => {
    render(<App />);
    clickTab("Wrappers");
    expect(within(roomCard("TFSA")).getByText("$7,000.00")).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: "2025" }));
    expect(within(roomCard("TFSA")).getByText("$25,000.00")).toBeDefined();

    // Switching tabs proves the year is shared state, not a control local
    // to the wrappers panel: the tax panel's own year control already
    // reads 2025 without being touched.
    clickTab("Tax");
    const income = document.querySelector("[data-tax-income]");
    if (income === null) throw new Error("expected the tax income section to render");
    expect(within(income as HTMLElement).getByText("-$1,067.39")).toBeDefined();
  });

  test("the portfolio total and its chart stay visible on tabs other than overview", () => {
    // The whole reason these two moved out of Overview and above the
    // Tabs is so they never disappear when another panel is selected.
    // Checked on two different non-default tabs, not just one, so the
    // assertion is about every tab rather than one that happens to work.
    render(<App />);

    clickTab("Wrappers");
    expect(document.querySelector("[data-portfolio-total]")?.textContent).toBe("$241,739.67");
    expect(document.querySelector('[role="img"]')).not.toBeNull();

    clickTab("Reconciliation");
    expect(document.querySelector("[data-portfolio-total]")?.textContent).toBe("$241,739.67");
    expect(document.querySelector('[role="img"]')).not.toBeNull();
  });

  test("the portfolio total never changes as the overview lens changes", () => {
    // The strongest single invariant in this codebase: all three lenses
    // regroup the same money, so the headline total above the tabs must
    // never move when the account-grouping lens does.
    render(<App />);
    const total = () => document.querySelector("[data-portfolio-total]")?.textContent;
    expect(total()).toBe("$241,739.67");

    fireEvent.click(screen.getByRole("radio", { name: /account/i }));
    expect(total()).toBe("$241,739.67");

    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
    expect(total()).toBe("$241,739.67");

    fireEvent.click(screen.getByRole("radio", { name: /registration/i }));
    expect(total()).toBe("$241,739.67");
  });
});

/**
 * The headline's book value and gain, from the real committed corpus:
 * market $241,739.67, book $223,675.08, gain +$18,064.59 -- the same
 * figures pinned in `groupGain.test.ts`'s "the registration lens's
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
function headlineBlock(): HTMLElement {
  const total = document.querySelector("[data-portfolio-total]");
  const block = total?.parentElement;
  if (!(block instanceof HTMLElement)) throw new Error("expected the headline block to render");
  return block;
}

describe("the headline book value and gain", () => {
  test("prints book value $223,675.08 and gain +$18,064.59, from the same GroupGainLine the cards use", () => {
    render(<App />);
    const block = within(headlineBlock());
    expect(block.getByText(/Book value \$223,675\.08/)).toBeDefined();
    const gain = block.getByText("+$18,064.59");
    expect(gain).toBeDefined();
    expect(gain.getAttribute("data-accent-color")).toBe("jade");
    // The same wording the group cards render, not a second phrase for the
    // same concept -- and never "profit": nothing has been sold.
    expect(block.getByText(/An estimate: book cost for USD holdings/)).toBeDefined();
  });

  test("no figure here announces coarser than what it prints", () => {
    render(<App />);
    const text = headlineBlock().textContent ?? "";
    expect(text).toContain(formatCurrency(223675.08));
    expect(text).toContain(formatCurrency(18064.59));
    expectNoCoarseForm(text, 223675.08);
    // 18,064.59 coarsens to 18,065 -- different trailing digits than the
    // precise figure, not a truncation, so a guard keyed on "18,064" would
    // never fire against it. Asserted explicitly so this test cannot pass
    // by accident against the wrong coarse form.
    expect(coarseForm(18064.59)).toBe("$18,065");
    expectNoCoarseForm(text, 18064.59);
  });

  test("stays visible, at the same figures, on every tab", () => {
    // The whole point of hoisting this block above the tabs: it must not
    // regress into disappearing or drifting when another panel is active.
    render(<App />);
    for (const label of ["Growth", "Wrappers", "Tax", "Projections", "Reconciliation"]) {
      fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${label}\\b`) }), {
        button: 0,
      });
      const block = within(headlineBlock());
      expect(block.getByText(/Book value \$223,675\.08/)).toBeDefined();
      expect(block.getByText("+$18,064.59")).toBeDefined();
    }
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
    const headings = headlineBlock().querySelectorAll("h1, h2, h3, h4, h5, h6");
    expect(headings.length).toBe(1);
    expect(headings[0]?.tagName).toBe("H2");
    expect(headings[0]?.textContent).toMatch(/^Portfolio total/);
  });
});
