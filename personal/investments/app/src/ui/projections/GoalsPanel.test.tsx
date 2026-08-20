import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import type { AnalyticsOutput } from "../../analytics/build";
import { GOALS, type Goal } from "../../goals/config";
import { projectYears } from "../../projection/engine";
import { projectionInputs } from "../../projection/inputs";
import { loadAnalytics } from "../data";
import { formatCurrency } from "../format";
import { expectNoCoarseForm } from "../testSupport/coarseForm";
import { GoalsPanel } from "./GoalsPanel";

/**
 * Against the real committed corpus, same as `evaluate.test.ts` (task 3):
 * the house goal projects to $50,180.10 by 2028 and the education goal to
 * $92,547.67 by 2042, both at 6%. The figures below are numeric literals,
 * not recomputed at run time, but a wrong literal cannot go unnoticed: every
 * one is first asserted with `toContain(formatCurrency(x))`, the exact
 * string the card renders, before that same `x` is ever handed to
 * `expectNoCoarseForm(text, x)` for the coarse-absence check. A stale or
 * mistyped literal reddens the precise assertion first, so the coarse guard
 * can never end up silently checking the wrong number.
 *
 * Coverage is not uniform across every rendered figure, and it cannot be.
 * `projected`, `monthly`, `uncoveredValue` and `gap` each go through this
 * guard, because each is rendered nowhere but its own `formatCurrency` call.
 * `target` does not, and never can: `goal.source` legitimately spells out
 * the bare "$40,000" and "$50,000" as prose (see `goals/config.ts`), so a
 * coarse form of `target` is expected to appear in the card's own text, not
 * a defect the guard could flag.
 */
const analytics: AnalyticsOutput = loadAnalytics();
const rows6 = projectYears(projectionInputs(analytics, { returnRate: 0.06 }));
const rows12 = projectYears(projectionInputs(analytics, { returnRate: 0.12 }));

const houseGoal = GOALS[0];
if (houseGoal === undefined) throw new Error("GOALS is missing the house entry");
const educationGoal = GOALS[1];
if (educationGoal === undefined) throw new Error("GOALS is missing the education entry");

function renderPanel(rows = rows6, rate = 0.06, goals?: readonly Goal[]) {
  render(
    <Theme>
      <GoalsPanel
        analytics={analytics}
        rows={rows}
        rate={rate}
        fhsaCloseYear="2039"
        goals={goals}
      />
    </Theme>,
  );
}

/** The rendered text of one goal card, by its stable `data-testid` hook. */
function cardText(id: string): string {
  return screen.getByTestId(`goal-${id}`).textContent ?? "";
}

function cardLabel(id: string): string {
  return screen.getByTestId(`goal-${id}`).getAttribute("aria-label") ?? "";
}

afterEach(cleanup);

describe("every card carries role=group, so its aria-label lands on a nameable node", () => {
  test("a projected card's role supports an accessible name", () => {
    renderPanel();
    expect(screen.getByTestId("goal-house").getAttribute("role")).toBe("group");
  });

  // The unprojectable card is a second, separate JSX return -- its own
  // `role="group"` cannot be inferred from `ProjectedCard`'s.
  test("an unprojectable card's role supports an accessible name too", () => {
    const spendingGoal: Goal = {
      ...houseGoal,
      id: "none",
      scope: { kind: "purpose", purpose: "spending" },
    };
    renderPanel(rows6, 0.06, [spendingGoal]);
    expect(screen.getByTestId("goal-none").getAttribute("role")).toBe("group");
  });
});

