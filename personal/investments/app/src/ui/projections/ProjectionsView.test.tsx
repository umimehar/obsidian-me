import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { evaluateGoal } from "../../goals/evaluate";
import { GOLDENS } from "../../goldens";
import { loadPlan, retirementYear } from "../../plan";
import { projectYears } from "../../projection/engine";
import { fittedReturnRate } from "../../projection/fittedRate";
import { projectionInputs } from "../../projection/inputs";
import { runScenarios } from "../../projection/scenario";
import {
  chartSubject,
  chartableAccounts,
  defaultSelection,
  isDefaultSelection,
} from "../chartAccounts";
import { loadAnalytics } from "../data";
import { formatCurrency, formatRate } from "../format";
import { expectNoCoarseForm } from "../testSupport/coarseForm";
import { ProjectionsView } from "./ProjectionsView";

/**
 * Against the real committed corpus. The default-selection headline figures
 * below come from `data/goldens.json`, regenerated only by `bun run
 * goldens`, never by calling `runScenarios` a second time here: a bug in
 * `runScenarios` would otherwise be invisible, since the page and the "test's
 * own expectation" would be wrong in exactly the same way. A non-default
 * selection (a single account) has no golden, so those tests build their own
 * expectation the same way `scenariosFor` below does -- an unavoidable and
 * narrower overlap, confined to a selection the goldens do not cover.
 */
const analytics = loadAnalytics();
const plan = loadPlan();
const fitted = fittedReturnRate(analytics.series);
const retireYear = retirementYear(plan);

const DEFAULT_ACCOUNTS = defaultSelection(analytics.series);

function scenariosFor(accounts: ReadonlySet<string>, rate = 0.06, inflation = plan.inflation) {
  const start = Number(
    analytics.series
      .flatMap((a) => a.months.map((m) => m.period))
      .sort()
      .at(-1)
      ?.slice(0, 4) ?? "0",
  );
  const years = Math.max(30, retireYear - start);
  return runScenarios(analytics, accounts, { rate, spread: 0.02, inflation, years });
}

/** A stateful wrapper, the same shape App.tsx gives the view: the account selection lives above it. */
function Harness({ initial = DEFAULT_ACCOUNTS }: { initial?: ReadonlySet<string> }) {
  const [accounts, setAccounts] = useState<Set<string>>(new Set(initial));
  const options = chartableAccounts(analytics.series);
  return (
    <Theme>
      <ProjectionsView
        analytics={analytics}
        accountOptions={options}
        accounts={accounts}
        onAccountsChange={setAccounts}
        onReset={() => setAccounts(defaultSelection(analytics.series))}
        subject={chartSubject(analytics.series, accounts)}
      />
    </Theme>
  );
}

function text(hook: string): string {
  return document.querySelector(`[data-${hook}]`)?.textContent ?? "";
}

function rateSlider(): HTMLInputElement {
  const node = document.querySelector("#projection-rate");
  if (node === null) throw new Error("expected the rate slider");
  return node as HTMLInputElement;
}

function inflationSlider(): HTMLInputElement {
  const node = document.querySelector("#projection-inflation");
  if (node === null) throw new Error("expected the inflation slider");
  return node as HTMLInputElement;
}

function trigger(): HTMLElement {
  const node = document.querySelector<HTMLElement>("[data-account-filter]");
  if (node === null) throw new Error("expected the account filter to render");
  return node;
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

afterEach(cleanup);

describe("the dollars toggle, against the goldens", () => {
  test("defaults to today's dollars, and the retirement tile matches the golden real figure", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "Today's dollars", checked: true })).toBeDefined();
    expect(text("retirement-tile")).toContain(formatCurrency(GOLDENS.projection.retirementReal));
    expectNoCoarseForm(text("retirement-tile"), GOLDENS.projection.retirementReal);
  });

  test("switching to future dollars shows the golden nominal figure instead", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Future dollars" }));
    expect(text("retirement-tile")).toContain(formatCurrency(GOLDENS.projection.retirementNominal));
    expect(text("retirement-tile")).not.toContain(
      formatCurrency(GOLDENS.projection.retirementReal),
    );
  });
});

