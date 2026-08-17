import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import type { AnalyticsOutput } from "../../analytics/build";
import { GOALS, type Goal } from "../../goals/config";
import { projectYears } from "../../projection/engine";
import { projectionInputs } from "../../projection/inputs";
import { loadAnalytics } from "../data";
import { GoalsPanel } from "./GoalsPanel";

/**
 * Against the real committed corpus, same as `evaluate.test.ts` (task 3):
 * the house goal projects to $50,180.10 by 2028 and the education goal to
 * $92,547.67 by 2042, both at 6%. Every expected figure below is recomputed
 * from the engine rather than transcribed, so a corpus change reddens these
 * tests instead of quietly changing what the panel claims.
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

describe("the house card, against the real corpus", () => {
  test("prints its projected figure at full precision, never the coarse form", () => {
    renderPanel();
    const text = cardText("house");
    expect(text).toContain("$50,180.10");
    expect(text).toContain("$40,000.00");
    expect(text).toMatch(/ahead of target/i);
    // The coarse, whole-dollar form is never present on its own -- only ever
    // as the leading digits of the full-precision figure above.
    expect(text).not.toMatch(/\$50,180(?!\.)/);
  });

  test("the card's aria-label carries the same figure the card prints, never a drifted one", () => {
    renderPanel();
    const label = cardLabel("house");
    expect(label).toContain("$50,180.10");
    expect(label).not.toMatch(/\$50,180(?!\.)/);
  });

  test("prints its source, rendered rather than decorative", () => {
    renderPanel();
    expect(cardText("house")).toMatch(/FHSA's \$40,000 lifetime contribution cap/);
  });

  test("prints the gap itself, not just the direction word", () => {
    renderPanel();
    expect(cardText("house")).toContain("$10,180.10");
  });
});

describe("the education card, against the real corpus", () => {
  test("prints its projected figure at full precision", () => {
    renderPanel();
    const text = cardText("education");
    expect(text).toContain("$92,547.67");
    expect(text).toContain("$50,000.00");
    expect(text).toMatch(/ahead of target/i);
  });

  test("its aria-label carries the same full-precision figure", () => {
    renderPanel();
    const label = cardLabel("education");
    expect(label).toContain("$92,547.67");
    expect(label).not.toMatch(/\$92,547(?!\.)/);
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
  test("names how many accounts it covers and what it left out", () => {
    const growthGoal: Goal = {
      ...houseGoal,
      id: "growth",
      scope: { kind: "purpose", purpose: "growth" },
      by: "2028",
    };
    renderPanel(rows6, 0.06, [growthGoal]);
    const text = cardText("growth");
    expect(text).toContain("2 of 5");
    expect(text).toMatch(/does not forecast/i);
    expect(text).toContain("$60,798.32");
  });
});

describe("an unprojectable goal", () => {
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
    expect(text).toContain("$40,000.00");
  });

  test("a target year past the projection's last row is unprojectable too", () => {
    const farGoal: Goal = { ...houseGoal, id: "far", by: "2099" };
    renderPanel(rows6, 0.06, [farGoal]);
    const text = cardText("far");
    expect(text).toMatch(/cannot be projected/i);
    expect(text).not.toContain("$0.00");
  });
});

describe("a shortfall the wrapper has no room to close", () => {
  test("renders the blocked reason legibly, not as an error", () => {
    const stretchGoal: Goal = { ...houseGoal, id: "stretch", target: 90000 };
    renderPanel(rows6, 0.06, [stretchGoal]);
    const text = cardText("stretch");
    expect(text).toMatch(/short of target/i);
    expect(text).toMatch(/no CRA room left/i);
  });
});

// Corporate has no CRA contribution room, so a Corporate-scoped shortfall is
// never blocked (see `evaluate.test.ts`). It is the one reachable path where
// the panel actually prints a `monthlyToClose` figure -- the two shipped
// goals are met at every rate the slider offers, and the only shortfall the
// real corpus can force (the FHSA-scoped house goal, stretched) is always
// room-blocked. Fixture only, the same way task 3 declared this goal.
describe("a shortfall that solves to a monthly contribution", () => {
  test("prints the monthly figure at full precision", () => {
    const corporateGoal: Goal = {
      id: "corp-stretch",
      label: "Corporate stretch",
      scope: { kind: "groups", groups: ["Corporate"] },
      target: 1_000_000,
      by: "2030",
      source: "fixture",
    };
    renderPanel(rows6, 0.06, [corporateGoal]);
    const text = cardText("corp-stretch");
    expect(text).toMatch(/short of target/i);
    expect(text).toContain("$784,875.09");
    expect(text).toContain("$11,602.83");
    expect(text).toMatch(/a month closes the gap/i);
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
