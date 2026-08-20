import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnalyticsOutput } from "../../analytics/build";
import { GOALS } from "../../goals/config";
import { evaluateGoal } from "../../goals/evaluate";
import { projectYears } from "../../projection/engine";
import { fittedReturnRate } from "../../projection/fittedRate";
import { projectedAccounts, projectionInputs } from "../../projection/inputs";
import { loadAnalytics } from "../data";
import { formatCurrency, formatRate, formatWholeDollars } from "../format";
import { ProjectionsView } from "./ProjectionsView";

/**
 * Against the real committed corpus. The statements end 2026-06, the accounts
 * this projection covers hold $180,941.35 of the $241,739.67 portfolio, and
 * the fit over 37 months is 24.84% a year. Every expected figure below is
 * recomputed from the engine rather than transcribed, so a corpus change
 * reddens these tests instead of quietly changing what the page claims.
 */
const analytics = loadAnalytics();
const fitted = fittedReturnRate(analytics.series);

/** The engine's own end value for one rate, which is what the page must state. */
function endValueAt(rate: number): number {
  const rows = projectYears(projectionInputs(analytics, { returnRate: rate }));
  return rows[rows.length - 1]?.value ?? Number.NaN;
}

function renderView(payload: AnalyticsOutput = analytics) {
  render(<ProjectionsView analytics={payload} />);
}

function text(hook: string): string {
  return document.querySelector(`[data-${hook}]`)?.textContent ?? "";
}

function slider(): HTMLInputElement {
  const node = document.querySelector("#projection-rate");
  if (node === null) throw new Error("expected the rate slider");
  return node as HTMLInputElement;
}

function pathD(name: string): string {
  return document.querySelector(`[data-${name}]`)?.getAttribute("d") ?? "";
}

function setRate(percent: number) {
  fireEvent.change(slider(), { target: { value: String(percent) } });
}

afterEach(cleanup);

describe("the default rate is 6%, and it is not the fitted rate", () => {
  test("the rate in use is 6.00% before anything is touched", () => {
    renderView();
    expect(text("projection-rate")).toBe("Rate in use: 6.00% a year.");
    expect(text("projection-rate")).not.toContain("24.84");
  });

  /**
   * The load-bearing assertion of the owner's 2026-08-07 decision. The fitted
   * 24.84% is arithmetically right and implausible over thirty years: it
   * compounds to about $431M against 6%'s $7.6M. Defaulting back to it reddens
   * this test, which is the whole point of stating it here.
   */
  test("the projected end value is the engine's 6% figure, not its fitted-rate figure", () => {
    renderView();
    expect(text("projection-end-value")).toBe(formatCurrency(endValueAt(0.06)));
    expect(text("projection-end-value")).not.toBe(formatCurrency(endValueAt(fitted.rate)));
  });

  test("the 6% figure is $7,636,455.38 and the fitted figure is $431,418,851.44, two orders apart", () => {
    expect(formatCurrency(endValueAt(0.06))).toBe("$7,636,455.38");
    expect(formatCurrency(endValueAt(fitted.rate))).toBe("$431,418,851.44");
  });

  test("the default is labelled a convention and disclaimed as not from the data", () => {
    renderView();
    expect(text("projection-provenance")).toContain(
      "The default, 6.00% a year, is a conventional long-run assumption. It did not come from your data.",
    );
  });

  test("the end value carries its year and full cents", () => {
    renderView();
    expect(
      screen.getByRole("heading", { name: "Projected value at the end of 2056" }),
    ).toBeDefined();
    expect(text("projection-end-value")).toBe("$7,636,455.38");
  });
});

