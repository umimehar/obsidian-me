import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "./App";

function roomCard(group: string) {
  const node = document.querySelector(`[data-room-line="${group}"]`);
  if (node === null) throw new Error(`expected a ${group} room line to render`);
  return node as HTMLElement;
}

describe("App", () => {
  test("renders the overview, the registered wrappers and the tax view together", () => {
    render(<App />);
    expect(document.querySelector("[data-portfolio-total]")?.textContent).toBe("$241,739.67");
    expect(document.querySelectorAll("[data-room-line]").length).toBe(4);
    expect(document.querySelector("[data-tax-income]")).not.toBeNull();
  });

  test("the reconciliation view renders beneath the figures it reconciles", () => {
    render(<App />);
    expect(document.querySelector("[data-recon-ground-truth]")).not.toBeNull();
    // 87 group rows plus the ground-truth line promoted into the headline card.
    expect(document.querySelectorAll("[data-finding-row]").length).toBe(87);
  });

  test("the year control drives both the room lines and the tax figures", () => {
    render(<App />);
    expect(within(roomCard("TFSA")).getByText("$7,000.00")).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: "2025" }));

    expect(within(roomCard("TFSA")).getByText("$21,000.00")).toBeDefined();
    const income = document.querySelector("[data-tax-income]");
    if (income === null) throw new Error("expected the tax income section to render");
    expect(within(income as HTMLElement).getByText("-$1,067.39")).toBeDefined();
  });
});
