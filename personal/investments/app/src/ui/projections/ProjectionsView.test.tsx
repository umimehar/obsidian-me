import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnalyticsOutput } from "../../analytics/build";
import { projectYears } from "../../projection/engine";
import { fittedReturnRate } from "../../projection/fittedRate";
import { projectedAccounts, projectionInputs } from "../../projection/inputs";
import { loadAnalytics } from "../data";
import { formatCurrency, formatRate } from "../format";
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