describe("the fitted rate renders beside the default, with its provenance", () => {
  test("states the figure, the window, the accounts, the fitted steps and the word derived", () => {
    renderView();
    const provenance = text("projection-provenance");
    expect(provenance).toContain(`Your last ${fitted.months} months ran at`);
    expect(provenance).toContain(`${formatRate(fitted.rate * 100)} a year, net of deposits`);
    expect(provenance).toContain("derived here, not stated on any statement");
    expect(provenance).toContain(`fitted across ${fitted.accounts} counted accounts`);
    expect(provenance).toContain(`over ${fitted.monthsFitted} month to month steps`);
  });

  test("the corpus's own figures reach the page: 37 months, 24.84%, 11 accounts, 35 steps", () => {
    renderView();
    const provenance = text("projection-provenance");
    expect(provenance).toContain("Your last 37 months ran at 24.84% a year");
    expect(provenance).toContain("fitted across 11 counted accounts over 35 month to month steps");
  });

  test("the three-year window is stated as the caveat, so it never reads as an expectation", () => {
    renderView();
    expect(text("projection-provenance")).toContain(
      "Three years is a short window over one strong run, so it is a record of a period rather than a thirty year expectation.",
    );
  });

  /**
   * The netting behind the fitted rate subtracts cash deposits only. Securities
   * transferred in kind arrive in no cash block and state no dollar value, so
   * they cannot be netted out and read as growth instead. The corpus has such
   * rows in 2023-08. The count is not available in `analytics.json`, so the
   * line says what is true without claiming the netting is complete.
   */
  test("the limit of that netting is stated rather than left implied", () => {
    renderView();
    const provenance = text("projection-provenance");
    expect(provenance).toContain("Securities transferred in kind are not netted out");
    expect(provenance).toContain("reads as growth");
  });

  test("a control applies it, labelled with the figure it applies", () => {
    renderView();
    const button = document.querySelector("[data-apply-fitted]");
    expect(button?.textContent).toBe("Apply your fitted 24.84%");
  });
});

describe("the rate control moves the projection either way", () => {
  test("applying the fitted rate changes the projected end value to the fitted figure", () => {
    renderView();
    expect(text("projection-end-value")).toBe(formatCurrency(endValueAt(0.06)));
    fireEvent.click(screen.getByRole("button", { name: /Apply your fitted/ }));
    expect(text("projection-end-value")).toBe(formatCurrency(endValueAt(fitted.rate)));
    expect(text("projection-rate")).toBe(`Rate in use: ${formatRate(fitted.rate * 100)} a year.`);
  });

  test("the slider moves the rate down as well as up", () => {
    renderView();
    setRate(3);
    expect(text("projection-end-value")).toBe(formatCurrency(endValueAt(0.03)));
    setRate(12);
    expect(text("projection-end-value")).toBe(formatCurrency(endValueAt(0.12)));
  });

  test("a control returns to the 6% default after the fitted rate has been applied", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Apply your fitted/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back to 6.00%" }));
    expect(text("projection-end-value")).toBe(formatCurrency(endValueAt(0.06)));
  });

  test("the slider reaches the fitted rate, so the applied figure is inside its range", () => {
    renderView();
    expect(Number(slider().getAttribute("max"))).toBeGreaterThanOrEqual(fitted.rate * 100);
    expect(Number(slider().getAttribute("min"))).toBe(0);
  });
});

describe("the seam is real, not cosmetic: the stated half does not move", () => {
  test("the stated path is byte for byte identical after the rate changes", () => {
    renderView();
    const before = pathD("history-line");
    const area = pathD("history-area");
    expect(before).not.toBe("");
    setRate(1);
    expect(pathD("history-line")).toBe(before);
    setRate(20);
    expect(pathD("history-line")).toBe(before);
    expect(pathD("history-area")).toBe(area);
  });

  test("the projected path does change, so the comparison above is not vacuous", () => {
    renderView();
    const before = pathD("projection-line");
    setRate(20);
    expect(pathD("projection-line")).not.toBe(before);
  });

  test("the axis itself holds still, which is what keeps the stated half still", () => {
    renderView();
    const ticks = () =>
      [...document.querySelectorAll("svg text")]
        .map((node) => `${node.textContent}@${node.parentElement?.getAttribute("transform")}`)
        .join("|");
    const before = ticks();
    setRate(20);
    expect(ticks()).toBe(before);
  });

  /**
   * A fixed axis is only honest if it is wide enough for every scenario the
   * controls can reach. The fitted rate ends about fifty times higher than the
   * default's, so an axis built from the default would draw that line off the
   * top of the plot and clip a figure rather than state it.
   */
  test("no mark leaves the plot, even at the highest rate the controls offer", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Apply your fitted/ }));
    const ys = [...pathD("projection-line").matchAll(/[ML][\d.-]+,([\d.-]+)/g)].map((match) =>
      Number(match[1]),
    );
    expect(ys.length).toBeGreaterThan(1);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(294);
    }
  });

  test("the seam stays at the last statement period whatever the rate", () => {
    renderView();
    const seamPeriod = () =>
      document.querySelector("[data-seam]")?.getAttribute("data-seam-period");
    expect(seamPeriod()).toBe("2026-06");
    setRate(20);
    expect(seamPeriod()).toBe("2026-06");
  });

  test("the stated half ends at the covered accounts' own total, so the seam joins without a step", () => {
    renderView();
    expect(text("projection-coverage")).toContain("the history line ends at $180,941.35");
  });
});

