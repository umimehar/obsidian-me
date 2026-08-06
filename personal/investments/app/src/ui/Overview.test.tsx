import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Overview } from "./Overview";
import { loadAnalytics } from "./data";

/**
 * Renders against the real committed corpus (`data/analytics.json`), same
 * as `ValueOverTime.test.tsx` and `data.test.ts` -- not a hand-made
 * fixture, so these tests catch a real regression in the rollup wiring,
 * not fixture drift. The real grand total is $241,739.67 (task 1, task 3a).
 */
function renderOverview() {
  const analytics = loadAnalytics();
  render(
    <Theme>
      <Overview analytics={analytics} />
    </Theme>,
  );
  return analytics;
}

describe("Overview", () => {
  test("shows the real grand total as the headline", () => {
    renderOverview();
    expect(screen.getByText("$241,739.67")).toBeDefined();
  });

  test("switching lens never changes the displayed grand total", () => {
    renderOverview();
    expect(screen.getByText("$241,739.67")).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: /account/i }));
    expect(screen.getByText("$241,739.67")).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
    expect(screen.getByText("$241,739.67")).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: /registration/i }));
    expect(screen.getByText("$241,739.67")).toBeDefined();
  });

  test("registration lens defaults on and shows the real Cash group at zero with an excluded marker", () => {
    renderOverview();
    // Real corpus: registration lens has a Cash group of 3 Chequing accounts, total $0.
    const cashHeading = screen.getByRole("heading", { name: "Cash" });
    const cashCard = cashHeading.closest("[data-overview-group]");
    if (cashCard === null) throw new Error("expected the Cash group card to render");
    const group = within(cashCard as HTMLElement);
    expect(group.getByText("$0.00")).toBeDefined();
    expect(group.getAllByText(/excluded from totals/i).length).toBe(3);
  });

  test("account lens shows each Chequing account as its own excluded group", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("radio", { name: /account/i }));

    const chequingHeadings = screen.getAllByRole("heading", { name: /^Chequing/ });
    expect(chequingHeadings.length).toBe(3);
    for (const heading of chequingHeadings) {
      const card = heading.closest("[data-overview-group]");
      if (card === null) throw new Error("expected the account group card to render");
      const group = within(card as HTMLElement);
      expect(group.getByText(/excluded from totals/i)).toBeDefined();
    }
  });

  test("purpose lens shows Cash accounts inside the spending group, excluded", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));

    const spendingHeading = screen.getByRole("heading", { name: "Spending" });
    const spendingCard = spendingHeading.closest("[data-overview-group]");
    if (spendingCard === null) throw new Error("expected the Spending group card to render");
    const group = within(spendingCard as HTMLElement);
    expect(group.getByText("$0.00")).toBeDefined();
    expect(group.getAllByText(/excluded from totals/i).length).toBe(3);
  });

  test("purpose lens renders the empty unassigned bucket honestly, not as broken", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));

    const unassignedHeading = screen.getByRole("heading", { name: "Unassigned" });
    const unassignedCard = unassignedHeading.closest("[data-overview-group]");
    if (unassignedCard === null) throw new Error("expected the Unassigned group card to render");
    const group = within(unassignedCard as HTMLElement);
    expect(group.getByText(/no accounts/i)).toBeDefined();
  });

  test("group share of total is computed against the same headline total", () => {
    renderOverview();
    // Real corpus: registration Corporate group is $51,232.39 of $241,739.67 = 21.2%.
    const corporateHeading = screen.getByRole("heading", { name: "Corporate" });
    const corporateCard = corporateHeading.closest("[data-overview-group]");
    if (corporateCard === null) throw new Error("expected the Corporate group card to render");
    const group = within(corporateCard as HTMLElement);
    expect(group.getByText(/21\.2%/)).toBeDefined();
  });
});
