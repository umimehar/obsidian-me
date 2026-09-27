import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";
import { defaultSelection } from "./chartAccounts";
import { loadAnalytics } from "./data";
import { formatCurrency } from "./format";
import { clickTab } from "./testSupport/clickTab";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const { series } = loadAnalytics();
const PORTFOLIO_SIZE = defaultSelection(series).size;

function chartLabel(): string {
  return (
    document
      .querySelector("svg[role='img'][aria-label*='market value from']")
      ?.getAttribute("aria-label") ?? ""
  );
}

/** By attribute, not role: an open menu hides the rest of the page from role queries, as it should. */
function trigger(): HTMLElement {
  const node = document.querySelector<HTMLElement>("[data-account-filter]");
  if (node === null) throw new Error("expected the account filter to render");
  return node;
}

/** Awaited inside act: Radix positions the menu after an async measurement. */
async function closeFilter() {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  });
}

async function openFilter() {
  await act(async () => {
    fireEvent.keyDown(trigger(), { key: "Enter" });
  });
}

function item(label: string): HTMLElement {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return screen.getByRole("menuitemcheckbox", {
    name: new RegExp(`^${escaped}( \\(not in total\\))?$`),
  });
}

function toggle(label: string) {
  fireEvent.click(item(label));
}

function lastValue(label: string): number {
  const value = series.find((a) => a.label === label)?.months.at(-1)?.marketValue;
  if (value === undefined || value === null) throw new Error(`no value for ${label}`);
  return value;
}

describe("the account filter", () => {
  test("opens showing every portfolio account ticked and the spousal account not", async () => {
    render(<App />);
    clickTab("Portfolio");
    expect(trigger().textContent).toBe(`Portfolio (${PORTFOLIO_SIZE} accounts)`);
    await openFilter();
    const ticked = screen
      .getAllByRole("menuitemcheckbox")
      .filter((node) => node.getAttribute("aria-checked") === "true");
    expect(ticked).toHaveLength(PORTFOLIO_SIZE);
    expect(item("Spousal RRSP").getAttribute("aria-checked")).toBe("false");
    expect(chartLabel()).toStartWith("Portfolio market value from");
  });

  test("the ticks, the button and the chart stay in step as accounts are toggled", async () => {
    render(<App />);
    clickTab("Portfolio");
    const before = document.querySelector("[data-portfolio-total]")?.textContent;
    await openFilter();
    for (const a of series) {
      if (a.inTotals && a.label !== "FHSA" && a.label !== "RESP") toggle(a.label);
    }

    expect(trigger().textContent).toBe("2 accounts");
    expect(item("FHSA").getAttribute("aria-checked")).toBe("true");
    expect(item("TFSA (managed)").getAttribute("aria-checked")).toBe("false");
    expect(chartLabel()).toStartWith("2 accounts market value from");
    expect(chartLabel()).toContain(
      `ending at ${formatCurrency(lastValue("FHSA") + lastValue("RESP"))}.`,
    );
    expect(document.querySelector("[data-portfolio-total]")?.textContent).toBe(before);

    toggle("RESP");
    expect(trigger().textContent).toBe("FHSA");
    // The last ticked account cannot be unticked, so the chart is never empty.
    expect(item("FHSA").getAttribute("aria-disabled")).toBe("true");
  });

  test("reset returns to the portfolio, and the return mode follows the selection", async () => {
    render(<App />);
    clickTab("Portfolio");
    await openFilter();
    toggle("Spousal RRSP");
    expect(trigger().textContent).toBe(`${PORTFOLIO_SIZE + 1} accounts`);
    await closeFilter();
    fireEvent.click(screen.getByRole("radio", { name: /^(Return)\1?$/ }));
    expect(document.querySelector("svg title")?.textContent).toBe(
      `${PORTFOLIO_SIZE + 1} accounts return over time, net of deposits`,
    );

    await openFilter();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reset to portfolio" }));
    expect(trigger().textContent).toBe(`Portfolio (${PORTFOLIO_SIZE} accounts)`);
  });
});
