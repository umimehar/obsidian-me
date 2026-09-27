import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { GOLDENS, accountGolden, groupGolden } from "../goldens";
import { GroupGainLine, Overview, cardMotion, useCardMotion } from "./Overview";
import { formatPeriodLabel } from "./charts/plot";
import { loadAnalytics } from "./data";
import { formatCurrency, formatGainWithShare, formatShare, formatSignedCurrency } from "./format";
import { restoreReducedMotion, stubReducedMotion } from "./motionPreference";
import { coarseForm, expectNoCoarseForm } from "./testSupport/coarseForm";

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
    // Real corpus: registration lens has a Cash group of 3 Chequing accounts.
    // Its accounts state no market value, so the card states none either --
    // "$0.00" would be a claim that they hold nothing.
    const cashHeading = screen.getByRole("heading", { name: "Cash" });
    const cashCard = cashHeading.closest("[data-overview-group]");
    if (cashCard === null) throw new Error("expected the Cash group card to render");
    const group = within(cashCard as HTMLElement);
    expect(group.queryByText("$0.00")).toBeNull();
    expect(group.getByText("Not counted in the total")).toBeDefined();
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
    expect(group.queryByText("$0.00")).toBeNull();
    expect(group.getByText("Not counted in the total")).toBeDefined();
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
    // Three groups checked rather than one, so a card that renders a constant
    // cannot pass by matching a single figure. Each is a multi-account group,
    // so the total is never also an account line and the assertion cannot
    // pass one off for the other.
    for (const label of ["TFSA", "RRSP", "Non-registered"]) {
      const total = formatCurrency(groupGolden("registration", label).market);
      expect(within(groupCard(label)).getByText(total)).toBeDefined();
    }
  });

  test("each account line prints its own market value", () => {
    renderOverview();
    const tfsa = within(groupCard("TFSA"));
    for (const shortId of ["9710", "d77c"]) {
      expect(tfsa.getByText(formatCurrency(accountGolden(shortId)))).toBeDefined();
    }

    const rrsp = within(groupCard("RRSP"));
    for (const shortId of ["2318", "97ab", "d6d9"]) {
      expect(rrsp.getByText(formatCurrency(accountGolden(shortId)))).toBeDefined();
    }
  });

  test("an account with no stated figure says so rather than printing zero", () => {
    renderOverview();
    // The three Chequing accounts carry a null market value: cash is outside
    // the totals, so there is no figure to print, and $0.00 would be a claim.
    // Three account lines plus the card's own total, which has no figure to
    // state either now that the group is wholly excluded.
    const cash = within(groupCard("Cash"));
    expect(cash.getAllByText("No figure").length).toBe(4);
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
  });

  test("no share bar announces anything, so there is no second copy to round", () => {
    renderOverview();
    // The card's text is the only copy of the figure. Every bar in every
    // card is checked, not just the first in each, so a second bar added
    // later cannot hide behind the first.
    const respShare = formatShare(
      groupGolden("registration", "RESP").market / GOLDENS.portfolio.total,
    );
    expect(within(groupCard("RESP")).getByText(`${respShare} of total`)).toBeDefined();
    let barred = 0;
    for (const card of document.querySelectorAll("[data-overview-group]")) {
      for (const bar of card.querySelectorAll("[data-share-bar]")) {
        barred += 1;
        expect(bar.getAttribute("aria-hidden")).toBe("true");
        expect(bar.getAttribute("role")).toBeNull();
        expect(bar.getAttribute("aria-valuetext")).toBeNull();
        expect(bar.textContent).toBe("");
      }
    }
    // Six of the seven registration groups draw a bar. The Cash group is
    // wholly excluded from the total, so it has no share to draw one for.
    expect(barred).toBe(6);
  });

  test("nothing inside a group card announces a percentage at all", () => {
    renderOverview();
    // Whatever element it hangs off. This is the check that survives a
    // badge, a title attribute, or a bar that comes back wearing a role.
    const nodes = [...document.querySelectorAll("[data-overview-group] *")];
    expect(nodes.length).toBeGreaterThan(20);
    for (const node of nodes) {
      for (const attribute of ["aria-valuetext", "aria-label", "title"]) {
        expect(node.getAttribute(attribute) ?? "").not.toMatch(/\d+(\.\d+)?%/);
      }
    }
  });

  test("the two shares a whole percent would distort are printed, not announced", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
    // Rounded to whole percent the small one reads 2%, which is both an
    // overstatement and the loss of the decimal that exists to tell two small
    // groups apart. They are visible text at one decimal, and the bar beside
    // them stays silent.
    for (const label of ["Education", "Business"]) {
      const share = formatShare(groupGolden("purpose", label).market / GOLDENS.portfolio.total);
      expect(within(groupCard(label)).getByText(`${share} of total`)).toBeDefined();
    }
    for (const label of ["Education", "Business"]) {
      const bar = groupCard(label).querySelector("[data-share-bar]");
      expect(bar?.getAttribute("aria-hidden")).toBe("true");
      expect(bar?.getAttribute("aria-valuetext")).toBeNull();
    }
  });

  test("each bar's width is its own share of the whole, not of the largest group", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
    const width = (label: string): number => {
      const fill = groupCard(label).querySelector("[data-share-bar-fill]");
      if (!(fill instanceof HTMLElement)) throw new Error(`expected a fill in the ${label} card`);
      return Number.parseFloat(fill.style.width);
    };
    const share = (label: string) =>
      (groupGolden("purpose", label).market / GOLDENS.portfolio.total) * 100;
    expect(width("Education")).toBeCloseTo(share("Education"), 2);
    expect(width("Business")).toBeCloseTo(share("Business"), 2);
    // Growth is the largest group and still fills well under the whole bar,
    // which is what "against the whole portfolio" means -- a width taken
    // against the largest group would put this one at exactly 100.
    expect(width("Growth")).toBeCloseTo(share("Growth"), 2);
    expect(width("Growth")).toBeLessThan(100);
  });

  test("each group card charts its own history, ending at its own total", () => {
    renderOverview();
    // Two groups with different start months, so a label built from the
    // portfolio's range rather than the group's own would fail on one of them.
    for (const label of ["RRSP", "TFSA"]) {
      const golden = groupGolden("registration", label);
      const summary = within(groupCard(label)).getByRole("img").getAttribute("aria-label") ?? "";
      expect(summary).toContain(`${label} market value`);
      expect(summary).toContain(
        `from ${formatPeriodLabel(golden.firstPeriod)} to ${formatPeriodLabel(golden.lastPeriod)}`,
      );
      expect(summary).toContain(`ending at ${formatCurrency(golden.market)}.`);
    }
    expect(groupGolden("registration", "RRSP").firstPeriod).not.toBe(
      groupGolden("registration", "TFSA").firstPeriod,
    );
  });

  test("a group with no value history says so rather than charting a flat zero", () => {
    renderOverview();
    // The Cash group is three inTotals: false Chequing accounts, so it has no
    // points at all -- a baseline at zero would read as a real zero balance.
    const cash = within(groupCard("Cash"));
    expect(cash.getByText(/no value history/i)).toBeDefined();
    expect(groupCard("Cash").querySelector("svg")).toBeNull();
  });

  // A proxy, not a containment proof: happy-dom has no layout engine, so it
  // cannot show the tooltip actually escaping the card the way a real
  // browser measurement can (see the fix report for that). What this DOES
  // prove is that the card carrying the sparkline is wired to the
  // `ivt-group-card` override in app.css that lifts Radix's own
  // `overflow: hidden`/`contain: paint`, which is the one class name a
  // future edit could silently rename or drop.
  test("every group card is wired to let its chart tooltip paint outside it", () => {
    renderOverview();
    const card = groupCard("TFSA").querySelector(".rt-BaseCard");
    expect(card?.className).toContain("ivt-group-card");
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
    // The share a card prints must be against the headline total, not against
    // the largest group or against a total of its own.
    const corporateHeading = screen.getByRole("heading", { name: "Corporate" });
    const corporateCard = corporateHeading.closest("[data-overview-group]");
    if (corporateCard === null) throw new Error("expected the Corporate group card to render");
    const share = formatShare(
      groupGolden("registration", "Corporate").market / GOLDENS.portfolio.total,
    );
    expect(within(corporateCard as HTMLElement).getByText(`${share} of total`)).toBeDefined();
  });

  // Real corpus, against the committed goldens -- verified independently in
  // groupGain.test.ts and reproduced here at the rendered-DOM level.
  describe("book value and gain against book cost", () => {
    /** Asserts one card prints its golden book value and its golden gain. */
    function expectCardFigures(label: string, lens: "registration" | "purpose") {
      const golden = groupGolden(lens, label);
      const card = within(groupCard(label));
      // A regex, because the label and the figure are separate elements and
      // getByText's string form matches a single node's own text.
      const book = formatCurrency(golden.book).replace(/[$.]/g, "\\$&");
      expect(card.getByText(new RegExp(`Book value ${book}`))).toBeDefined();
      // The gain carries its own percentage of book cost in brackets, from
      // the one call that formats the dollars.
      expect(card.getByText(formatGainWithShare(golden.gain, golden.book))).toBeDefined();
    }

    test("TFSA prints its golden book value and gain", () => {
      renderOverview();
      expectCardFigures("TFSA", "registration");
    });

    test("Non-registered prints its golden book value and gain", () => {
      renderOverview();
      expectCardFigures("Non-registered", "registration");
    });

    test("Growth (purpose lens) prints its golden book value and gain", () => {
      renderOverview();
      fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
      expectCardFigures("Growth", "purpose");
    });

    // Cash (registration) and Spending (purpose) have no counted account, so
    // no series and no PortfolioPoint to read a gain from at all.
    test("Cash (registration lens) states there is no market value to compare, not $0.00", () => {
      renderOverview();
      const card = within(groupCard("Cash"));
      expect(card.getByText(/no market value to compare/i)).toBeDefined();
      expect(card.queryByText(/gain against book cost/i)).toBeNull();
    });

    test("Spending (purpose lens) states there is no market value to compare, not $0.00", () => {
      renderOverview();
      fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
      const card = within(groupCard("Spending"));
      expect(card.getByText(/no market value to compare/i)).toBeDefined();
      expect(card.queryByText(/gain against book cost/i)).toBeNull();
    });

    test("every real per-account loss the corpus holds prints an explicit minus sign in red", () => {
      // Whether the corpus holds a loss at all is a property of this month's
      // market: RRSP (managed) at -$3.16 and Crypto at -$45.04 were the only
      // two at 2026-06, and both turned positive at 2026-07. So this runs
      // over whatever losses the goldens record -- none, today.
      //
      // That leaves the red path with NO real-data coverage in a month like
      // this one, which is why the fixture test below is not redundant: it is
      // the only thing standing between a broken loss colour and a green
      // suite. `bun run contrast` has the same blind spot for the same
      // reason, and the investments CLAUDE.md records it.
      renderOverview();
      fireEvent.click(screen.getByRole("radio", { name: /account/i }));
      for (const label of GOLDENS.lossGroups) {
        const golden = groupGolden("account", label);
        const gain = within(groupCard(label)).getByText(formatSignedCurrency(golden.gain));
        expect(gain.getAttribute("data-accent-color")).toBe("red");
      }
    });

    test("no figure here announces coarser than what it prints (TFSA and Growth)", () => {
      renderOverview();
      const tfsa = groupGolden("registration", "TFSA");
      const tfsaText = groupCard("TFSA").textContent ?? "";
      for (const figure of [tfsa.book, tfsa.gain]) {
        expect(tfsaText).toContain(formatCurrency(figure));
        expectNoCoarseForm(tfsaText, figure);
      }

      fireEvent.click(screen.getByRole("radio", { name: /purpose/i }));
      const growth = groupGolden("purpose", "Growth");
      const growthText = groupCard("Growth").textContent ?? "";
      for (const figure of [growth.book, growth.gain]) {
        expect(growthText).toContain(formatCurrency(figure));
        expectNoCoarseForm(growthText, figure);
      }

      // Both rounding directions must be exercised, not just one: a coarse
      // form that rounds DOWN is a literal prefix of the precise figure, the
      // case a plain not.toContain misses (see expectNoCoarseForm's
      // docstring). Asserted over every figure on both cards so the pair
      // cannot quietly become two same-direction cases after an import.
      const figures = [tfsa.book, tfsa.gain, growth.book, growth.gain];
      const roundsUp = figures.filter((f) => Math.round(f) > f);
      const roundsDown = figures.filter((f) => Math.round(f) < f);
      expect(roundsUp.length).toBeGreaterThan(0);
      expect(roundsDown.length).toBeGreaterThan(0);
      expect(coarseForm(roundsDown[0] ?? 0)).toBe(
        `$${Math.round(roundsDown[0] ?? 0).toLocaleString("en-CA")}`,
      );
    });

    test("the gain carries an explicit sign in colour and in Radix's own accent token", () => {
      renderOverview();
      const golden = groupGolden("registration", "TFSA");
      expect(golden.gain).toBeGreaterThan(0);
      const gain = within(groupCard("TFSA")).getByText(
        formatGainWithShare(golden.gain, golden.book),
      );
      expect(gain.getAttribute("data-accent-color")).toBe("jade");
    });

    test("the USD book-cost caveat sits next to the figure on every card that has one", () => {
      renderOverview();
      const cardsWithGain = [...document.querySelectorAll("[data-overview-group]")].filter(
        (card) => card.querySelector("[data-group-book-value]") !== null,
      );
      // Six of the seven registration groups have a gain; Cash does not.
      expect(cardsWithGain.length).toBe(6);
      for (const card of cardsWithGain) {
        expect(card.textContent).toMatch(/approximate|estimate/i);
      }
    });
  });
});