describe("the disclaimer sits next to the figure it qualifies", () => {
  test("says it is a scenario, that the return is flat, and that it is neither advice nor filing", () => {
    renderView();
    const disclaimer = text("projection-disclaimer");
    expect(disclaimer).toContain("This is a scenario, not a forecast");
    expect(disclaimer).toContain("one flat return every year for thirty years");
    expect(disclaimer).toContain("not advice and it is not a filing figure");
  });

  test("renders between the end value and the chart, not at the end of the page", () => {
    renderView();
    const nodes = [...document.body.querySelectorAll("*")];
    const index = (selector: string) => nodes.indexOf(document.querySelector(selector) as Element);
    expect(index("[data-projection-end-value]")).toBeLessThan(
      index("[data-projection-disclaimer]"),
    );
    expect(index("[data-projection-disclaimer]")).toBeLessThan(index("[data-projection-chart]"));
  });
});

describe("what the projection covers", () => {
  test("names the accounts left out and the money in them, rather than leaving a silent gap", () => {
    renderView();
    const coverage = text("projection-coverage");
    expect(coverage).toContain("covers 8 counted accounts");
    expect(coverage).toContain("3 counted accounts holding $60,798.32 are left out");
    expect(coverage).toContain("rather than at the portfolio total of $241,739.67");
  });
});

describe("nothing to project from", () => {
  /** No counted account states a market value: the view must say so, not project from zero. */
  const empty: AnalyticsOutput = {
    ...analytics,
    series: [],
    rollups: { ...analytics.rollups, registration: [] },
  };

  test("says there is nothing to project from", () => {
    renderView(empty);
    expect(text("projection-empty")).toContain("state no market value to start from");
    expect(text("projection-empty")).toContain(
      "A projection from zero would be a figure about nothing",
    );
  });

  /**
   * The harder half of the same rule. A corpus whose covered accounts have
   * been drawn down to zero still has contribution rules behind it, so the
   * engine will happily compound a projection out of nothing but future
   * contributions. There is no opening balance to project from, and the view
   * has to say so rather than draw that.
   */
  test("a portfolio drawn down to zero is an empty state, not a projection from contributions", () => {
    const account = projectedAccounts(analytics.series).find((one) => one.months.length > 1);
    if (account === undefined) throw new Error("expected a covered account with a history");
    const last = account.months[account.months.length - 1];
    if (last === undefined) throw new Error("expected a stated month");
    const drained: AnalyticsOutput = {
      ...analytics,
      series: [
        { ...account, months: [...account.months.slice(0, -1), { ...last, marketValue: 0 }] },
      ],
      rollups: {
        ...analytics.rollups,
        registration: analytics.rollups.registration.map((group) => ({ ...group, total: 0 })),
      },
    };
    renderView(drained);
    expect(text("projection-empty")).toContain("state no market value to start from");
    expect(document.querySelector("[data-projection-end-value]")).toBeNull();
  });

  test("draws no chart and states no end value", () => {
    renderView(empty);
    expect(document.querySelector("[data-projection-chart]")).toBeNull();
    expect(document.querySelector("[data-projection-end-value]")).toBeNull();
    expect(document.querySelector("[data-seam]")).toBeNull();
  });
});