describe("the rate slider", () => {
  test("its aria-valuetext equals the visible label", () => {
    render(<Harness />);
    expect(rateSlider().getAttribute("aria-valuetext")).toBe(formatRate(6));
    fireEvent.change(rateSlider(), { target: { value: "10" } });
    expect(rateSlider().getAttribute("aria-valuetext")).toBe(formatRate(10));
    expect(screen.getByText(/Return rate assumed: 10\.00%/)).toBeDefined();
  });

  test("raising it raises the retirement tile's real figure", () => {
    render(<Harness />);
    const before = text("retirement-tile");
    fireEvent.change(rateSlider(), { target: { value: "10" } });
    expect(text("retirement-tile")).not.toBe(before);
  });

  test("the goals panel's projected figure follows the rate slider to its own new value", () => {
    render(<Harness />);
    const goal = plan.goals[0];
    if (goal === undefined) throw new Error("expected at least one plan goal");

    // The same year count `ProjectionsView` itself derives, so `verdictAt6`
    // and `verdictAt10` are the literal figures the rendered card must show
    // at each rate -- not merely "some figure that changed".
    const startYear = Number(projectionInputs(analytics).startYear || 0);
    const years = Math.max(30, retireYear - startYear);
    const inputsAt6 = projectionInputs(analytics, { returnRate: 0.06, years });
    const inputsAt10 = projectionInputs(analytics, { returnRate: 0.1, years });
    const verdictAt6 = evaluateGoal(
      goal,
      analytics,
      projectYears(inputsAt6),
      0.06,
      inputsAt6.fhsaCloseYear,
    );
    const verdictAt10 = evaluateGoal(
      goal,
      analytics,
      projectYears(inputsAt10),
      0.1,
      inputsAt10.fhsaCloseYear,
    );
    if (verdictAt6.projected === null || verdictAt10.projected === null) {
      throw new Error("expected a projectable goal at both rates");
    }
    expect(verdictAt10.projected).not.toBeCloseTo(verdictAt6.projected, 0);

    const before = screen.getByTestId(`goal-${goal.id}`).getAttribute("aria-label") ?? "";
    expect(before).toContain(formatCurrency(verdictAt6.projected));

    fireEvent.change(rateSlider(), { target: { value: "10" } });
    const after = screen.getByTestId(`goal-${goal.id}`).getAttribute("aria-label") ?? "";
    expect(after).toContain(formatCurrency(verdictAt10.projected));
    expect(after).not.toContain(formatCurrency(verdictAt6.projected));
  });
});

describe("the inflation slider", () => {
  test("its aria-valuetext equals the visible label", () => {
    render(<Harness />);
    fireEvent.change(inflationSlider(), { target: { value: "4" } });
    expect(inflationSlider().getAttribute("aria-valuetext")).toBe(formatRate(4));
    expect(screen.getByText(/Inflation assumed: 4\.00%/)).toBeDefined();
  });

  test("moving it changes the today's-dollars tile, never the future-dollars one", () => {
    render(<Harness />);
    const before = text("retirement-tile");
    fireEvent.change(inflationSlider(), { target: { value: "4" } });
    const after = text("retirement-tile");
    expect(after).not.toBe(before);

    fireEvent.click(screen.getByRole("radio", { name: "Future dollars" }));
    const nominalAt4 = text("retirement-tile");
    fireEvent.change(inflationSlider(), { target: { value: "1" } });
    expect(text("retirement-tile")).toBe(nominalAt4);
  });
});

describe("the fitted rate is context only", () => {
  test("no element applies it with one click", () => {
    render(<Harness />);
    expect(document.querySelector("[data-apply-fitted]")).toBeNull();
  });

  test("states the window and the words, not a thirty year expectation", () => {
    render(<Harness />);
    expect(text("projection-fitted-context")).toContain(`Your last ${fitted.months} months ran at`);
    expect(text("projection-fitted-context")).toContain(`${formatRate(fitted.rate * 100)} a year`);
    expect(text("projection-fitted-context")).toContain("not a thirty year expectation");
  });
});

describe("milestones and retirement income, against the goldens", () => {
  test("the milestone tiles state the golden year for each threshold", () => {
    render(<Harness />);
    expect(document.querySelector('[data-milestone="500k"]')?.textContent).toContain(
      GOLDENS.projection.milestone500kYear ?? "not within the horizon",
    );
    expect(document.querySelector('[data-milestone="1m"]')?.textContent).toContain(
      GOLDENS.projection.milestone1mYear ?? "not within the horizon",
    );
  });

  test("the income tile matches the golden monthly figure, in today's dollars", () => {
    render(<Harness />);
    expect(text("retirement-income")).toContain(
      formatCurrency(GOLDENS.projection.retirementMonthlyIncome),
    );
    expectNoCoarseForm(text("retirement-income"), GOLDENS.projection.retirementMonthlyIncome);
  });
});

describe("the seam", () => {
  /**
   * `Halves` always draws the projected path starting from `series.seam`
   * itself, so the two paths meeting at one pixel is true by construction
   * for ANY history, including one that draws the wrong accounts entirely --
   * asserting only that agreement proves nothing. This asserts the seam's
   * actual VALUE, read off the chart's own accessible summary ("ending at
   * $X"), against `runScenarios`' opening figure for a selection that is
   * neither the default nor the whole portfolio: two accounts, one the
   * engine covers and one it does not, so a history built from the wrong
   * set would show a visibly different total.
   */
  test("the last stated point equals runScenarios' opening figure for the SELECTED accounts, not the portfolio", () => {
    const selected = new Set(
      chartableAccounts(analytics.series)
        .filter((a) => a.label === "Corporate (self)" || a.label === "Crypto")
        .map((a) => a.maskedId),
    );
    render(<Harness initial={selected} />);

    const startYear = Number(projectionInputs(analytics).startYear || 0);
    const years = Math.max(30, retireYear - startYear);
    const set = runScenarios(analytics, selected, {
      rate: 0.06,
      spread: 0.02,
      inflation: plan.inflation,
      years,
    });
    const opening = set.base.points[0]?.nominal;
    if (opening === undefined) throw new Error("expected an opening point");

    const label = document.querySelector("svg[role='img']")?.getAttribute("aria-label") ?? "";
    expect(label).toContain(`ending at ${formatCurrency(opening)}`);
  });
});

