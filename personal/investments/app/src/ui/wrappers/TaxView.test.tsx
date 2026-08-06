import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render, screen, within } from "@testing-library/react";
import { loadAnalytics } from "../data";
import { TaxView } from "./TaxView";

/**
 * Real corpus figures (`data/analytics.json`): 2026 interest 0, eligible
 * dividends 201.86, foreign income 16.84, realized gains -1335.86; 2025
 * dividends 19.41, foreign 1.18, realized gains -1067.39. Both years are a
 * realized LOSS, which is the case this view most has to get right.
 */
function renderYear(year: number) {
  render(
    <Theme>
      <TaxView analytics={loadAnalytics()} year={year} />
    </Theme>,
  );
}

function section(name: string) {
  const node = document.querySelector(`[data-tax-${name}]`);
  if (node === null) throw new Error(`expected the tax ${name} section to render`);
  return node as HTMLElement;
}

function row(name: string) {
  const node = document.querySelector(`[data-tax-row="${name}"]`);
  if (node === null) throw new Error(`expected the ${name} row to render`);
  return within(node as HTMLElement);
}

describe("TaxView", () => {
  test("shows the real 2026 income split by type", () => {
    renderYear(2026);
    const income = within(section("income"));
    expect(income.getByText(/interest/i)).toBeDefined();
    expect(income.getByText("$0.00")).toBeDefined();
    expect(income.getByText(/canadian eligible dividends/i)).toBeDefined();
    expect(income.getByText("$201.86")).toBeDefined();
    expect(income.getByText(/foreign income/i)).toBeDefined();
    expect(income.getByText("$16.84")).toBeDefined();
  });

  test("the interest row prints the interest figure, not a constant zero", () => {
    // Every year in the corpus has $0.00 interest, so the real data cannot
    // tell `income.interest` apart from a hardcoded zero. This is the only
    // figure on the page that needs a constructed value to be pinned at all.
    const analytics = loadAnalytics();
    const income2026 = analytics.income["2026"];
    if (income2026 === undefined) throw new Error("expected 2026 income in the corpus");
    render(
      <Theme>
        <TaxView
          analytics={{ ...analytics, income: { 2026: { ...income2026, interest: 412.75 } } }}
          year={2026}
        />
      </Theme>,
    );
    expect(row("interest").getByText("$412.75")).toBeDefined();
  });

  test("the real 2026 realized figure is a loss and is shown as one", () => {
    renderYear(2026);
    const income = within(section("income"));
    expect(income.getByText(/realized loss/i)).toBeDefined();
    expect(income.getByText("-$1,335.86")).toBeDefined();
    expect(income.queryByText("$1,335.86")).toBeNull();
  });

  test("the real 2025 realized figure is a loss too", () => {
    renderYear(2025);
    const income = within(section("income"));
    expect(income.getByText(/realized loss/i)).toBeDefined();
    expect(income.getByText("-$1,067.39")).toBeDefined();
    expect(income.getByText("$19.41")).toBeDefined();
    expect(income.getByText("$1.18")).toBeDefined();
  });

  test("the disclaimer sits with the estimate, not somewhere else on the page", () => {
    renderYear(2026);
    const estimate = within(section("estimate"));
    expect(estimate.getByText(/not a filing figure/i)).toBeDefined();
    expect(estimate.getByText(/estimated tax/i)).toBeDefined();
  });

  test("the estimate itself is a real figure, at the rate the page states", () => {
    renderYear(2026);
    // Gross 2026 investment income is negative once the realized loss lands, so
    // the taxable figure floors at zero and the tax with it. Both are asserted
    // per row: a fabricated tax bill beside a not-for-filing disclaimer is the
    // worst thing this view could print.
    expect(row("taxable-income").getByText("$0.00")).toBeDefined();
    expect(row("estimated-tax").getByText("$0.00")).toBeDefined();
    expect(screen.getByText(/flat 30% rate/)).toBeDefined();
  });

  test("a year with no income entry says so rather than printing four zeros", () => {
    const analytics = loadAnalytics();
    const { 2026: _dropped, ...income } = analytics.income;
    render(
      <Theme>
        <TaxView analytics={{ ...analytics, income }} year={2026} />
      </Theme>,
    );
    expect(screen.getByText(/no income data/i)).toBeDefined();
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(document.querySelector("[data-tax-estimate]")).toBeNull();
  });

  test("the RRSP deduction echoes what was contributed, never unused room", () => {
    renderYear(2026);
    const estimate = within(section("estimate"));
    expect(estimate.getByText("$33,000.00")).toBeDefined();
    // 37,752 is 2026's unused assessed RRSP room. It is not a deduction.
    expect(screen.queryByText(/37,752/)).toBeNull();
  });

  test("the corporate account is visibly absent, with the reason", () => {
    renderYear(2026);
    const note = within(section("exclusions"));
    expect(note.getByText(/corporate/i)).toBeDefined();
    expect(note.getByText(/taxed in the corporation/i)).toBeDefined();
  });
});