describe("the goals panel and the room runway table are mounted below the chart", () => {
  test("the projections tab renders the goals panel", () => {
    renderView();
    expect(screen.getByTestId("goal-house")).toBeDefined();
    expect(screen.getByTestId("goal-education")).toBeDefined();
  });

  test("the projections tab renders the runway table", () => {
    renderView();
    expect(screen.getByTestId("runway-fhsa-close")).toBeDefined();
  });

  /**
   * `RunwayTable` is handed `rows` rather than deriving its own, so it and
   * the chart beside it read the same projection -- but nothing else pins
   * that the two actually agree: `rows={rows.slice(1)}` at the call site is
   * 1151 pass / 0 fail without this, and would silently open the window
   * line a year later than the chart's own history actually starts. The
   * years are recomputed straight from the engine here, the same way every
   * other expected figure in this file is, rather than transcribed.
   */
  test("the runway table's window line states the same first and last year the engine's own rows carry", () => {
    renderView();
    const engineRows = projectYears(projectionInputs(analytics, { returnRate: 0.06 }));
    const firstYear = engineRows[0]?.year;
    const lastYear = engineRows.at(-1)?.year;
    if (firstYear === undefined || lastYear === undefined)
      throw new Error("expected projection rows");
    expect(text("runway-window")).toContain(`runs from ${firstYear} to ${lastYear}`);
  });

  /**
   * `rows` is pinned by the window-line test above; `inputs` itself was not.
   * `<RunwayTable inputs={{ ...inputs, fhsaCloseYear: "2050" }} />` and
   * `<RunwayTable inputs={{ ...inputs, rules: { ...inputs.rules, fhsaLifetime: 999 } }} />`
   * were both 1157 pass / 0 fail without this: the runway would state a
   * close year or a lifetime cap that disagrees with the goal card two
   * inches above it, and nothing would notice. Both figures are recomputed
   * straight from the engine, never transcribed.
   */
  test("the runway table's FHSA close year and lifetime cap state the same figures the engine's own inputs carry", () => {
    renderView();
    const engineInputs = projectionInputs(analytics, { returnRate: 0.06 });
    expect(screen.getByTestId("runway-fhsa-close").textContent).toContain(
      engineInputs.fhsaCloseYear,
    );
    expect(screen.getByTestId("runway-fhsa-cap").textContent).toContain(
      formatWholeDollars(engineInputs.rules.fhsaLifetime),
    );
  });

  /**
   * The describe title says "mounted below the chart", and that claim was
   * never checked: swapping the two new sections, or moving either above
   * `<ProjectionChart>` or above the view's own `h2`, was 1151 pass / 0 fail
   * before this test existed.
   */
  test("the heading, the chart, the goals panel and the runway table appear in that document order", () => {
    renderView();
    const nodes = [...document.body.querySelectorAll("*")];
    const index = (el: Element | null) => nodes.indexOf(el as Element);
    const heading = screen.getByRole("heading", { level: 2, name: "Thirty year projection" });
    const chart = document.querySelector("[data-projection-chart]");
    const goalCard = screen.getByTestId("goal-house");
    const runwayTable = document.querySelector("[data-runway-table]");
    expect(index(heading)).toBeGreaterThanOrEqual(0);
    expect(index(heading)).toBeLessThan(index(chart));
    expect(index(chart)).toBeLessThan(index(goalCard));
    expect(index(goalCard)).toBeLessThan(index(runwayTable));
  });

  test("both sit at h3, one level under the view's own h2, with no level skipped", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 2, name: "Thirty year projection" })).toBeDefined();
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });

  /**
   * The owner's decision made observable end to end: moving the rate must
   * re-judge a goal, not only move the chart beside it. The control here is
   * a native `<input type="range">`, not a Radix slider (see `RateControl`
   * in `ProjectionsView.tsx`), so `fireEvent.change` through `setRate` is
   * the real interaction path a drag takes under happy-dom, not a
   * substitute for one the keyboard path would otherwise cover.
   *
   * Asserts equality against the engine's own value at the moved rate, not
   * merely that the figure differs from before. "It changed" is the weaker
   * claim, and it stays green for `<GoalsPanel rows={rows at 6%} rate={live}
   * />`: `evaluateGoal` (`evaluate.ts:102`) passes the live `rate` straight
   * into `accountValues`, so frozen rows plus a live rate compounds
   * contribution inflows computed at 6% at 20% instead -- a scenario that
   * exists nowhere on this page -- and the figure still moves, so a
   * before/after inequality check cannot tell that mutation from a correct
   * one. Equality against the real engine output at the real rate can.
   */
  test("moving the rate slider changes a goal's projected figure to the engine's own value at that rate", () => {
    renderView();
    setRate(20);
    const rows20 = projectYears(projectionInputs(analytics, { returnRate: 0.2 }));
    const inputs20 = projectionInputs(analytics, { returnRate: 0.2 });
    const educationGoal = GOALS.find((g) => g.id === "education");
    if (educationGoal === undefined) throw new Error("expected the education goal");
    const verdict = evaluateGoal(educationGoal, analytics, rows20, 0.2, inputs20.fhsaCloseYear);
    if (verdict.projected === null) throw new Error("expected a projectable goal at 20%");
    expect(screen.getByTestId("goal-education").textContent).toContain(
      formatCurrency(verdict.projected),
    );
  });

  /**
   * `GoalsPanel` is handed `inputs.fhsaCloseYear` at the call site
   * (`ProjectionsView.tsx`), and nothing before this test pinned it.
   * `fhsaCloseYear={"2028"}` was 1158 pass / 0 fail without this: 2028 is
   * also the house goal's own target year, so `engine.ts`'s
   * `allocateByAccount` zeroes the FHSA account's value on that exact row
   * (`if (a.group === "FHSA" && row.year === fhsaCloseYear) value = 0;`),
   * and the house card would render $0.00 projected, "$40,000.00 short of
   * target" and the room-blocked line under a fully green suite. The real
   * corpus's own close year, 2039, is used here rather than an empty string
   * or a far-future year -- both are genuinely inert against every shipped
   * goal, since `""` never equals a row's `year` and 2039 already sits well
   * past the house goal's 2028 target -- so only the true value, read
   * straight from the engine, can catch the close year landing on a goal's
   * own target year.
   */
  test("the goals panel renders the engine's own FHSA close year, not a value that happens to leave the suite green", () => {
    renderView();
    const engineInputs = projectionInputs(analytics, { returnRate: 0.06 });
    const rows6 = projectYears(engineInputs);
    const houseGoal = GOALS.find((g) => g.id === "house");
    if (houseGoal === undefined) throw new Error("expected the house goal");
    const verdict = evaluateGoal(
      houseGoal,
      analytics,
      rows6,
      0.06,
      engineInputs.fhsaCloseYear,
    );
    if (verdict.projected === null) throw new Error("expected a projectable house goal");
    expect(screen.getByTestId("goal-house").textContent).toContain(
      formatCurrency(verdict.projected),
    );
    expect(screen.getByTestId("goal-house").textContent).toMatch(/ahead of target/i);
  });

  /**
   * `buildRunway`'s own doc comment (`runway.ts`) states that no row it
   * produces moves with the return rate, contribution-driven or statutory --
   * `roomRemaining` (`engine.ts:320-324`) is computed from
   * `contributedThisYear` alone, never from `advanceValues`'s
   * return-compounded balances. That property is pinned directly against the
   * engine in `runway.test.ts` ("the entire runway is byte-for-byte
   * identical at 0% and at 25%"); this is the same fact checked at the
   * mounted-page level, through the live rate slider rather than a
   * hand-built `ProjectionInputs`.
   */
  test("the runway table still renders correctly after the rate moves, even though its contribution-driven years do not follow it", () => {
    renderView();
    const before = screen.getByTestId("runway-fhsa-cap").textContent ?? "";
    setRate(20);
    expect(screen.getByTestId("runway-fhsa-cap").textContent).toBe(before);
  });

  test("neither the goals panel nor the runway table render in the empty state, and neither throws reaching it", () => {
    const empty: AnalyticsOutput = {
      ...analytics,
      series: [],
      rollups: { ...analytics.rollups, registration: [] },
    };
    renderView(empty);
    expect(text("projection-empty")).toContain("state no market value to start from");
    expect(screen.queryByTestId("goal-house")).toBeNull();
    expect(screen.queryByTestId("goal-education")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

/**
 * The slider is the one control on the page whose announcement did not come
 * from the same call as its visible text. A native `<input type="range">`
 * announces `value` when it carries no `aria-valuetext`, so applying the
 * fitted rate had the label read 24.84% while the control said
 * 24.839250232739074 -- a bare unitless number, and a second formatting path
 * for a figure already formatted once.
 */
describe("the slider announces the rate it shows", () => {
  test("the announced value is the visible label's figure, not the raw float", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /apply your fitted/i }));
    const announced = slider().getAttribute("aria-valuetext");
    expect(announced).toBe(formatRate(fitted.rate * 100));
    expect(announced).toBe("24.84%");
    // The raw value stays on the control, since that is what the input needs
    // to position its thumb. It is the announcement that must not be it.
    expect(announced).not.toBe(slider().value);
    expect(announced).not.toContain("24.8392");
  });

  test("the announcement and the visible label are the same string", () => {
    renderView();
    // The fitted rate is taken from the engine rather than transcribed: a
    // literal of it does not survive a double round trip.
    for (const percent of [6, 12.5, fitted.rate * 100]) {
      setRate(percent);
      const announced = slider().getAttribute("aria-valuetext") ?? "";
      expect(announced).not.toBe("");
      expect(text("projection-rate-control")).toContain(announced);
    }
  });

  test("it carries a unit, so the figure is not announced as a bare number", () => {
    renderView();
    expect(slider().getAttribute("aria-valuetext")).toBe("6.00%");
  });
});