describe("the account selection is shared with the filter on this page", () => {
  function soloSelection(label: string): Set<string> {
    return new Set(
      chartableAccounts(analytics.series)
        .filter((a) => a.label === label)
        .map((a) => a.maskedId),
    );
  }

  test("the filter's button names the single selected account, not the portfolio", async () => {
    render(<Harness initial={soloSelection("Crypto")} />);
    await openFilter();
    expect(trigger().textContent).toBe("Crypto");
    expect(item("Crypto").getAttribute("aria-checked")).toBe("true");
  });

  test("selecting one account changes the retirement tile to that account's own scenario", () => {
    const solo = soloSelection("Corporate (self)");
    render(<Harness initial={solo} />);
    const set = scenariosFor(solo);
    const point = set.base.points.find((p) => Number(p.year) === retireYear);
    expect(text("retirement-tile")).toContain(formatCurrency(point?.real ?? Number.NaN));
  });

  test("a selection outside the engine's coverage still renders, naming the uncompounded accounts", () => {
    render(<Harness initial={soloSelection("Crypto")} />);
    expect(document.querySelector("[data-projection-empty]")).toBeNull();
    expect(text("projection-assumptions")).toContain("Crypto");
    expect(text("projection-assumptions")).toContain("no new money");
  });
});

describe("goals and runway still render, reading the plan's own goals", () => {
  test("a card exists for every plan goal", () => {
    render(<Harness />);
    for (const goal of plan.goals) {
      expect(screen.getByTestId(`goal-${goal.id}`)).toBeDefined();
    }
  });

  test("the runway table's window line matches the engine's own first and last years", () => {
    render(<Harness />);
    // The same rate, and the same year count `ProjectionsView` itself
    // derives (30, widened to reach the plan's retirement year), so `first`
    // and `last` are the literal years the rendered table's rows span.
    const startYear = Number(projectionInputs(analytics).startYear || 0);
    const years = Math.max(30, retireYear - startYear);
    const rows = projectYears(projectionInputs(analytics, { returnRate: 0.06, years }));
    const first = rows[0]?.year;
    const last = rows.at(-1)?.year;
    if (first === undefined || last === undefined) throw new Error("expected projected rows");
    const windowLine = document.querySelector("[data-runway-window]")?.textContent ?? "";
    expect(windowLine).toContain(`runs from ${first} to ${last}`);
  });

  test("the runway table renders", () => {
    render(<Harness />);
    expect(document.querySelector("[data-runway-table], [data-runway-empty]")).not.toBeNull();
  });
});

describe("the scenario disclaimer", () => {
  test("is present and states this is a scenario, not a forecast", () => {
    render(<Harness />);
    expect(text("projection-disclaimer")).toContain("This is a scenario, not a forecast");
  });
});

describe("empty selection", () => {
  test("an empty opening balance renders the empty state rather than a chart", () => {
    render(<Harness initial={new Set()} />);
    expect(document.querySelector("[data-projection-empty]")).not.toBeNull();
  });
});

describe("isDefaultSelection stays true for the starting selection", () => {
  test("the account filter opens labelled Portfolio", () => {
    render(<Harness />);
    expect(isDefaultSelection(analytics.series, DEFAULT_ACCOUNTS)).toBe(true);
    expect(trigger().textContent).toBe(`Portfolio (${DEFAULT_ACCOUNTS.size} accounts)`);
  });
});

describe("heading structure", () => {
  test("the exact h3 names appear in document order: the three tiles, each goal, then the runway", () => {
    render(<Harness />);
    screen.getByRole("heading", { level: 2, name: "Where this is heading" });
    const h3s = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    const expected = [
      /^At retirement, .+ \(age \d+\)$/,
      /^Monthly income at [\d.]+% a year$/,
      "Milestones, today's dollars",
      ...plan.goals.map((goal) => goal.label),
      "Room runway",
    ];
    // A demoted or promoted tile heading shifts every name after it by one
    // position, so an exact, ordered comparison catches that where a mere
    // count or an unordered "every name is present somewhere" check would not.
    expect(h3s).toHaveLength(expected.length);
    expected.forEach((match, index) => {
      if (typeof match === "string") expect(h3s[index]).toBe(match);
      else expect(h3s[index]).toMatch(match);
    });
  });
});