/**
 * `GroupGainLine` in isolation, with a hand-built loss the real registration
 * and purpose lenses never produce (every one of those groups is a gain in
 * the committed corpus). The account lens does carry a real loss --
 * "a real per-account loss" above renders it from `loadAnalytics()` -- so
 * this fixture is a second, independent proof rather than the only one: it
 * pins the loss path even if the corpus's own numbers ever moved and
 * stopped containing one.
 */
describe("GroupGainLine, forced loss fixture", () => {
  function renderLoss() {
    render(
      <Theme>
        <GroupGainLine figures={{ marketValue: 900, bookCost: 1000, gain: -100 }} />
      </Theme>,
    );
  }

  test("prints the loss with an explicit minus sign on both figures, not just a colour", () => {
    renderLoss();
    // Both halves signed: in greyscale or forced-colours mode the characters
    // are the only channel left, and "(10.00%)" beside "-$100.00" would read
    // as a gain of ten percent.
    expect(screen.getByText("-$100.00 (-10.00%)")).toBeDefined();
    expect(screen.queryByText("+$100.00 (+10.00%)")).toBeNull();
  });

  test("colours the loss red, not the gain colour", () => {
    renderLoss();
    const gain = screen.getByText("-$100.00 (-10.00%)");
    expect(gain.getAttribute("data-accent-color")).toBe("red");
  });

  test("still prints the book value beside the loss", () => {
    renderLoss();
    expect(screen.getByText(/Book value \$1,000\.00/)).toBeDefined();
  });
});
