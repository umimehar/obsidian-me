import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GOLDENS } from "../goldens";
import { App } from "./App";
import { formatCurrency, formatShare } from "./format";
import { clickTab } from "./testSupport/clickTab";
import { expectNoCoarseForm } from "./testSupport/coarseForm";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function tile(label: string): HTMLElement {
  const node = document.querySelector(`[data-flow-tile="${label}"]`);
  if (node === null) throw new Error(`expected a ${label} tile to render`);
  return node as HTMLElement;
}

describe("the Flow tab, wired into App", () => {
  test("the Flow tab is present after This month, and hides the global year filter", () => {
    render(<App />);
    expect(screen.getByRole("tab", { name: /^Flow\b/ })).toBeDefined();
    clickTab("Flow");
    expect(document.querySelector("[data-year-filter]")).toBeNull();
    expect(document.querySelector("[data-flow-tab]")).not.toBeNull();
  });

  test("tiles match the 2026 golden figures over every account, from #flow/2026", () => {
    window.location.hash = "#flow/2026";
    render(<App />);
    const h = GOLDENS.flows.headline["2026"];
    expect(tile("Paid in from outside").textContent).toContain(formatCurrency(h.paidIn));
    expect(tile("Invested").textContent).toContain(formatCurrency(h.invested));
    expect(tile("Left in cash").textContent).toContain(formatCurrency(h.leftInCash));
    expect(tile("Income earned").textContent).toContain(formatCurrency(h.income));
    expect(tile("Costs").textContent).toContain(formatCurrency(h.costs));
    if (h.investedRate !== null) {
      expect(tile("Invested rate").textContent).toContain(formatShare(h.investedRate));
    }
  });

  test("no tile's text or aria-label ever states a coarser figure than its own, over the 2026 goldens", () => {
    window.location.hash = "#flow/2026";
    render(<App />);
    const h = GOLDENS.flows.headline["2026"];
    for (const [label, amount] of [
      ["Paid in from outside", h.paidIn],
      ["Invested", h.invested],
      ["Left in cash", h.leftInCash],
      ["Income earned", h.income],
      ["Costs", h.costs],
    ] as const) {
      expectNoCoarseForm(tile(label).textContent ?? "", amount);
      expectNoCoarseForm(tile(label).getAttribute("aria-label") ?? "", amount);
    }
  });

  test("#flow/2026 round trips: reloading with that hash opens the Flow tab already scoped to 2026", () => {
    window.location.hash = "#flow/2026";
    render(<App />);
    expect(screen.getByRole("tab", { name: /^Flow\b/, selected: true })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Period" }).textContent).toBe("Year");
    expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026");
  });

  test("choosing Year 2025 in the period control updates the hash to #flow/2025", async () => {
    window.location.hash = "#flow";
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Period" }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "Year" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Year" }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "2025" }));
    });
    expect(window.location.hash).toBe("#flow/2025");
  });

  test("a malformed flow period in the hash falls back to all time rather than throwing", () => {
    window.location.hash = "#flow/2025-13";
    expect(() => render(<App />)).not.toThrow();
    expect(screen.getByRole("combobox", { name: "Period" }).textContent).toBe("All time");
  });
});
