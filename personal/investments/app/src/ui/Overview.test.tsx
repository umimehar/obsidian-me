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
  // The headline total and the value-over-time chart moved out of Overview
  // in task 1 (phase 2c): they are the page's subject, not one view of it,
  // so App now renders them once above every tab panel. What stays testable
  // here is that a group's own share of that total is stable across lenses,
  // covered below by "group share of total is computed against the same
  // headline total".

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

  test("purpose lens carries no unassigned card, because every account is tagged", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));

    // All fourteen were tagged in task 3a. An empty bucket would be a standing
    // "Unassigned / 0 accounts / $0.00" card, which is a figure about nothing.
    expect(screen.queryByRole("heading", { name: "Unassigned" })).toBeNull();
    expect(screen.queryByText(/no accounts in this group/i)).toBeNull();
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

  test("no group card announces a figure coarser than the one it prints", () => {
    renderOverview();
    const cards = [...document.querySelectorAll("[data-overview-group]")];
    expect(cards.length).toBe(7);

    let charted = 0;
    for (const card of cards) {
      const total = card.querySelector("[data-group-total]")?.textContent;
      const summary = card.querySelector('[role="img"]')?.getAttribute("aria-label") ?? "";
      if (!summary.includes("ending at")) continue;
      // The defect this replaces: the old progress bar announced Radix's
      // whole-percent aria-valuetext, 20% beside a visible 20.4%. The chart
      // that took its place states the card's own total, cents and all.
      charted += 1;
      expect(summary).toContain(`ending at ${total}.`);
    }
    // Six of the seven registration groups have a value history; Cash has none.
    expect(charted).toBe(6);

    // The share bar is back beside that text, and it announces the card's
    // own string rather than Radix's rounded one. Every card, not just the
    // one that made the defect visible.
    expect(within(groupCard("RESP")).getByText(/1\.6% of total/)).toBeDefined();
    let barred = 0;
    for (const card of cards) {
      const printed = card.querySelector("[data-group-share]")?.textContent ?? "";
      const announced = card.querySelector('[role="progressbar"]')?.getAttribute("aria-valuetext");
      if (announced === null || announced === undefined) continue;
      barred += 1;
      expect(printed).toBe(`${announced} of total`);
    }
    expect(barred).toBe(7);
  });

  test("the share bar states the two shares a whole percent would distort", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
    const announced = (label: string) =>
      groupCard(label).querySelector('[role="progressbar"]')?.getAttribute("aria-valuetext");
    // Rounded to whole percent these read 2% and 21%, which is both an
    // overstatement of the small group and the loss of the decimal that
    // exists to tell two small groups apart.
    expect(announced("Education")).toBe("1.6%");
    expect(announced("Business")).toBe("21.2%");
  });

  test("each bar's width is its own share of the whole, not of the largest group", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
    const width = (label: string): number => {
      const fill = groupCard(label).querySelector("[data-share-bar-fill]");
      if (!(fill instanceof HTMLElement)) throw new Error(`expected a fill in the ${label} card`);
      return Number.parseFloat(fill.style.width);
    };
    // Real corpus: Education $3,943.98 and Business $51,232.39 of $241,739.67.
    expect(width("Education")).toBeCloseTo(1.631, 2);
    expect(width("Business")).toBeCloseTo(21.192, 2);
    // Growth is the largest group at $108,953.60 and still fills under half,
    // which is what "against the whole portfolio" means.
    expect(width("Growth")).toBeCloseTo(45.071, 2);
  });

  test("each group card charts its own history, ending at its own total", () => {
    renderOverview();
    const rrsp = within(groupCard("RRSP")).getByRole("img");
    expect(rrsp.getAttribute("aria-label")).toContain("RRSP market value");
    expect(rrsp.getAttribute("aria-label")).toContain("from Aug 2025 to Jun 2026");
    expect(rrsp.getAttribute("aria-label")).toContain("ending at $49,314.45.");

    const tfsa = within(groupCard("TFSA")).getByRole("img");
    expect(tfsa.getAttribute("aria-label")).toContain("from Jun 2023 to Jun 2026");
    expect(tfsa.getAttribute("aria-label")).toContain("ending at $48,155.28.");
  });

  test("a group with no value history says so rather than charting a flat zero", () => {
    renderOverview();
    // The Cash group is three inTotals: false Chequing accounts, so it has no
    // points at all -- a baseline at zero would read as a real zero balance.
    const cash = within(groupCard("Cash"));
    expect(cash.getByText(/no value history/i)).toBeDefined();
    expect(groupCard("Cash").querySelector("svg")).toBeNull();
  });

  test("every group chart shares one x domain, so a short history draws short", () => {
    renderOverview();
    const startX = (label: string): number => {
      const d = groupCard(label).querySelector("path")?.getAttribute("d") ?? "";
      const match = /^M(-?[\d.]+),/.exec(d);
      if (match === null) throw new Error(`expected a charted path in the ${label} card`);
      return Number(match[1]);
    };
    // TFSA runs the full 2023-06..2026-06; RESP starts 2026-01. Rescaled per
    // card both would start at 0 and the RESP would imply three years of
    // history it does not have.
    expect(startX("TFSA")).toBe(0);
    expect(startX("RESP")).toBeGreaterThan(startX("FHSA"));
    expect(startX("FHSA")).toBeGreaterThan(startX("TFSA"));
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
