import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "./App";

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
      "3 of 4 wrappers",
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
    expect(within(roomCard("TFSA")).getByText("$21,000.00")).toBeDefined();

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