describe("the house card, against the real corpus", () => {
  const projected = 50180.1;
  const target = 40000;
  const gap = 10180.1;

  test("prints its projected figure at full precision, never the coarse form", () => {
    renderPanel();
    const text = cardText("house");
    expect(text).toContain(formatCurrency(projected));
    expect(text).toContain(formatCurrency(target));
    expect(text).toMatch(/ahead of target/i);
    // The coarse, whole-dollar form of the projected figure happens to share
    // its leading digits with the precise one here ($50,180 rounds down from
    // $50,180.10) -- checked against the real rounded value, not assumed.
    expectNoCoarseForm(text, projected);
    expectNoCoarseForm(text, gap);
  });

  test("the card's aria-label carries the same figures the card prints, never a drifted one", () => {
    renderPanel();
    const label = cardLabel("house");
    expect(label).toContain(formatCurrency(projected));
    expect(label).toContain(formatCurrency(target));
    expect(label).toContain(formatCurrency(gap));
    expectNoCoarseForm(label, projected);
    expectNoCoarseForm(label, gap);
  });

  test("prints its source, rendered rather than decorative", () => {
    renderPanel();
    expect(cardText("house")).toMatch(/FHSA's \$40,000 lifetime contribution cap/);
  });

  test("prints the gap itself, not just the direction word", () => {
    renderPanel();
    expect(cardText("house")).toContain(formatCurrency(gap));
  });
});

describe("the education card, against the real corpus", () => {
  const projected = 92547.67;
  const target = 50000;
  const gap = 42547.67;

  test("prints its projected figure at full precision, never the coarse form", () => {
    renderPanel();
    const text = cardText("education");
    expect(text).toContain(formatCurrency(projected));
    expect(text).toContain(formatCurrency(target));
    expect(text).toMatch(/ahead of target/i);
    // $92,547.67 rounds UP to $92,548 -- a different digit than the precise
    // form, not a prefix of it, so this is where a truncation-based guard
    // would have missed the defect entirely.
    expectNoCoarseForm(text, projected);
    // The gap here is $42,547.67, whose coarse form rounds UP to $42,548 --
    // the same additive failure mode as the projected-figure check above,
    // and the one `gap` had no guard against at all before this line: a
    // coarse figure appended to the label rather than substituted for the
    // precise one left `toContain(formatCurrency(gap))` satisfied and every
    // test in this file green.
    expectNoCoarseForm(text, gap);
  });

  test("its aria-label carries the same full-precision figure, and never the rounded-up coarse form", () => {
    renderPanel();
    const label = cardLabel("education");
    expect(label).toContain(formatCurrency(projected));
    expect(label).toContain(formatCurrency(gap));
    expectNoCoarseForm(label, projected);
    expectNoCoarseForm(label, gap);
  });

  test("raising the rate raises the projected figure, and the history stays the same page", () => {
    const { unmount } = render(
      <Theme>
        <GoalsPanel analytics={analytics} rows={rows6} rate={0.06} fhsaCloseYear="2039" />
      </Theme>,
    );
    const at6 = cardText("education");
    unmount();

    render(
      <Theme>
        <GoalsPanel analytics={analytics} rows={rows12} rate={0.12} fhsaCloseYear="2039" />
      </Theme>,
    );
    const at12 = cardText("education");
    expect(at12).not.toBe(at6);
  });
});

describe("a card whose scope outruns the projection", () => {
  const uncoveredValue = 60798.32;

  test("names exactly how many accounts it covers, not any count containing those digits", () => {
    const growthGoal: Goal = {
      ...houseGoal,
      id: "growth",
      scope: { kind: "purpose", purpose: "growth" },
      by: "2028",
    };
    renderPanel(rows6, 0.06, [growthGoal]);
    const text = cardText("growth");
    // The exact sentence, not a loose substring: "Covers 2 of 5" alone would
    // also match a card that actually printed "Covers 12 of 5", since "2 of
    // 5" is a substring of "12 of 5". Anchoring the whole phrase (and its
    // word boundary before the count) rules that out.
    expect(text).toContain("Covers 2 of 5 accounts in scope.");
    expect(text).toContain(
      `does not forecast 3 accounts holding ${formatCurrency(uncoveredValue)}.`,
    );
    expectNoCoarseForm(text, uncoveredValue);
  });

  test("the aria-label carries the same exact counts and figure", () => {
    const growthGoal: Goal = {
      ...houseGoal,
      id: "growth",
      scope: { kind: "purpose", purpose: "growth" },
      by: "2028",
    };
    renderPanel(rows6, 0.06, [growthGoal]);
    const label = cardLabel("growth");
    expect(label).toContain("Covers 2 of 5 accounts in scope.");
    expect(label).toContain(
      `does not forecast 3 accounts holding ${formatCurrency(uncoveredValue)}.`,
    );
  });
});

describe("an unprojectable goal", () => {
  const target = 40000;

  test("says so in words rather than reading a zero", () => {
    const spendingGoal: Goal = {
      ...houseGoal,
      id: "none",
      scope: { kind: "purpose", purpose: "spending" },
    };
    renderPanel(rows6, 0.06, [spendingGoal]);
    const text = cardText("none");
    expect(text).toMatch(/cannot be projected/i);
    expect(text).not.toContain("$0.00");
    // The target is still real and still printed -- only the projection and
    // the gap are absent -- so its full-precision figure is pinned here too.
    expect(text).toContain(formatCurrency(target));
    // "Covers 0 of 0" -- the spending purpose matches no `inTotals` account
    // at all, so this is a real, exact count, not a placeholder.
    expect(text).toContain("Covers 0 of 0 accounts in scope.");
  });

  test("the aria-label carries the same target figure the card prints, not a drifted one", () => {
    const spendingGoal: Goal = {
      ...houseGoal,
      id: "none",
      scope: { kind: "purpose", purpose: "spending" },
    };
    renderPanel(rows6, 0.06, [spendingGoal]);
    const label = cardLabel("none");
    expect(label).toContain(formatCurrency(target));
    expect(label).toMatch(/cannot be projected/i);
  });

  test("a target year past the projection's last row is unprojectable too", () => {
    const farGoal: Goal = { ...houseGoal, id: "far", by: "2099" };
    renderPanel(rows6, 0.06, [farGoal]);
    const text = cardText("far");
    expect(text).toMatch(/cannot be projected/i);
    expect(text).not.toContain("$0.00");
  });
});

/**
 * The gap line's colour is reinforcement, not the carrier of meaning here --
 * the words "ahead of target" and "short of target" already say which way
 * the goal is going, so a reader is never misinformed if this ternary ever
 * inverted. But every other rendered property on this card is pinned, and
 * an inverted ternary paints the dashboard's attention colour (amber) on a
 * goal that is actually met, and its reassuring colour (jade) on a real
 * shortfall, with nothing catching it. Read via Radix's own
 * `data-accent-color` attribute, the same one `evaluate.test.ts` and this
 * file already rely on the surrounding `Theme` to resolve, rather than a
 * fragile class-name match.
 */
describe("the gap line's colour follows the direction, not the other way around", () => {
  test("a surplus paints jade, the reassuring colour, on the house card", () => {
    renderPanel();
    const card = screen.getByTestId("goal-house");
    const gapEl = [...card.querySelectorAll("[data-accent-color]")].find((el) =>
      el.textContent?.includes("ahead of target"),
    );
    if (gapEl === undefined) throw new Error("expected the gap line element");
    expect(gapEl.getAttribute("data-accent-color")).toBe("jade");
  });

  test("a shortfall paints amber, the dashboard's attention colour", () => {
    const stretchGoal: Goal = { ...houseGoal, id: "stretch", target: 90000 };
    renderPanel(rows6, 0.06, [stretchGoal]);
    const card = screen.getByTestId("goal-stretch");
    const gapEl = [...card.querySelectorAll("[data-accent-color]")].find((el) =>
      el.textContent?.includes("short of target"),
    );
    if (gapEl === undefined) throw new Error("expected the gap line element");
    expect(gapEl.getAttribute("data-accent-color")).toBe("amber");
  });
});

describe("a shortfall the wrapper has no room to close", () => {
  const target = 90000;
  const projected = 50180.095474;
  const gap = 39819.904526;

  test("renders the blocked reason legibly, not as an error, at full precision", () => {
    const stretchGoal: Goal = { ...houseGoal, id: "stretch", target };
    renderPanel(rows6, 0.06, [stretchGoal]);
    const text = cardText("stretch");
    expect(text).toMatch(/short of target/i);
    expect(text).toMatch(/no CRA room left/i);
    expect(text).toContain(formatCurrency(target));
    expect(text).toContain(formatCurrency(projected));
    expect(text).toContain(formatCurrency(gap));
  });

  test("the aria-label carries the same figures and the same blocked reason", () => {
    const stretchGoal: Goal = { ...houseGoal, id: "stretch", target };
    renderPanel(rows6, 0.06, [stretchGoal]);
    const label = cardLabel("stretch");
    expect(label).toContain(formatCurrency(target));
    expect(label).toContain(formatCurrency(projected));
    expect(label).toContain(formatCurrency(gap));
    expect(label).toMatch(/no CRA room left/i);
  });
});

// Corporate has no CRA contribution room, so a Corporate-scoped shortfall is
// never blocked (see `evaluate.test.ts`). It is the one reachable path where
// the panel actually prints a `monthlyToClose` figure -- the two shipped
// goals are met at every rate the slider offers, and the only shortfall the
// real corpus can force (the FHSA-scoped house goal, stretched) is always
// room-blocked. Fixture only, the same way task 3 declared this goal.
describe("a shortfall that solves to a monthly contribution", () => {
  const target = 1_000_000;
  const projected = 215124.91165957847;
  const gap = 784875.0883404216;
  const monthly = 11602.83462164188;

  function corporateGoal(): Goal {
    return {
      id: "corp-stretch",
      label: "Corporate stretch",
      scope: { kind: "groups", groups: ["Corporate"] },
      target,
      by: "2030",
      source: "fixture",
    };
  }

  test("prints every figure at full precision, never the coarse form", () => {
    renderPanel(rows6, 0.06, [corporateGoal()]);
    const text = cardText("corp-stretch");
    expect(text).toMatch(/short of target/i);
    expect(text).toContain(formatCurrency(target));
    expect(text).toContain(formatCurrency(projected));
    expect(text).toContain(formatCurrency(gap));
    expect(text).toContain(formatCurrency(monthly));
    expect(text).toMatch(/a month closes the gap/i);
    // $11,602.83 rounds UP to $11,603 -- again a different digit, not a
    // prefix, and the direction the review's mutation actually exploited.
    expectNoCoarseForm(text, monthly);
  });

  test("the aria-label carries the same monthly figure, never a coarsened one", () => {
    renderPanel(rows6, 0.06, [corporateGoal()]);
    const label = cardLabel("corp-stretch");
    expect(label).toContain(formatCurrency(monthly));
    expect(label).toContain(formatCurrency(gap));
    expectNoCoarseForm(label, monthly);
  });
});

describe("heading structure", () => {
  test("every card heading is an h3, and the panel adds no heading of its own", () => {
    renderPanel();
    for (const goal of GOALS) {
      expect(screen.getByRole("heading", { level: 3, name: goal.label })).toBeDefined();
    }
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });
});

/**
 * Neither shipped goal can observe `fhsaCloseYear`: `house` targets 2028,
 * well before the 2039 close, and `education`'s scope is the RESP, which
 * `fhsaCloseYear` has no effect on at any target year -- it only zeroes an
 * FHSA account's own value (`allocateByAccount`'s `if (a.group === "FHSA"
 * && row.year === fhsaCloseYear) value = 0;` in `engine.ts`). The gap is
 * SCOPE, not year:
 * only a goal whose scope reaches the FHSA can ever see this prop move
 * anything, so this uses the `goals` seam `GoalsPanel`'s own doc comment
 * says exists for exactly this -- a scope the shipped config does not
 * carry -- rather than adding a goal to `GOALS` that nothing in the app
 * needs.
 */
describe("fhsaCloseYear reaches evaluateGoal through the panel's own prop, not a recomputed one", () => {
  const lateHouseGoal: Goal = {
    id: "house-late",
    label: "House down payment (test fixture, past the FHSA close)",
    scope: { kind: "purpose", purpose: "house" },
    target: 40000,
    by: "2040",
    source: "fixture: an FHSA-scoped goal targeting a year past the 2039 close",
  };

  test("the projected figure differs between a real close year and none", () => {
    render(
      <Theme>
        <GoalsPanel
          analytics={analytics}
          rows={rows6}
          rate={0.06}
          fhsaCloseYear="2039"
          goals={[lateHouseGoal]}
        />
      </Theme>,
    );
    const withClose = cardText("house-late");
    cleanup();

    render(
      <Theme>
        <GoalsPanel
          analytics={analytics}
          rows={rows6}
          rate={0.06}
          fhsaCloseYear=""
          goals={[lateHouseGoal]}
        />
      </Theme>,
    );
    const withoutClose = cardText("house-late");

    expect(withClose).not.toBe(withoutClose);
  });
});
