import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { loadPlan, retirementYear } from "../../plan";
import { fittedReturnRate } from "../../projection/fittedRate";
import { milestoneYear, retirementIncome, runScenarios } from "../../projection/scenario";
import {
  chartSubject,
  chartableAccounts,
  defaultSelection,
  isDefaultSelection,
} from "../chartAccounts";
import { loadAnalytics } from "../data";
import { formatCurrency, formatRate } from "../format";
import { ProjectionsView } from "./ProjectionsView";

/**
 * Against the real committed corpus. Every expected figure below comes from
 * calling the same production functions the view itself calls -- `plan.ts`
 * and `runScenarios` -- rather than a transcribed literal, so a corpus or
 * plan change reddens this suite instead of quietly changing what the page
 * claims.
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

describe("the dollars toggle", () => {
  test("defaults to today's dollars, and the retirement tile matches the real scenario", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "Today's dollars", checked: true })).toBeDefined();
    const set = scenariosFor(DEFAULT_ACCOUNTS);
    const point = set.base.points.find((p) => Number(p.year) === retireYear);
    expect(text("retirement-tile")).toContain(formatCurrency(point?.real ?? Number.NaN));
  });

  test("switching to future dollars shows the nominal figure instead", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Future dollars" }));
    const set = scenariosFor(DEFAULT_ACCOUNTS);
    const point = set.base.points.find((p) => Number(p.year) === retireYear);
    expect(text("retirement-tile")).toContain(formatCurrency(point?.nominal ?? Number.NaN));
    expect(text("retirement-tile")).not.toContain(formatCurrency(point?.real ?? Number.NaN));
  });
});

describe("the rate slider", () => {
  test("raising it raises the retirement tile's real figure", () => {
    render(<Harness />);
    const before = text("retirement-tile");
    fireEvent.change(rateSlider(), { target: { value: "10" } });
    expect(text("retirement-tile")).not.toBe(before);
  });
});

describe("the inflation slider", () => {
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

describe("milestones and retirement income", () => {
  test("the milestone tiles state the year the base scenario reaches each threshold", () => {
    render(<Harness />);
    const set = scenariosFor(DEFAULT_ACCOUNTS);
    const year500k = milestoneYear(set.base.points, 500_000);
    const year1m = milestoneYear(set.base.points, 1_000_000);
    expect(document.querySelector('[data-milestone="500k"]')?.textContent).toContain(
      year500k ?? "not within the horizon",
    );
    expect(document.querySelector('[data-milestone="1m"]')?.textContent).toContain(
      year1m ?? "not within the horizon",
    );
  });

  test("the income tile is the plan's withdrawal rate applied monthly, in today's dollars", () => {
    render(<Harness />);
    const set = scenariosFor(DEFAULT_ACCOUNTS);
    const income = retirementIncome(set.base.points, retireYear, plan.withdrawalRate);
    expect(text("retirement-income")).toContain(formatCurrency(income?.monthly ?? Number.NaN));
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
