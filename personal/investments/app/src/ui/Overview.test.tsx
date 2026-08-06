import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { Overview, cardMotion, useCardMotion } from "./Overview";
import { loadAnalytics } from "./data";
import { restoreReducedMotion, stubReducedMotion } from "./motionPreference";

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

/** The group card whose heading is `label`, so a figure is pinned to one group rather than to the page. */
function groupCard(label: string): HTMLElement {
  const card = screen.getByRole("heading", { name: label }).closest("[data-overview-group]");
  if (card === null) throw new Error(`expected the ${label} group card to render`);
  return card as HTMLElement;
}

describe("useCardMotion", () => {
  let restore: typeof window.matchMedia | null = null;

  afterEach(() => {
    if (restore !== null) restoreReducedMotion(restore);
    restore = null;
  });

  test("reads the OS preference and hands the rule a true", () => {
    restore = stubReducedMotion(true);
    const { result } = renderHook(() => useCardMotion());
    expect(result.current).toEqual(cardMotion(true));
    expect(result.current.duration).toBe(0);
    expect(result.current.layout).toBe(false);
  });

  test("without the preference it hands the rule a false", () => {
    restore = stubReducedMotion(false);
    const { result } = renderHook(() => useCardMotion());
    expect(result.current).toEqual(cardMotion(false));
    expect(result.current.duration).toBeGreaterThan(0);
    expect(result.current.layout).toBe(true);
  });
});

describe("cardMotion", () => {
  test("reduced motion removes the fade and the reflow, it does not shorten them", () => {
    const spec = cardMotion(true);
    expect(spec.duration).toBe(0);
    expect(spec.layout).toBe(false);
    expect(spec.initial).toBe(false);
    expect(spec.exit).toBeUndefined();
  });

  test("without the preference the card fades in, out, and reflows", () => {
    const spec = cardMotion(false);
    expect(spec.duration).toBeGreaterThan(0);
    expect(spec.layout).toBe(true);
    expect(spec.initial).toEqual({ opacity: 0 });
    expect(spec.exit).toEqual({ opacity: 0 });
  });
});

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

  test("a group prints its own total, not a share of one", () => {
    renderOverview();
    // Real corpus, registration lens: TFSA $48,155.28, RRSP $49,314.45,
    // Non-registered $60,798.32. Three groups pinned rather than one, so a
    // card that renders a constant cannot pass by matching a single figure.
    // Each is a multi-account group, so the total is never also an account
    // line and the assertion cannot pass off one for the other.
    expect(within(groupCard("TFSA")).getByText("$48,155.28")).toBeDefined();
    expect(within(groupCard("RRSP")).getByText("$49,314.45")).toBeDefined();
    expect(within(groupCard("Non-registered")).getByText("$60,798.32")).toBeDefined();
  });

  test("each account line prints its own market value", () => {
    renderOverview();
    const tfsa = within(groupCard("TFSA"));
    expect(tfsa.getByText("$7,580.33")).toBeDefined();
    expect(tfsa.getByText("$40,574.95")).toBeDefined();

    const rrsp = within(groupCard("RRSP"));
    expect(rrsp.getByText("$14,509.70")).toBeDefined();
    expect(rrsp.getByText("$14,306.21")).toBeDefined();
    expect(rrsp.getByText("$20,498.54")).toBeDefined();
  });

  test("an account with no stated figure says so rather than printing zero", () => {
    renderOverview();
    // The three Chequing accounts carry a null market value: cash is outside
    // the totals, so there is no figure to print, and $0.00 would be a claim.
    const cash = within(groupCard("Cash"));
    expect(cash.getAllByText("No figure").length).toBe(3);
  });

  test("a group states how many accounts are in it", () => {
    renderOverview();
    expect(within(groupCard("RRSP")).getByText("3 accounts")).toBeDefined();
    expect(within(groupCard("TFSA")).getByText("2 accounts")).toBeDefined();
    expect(within(groupCard("FHSA")).getByText("1 account")).toBeDefined();
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
