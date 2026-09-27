import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render, screen, within } from "@testing-library/react";
import { GOLDENS } from "../../goldens";
import { loadAnalytics } from "../data";
import { formatCurrency } from "../format";
import { TaxView } from "./TaxView";

/**
 * Real corpus figures (`data/analytics.json`, `data/goldens.json`), read
 * through `GOLDENS.income` rather than pinned as inline literals.
 */
function renderYear(year: number, scope: number | "all" = year) {
  render(
    <Theme>
      <TaxView analytics={loadAnalytics()} year={year} scope={scope} />
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
  test("shows the latest year's income split by type", () => {
    renderYear(GOLDENS.income.year);
    const income = within(section("income"));
    expect(income.getByText(/interest/i)).toBeDefined();
    expect(income.getByText(formatCurrency(GOLDENS.income.interest))).toBeDefined();
    expect(income.getByText(/distributions from canadian listed securities/i)).toBeDefined();
    expect(income.getByText(formatCurrency(GOLDENS.income.canadianDistributions))).toBeDefined();
    expect(income.getByText(/foreign dividends/i)).toBeDefined();
    expect(income.getByText(formatCurrency(GOLDENS.income.foreignDividends))).toBeDefined();
    expect(income.getByText(/foreign tax withheld/i)).toBeDefined();
    expect(income.getByText(formatCurrency(GOLDENS.income.foreignTaxWithheld))).toBeDefined();
  });

  test("the interest row prints the interest figure, not a constant zero", () => {
    const analytics = loadAnalytics();
    const income2026 = analytics.income["2026"];
    if (income2026 === undefined) throw new Error("expected 2026 income in the corpus");
    render(
      <Theme>
        <TaxView
          analytics={{ ...analytics, income: { 2026: { ...income2026, interest: 412.75 } } }}
          year={2026}
          scope={2026}
        />
      </Theme>,
    );
    expect(row("interest").getByText("$412.75")).toBeDefined();
  });

  test("the latest year's realized figure is signed and labelled for what it is", () => {
    renderYear(GOLDENS.income.year);
    const income = within(section("income"));
    const label = GOLDENS.income.realizedGain < 0 ? /realized loss/i : /realized gains/i;
    expect(income.getByText(label)).toBeDefined();
    const figure = formatCurrency(GOLDENS.income.realizedGain);
    expect(income.getByText(figure)).toBeDefined();
    if (GOLDENS.income.realizedGain < 0) {
      // The unsigned form must not appear: a loss rendered without its sign
      // reads as a gain of the same size.
      expect(income.queryByText(figure.replace("-", ""))).toBeNull();
    }
  });

  test("a nonzero cost unknown count is shown", () => {
    const analytics = loadAnalytics();
    const income2026 = analytics.income["2026"];
    if (income2026 === undefined) throw new Error("expected 2026 income in the corpus");
    render(
      <Theme>
        <TaxView
          analytics={{ ...analytics, income: { 2026: { ...income2026, costUnknownSales: 3 } } }}
          year={2026}
          scope={2026}
        />
      </Theme>,
    );
    expect(row("cost-unknown").getByText(/3 sales without a cost basis/i)).toBeDefined();
  });

  test("a zero cost unknown count renders no row at all", () => {
    const analytics = loadAnalytics();
    const income2026 = analytics.income["2026"];
    if (income2026 === undefined) throw new Error("expected 2026 income in the corpus");
    render(
      <Theme>
        <TaxView
          analytics={{ ...analytics, income: { 2026: { ...income2026, costUnknownSales: 0 } } }}
          year={2026}
          scope={2026}
        />
      </Theme>,
    );
    expect(document.querySelector('[data-tax-row="cost-unknown"]')).toBeNull();
  });

  test("a year with no income entry says so rather than printing zeros", () => {
    const analytics = loadAnalytics();
    const { 2026: _dropped, ...income } = analytics.income;
    render(
      <Theme>
        <TaxView analytics={{ ...analytics, income }} year={2026} scope={2026} />
      </Theme>,
    );
    expect(screen.getByText(/no income data/i)).toBeDefined();
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(document.querySelector("[data-tax-income]")).toBeNull();
  });

  test("the RRSP deduction line states what was contributed this year, never unused room", () => {
    renderYear(GOLDENS.income.year);
    const rrsp = within(section("rrsp"));
    expect(rrsp.getByText(formatCurrency(GOLDENS.income.rrspDeduction))).toBeDefined();
    expect(rrsp.getByText(/deductible against your total income/i)).toBeDefined();
    const room = GOLDENS.rooms.rrspAssessedRemaining;
    expect(room).not.toBe(GOLDENS.income.rrspDeduction);
    expect(rrsp.queryByText(new RegExp(room.toLocaleString("en-CA")))).toBeNull();
  });

  test("there is no taxable income row and no flat rate estimate anywhere on the page", () => {
    renderYear(2026);
    expect(document.querySelector('[data-tax-row="taxable-income"]')).toBeNull();
    expect(screen.queryByText(/flat 30%/i)).toBeNull();
    expect(document.querySelector("[data-tax-estimate]")).toBeNull();
  });

  test("the corporate account is visibly absent, with the reason", () => {
    renderYear(2026);
    const note = within(section("exclusions"));
    expect(note.getByText(/corporate/i)).toBeDefined();
    expect(note.getByText(/taxed in the corporation/i)).toBeDefined();
  });

  test("the heading names the year directly when a specific year is scoped", () => {
    renderYear(2025, 2025);
    expect(screen.getByText("Investment income, 2025")).toBeDefined();
  });

  test("the heading says latest year when the scope is all time", () => {
    renderYear(GOLDENS.income.year, "all");
    expect(screen.getByText(`Investment income, latest year ${GOLDENS.income.year}`)).toBeDefined();
  });

  test("a USD conversion caveat sits beside the income figures it qualifies", () => {
    renderYear(2026);
    expect(row("usd-conversion-caveat").getByText(/month end rate/i)).toBeDefined();
  });

  test("corporate actions in the year are listed by symbol and date", () => {
    const analytics = loadAnalytics();
    const income2026 = analytics.income["2026"];
    if (income2026 === undefined) throw new Error("expected 2026 income in the corpus");
    render(
      <Theme>
        <TaxView
          analytics={{
            ...analytics,
            income: {
              2026: {
                ...income2026,
                corporateActions: [{ symbol: "FDXF", date: "2026-06-01" }],
              },
            },
          }}
          year={2026}
          scope={2026}
        />
      </Theme>,
    );
    const actions = within(section("corporate-actions"));
    expect(actions.getByText(/corporate actions to check against your tax slips/i)).toBeDefined();
    expect(actions.getByText(/FDXF, 2026-06-01/)).toBeDefined();
  });

  test("no corporate actions renders no card at all", () => {
    const analytics = loadAnalytics();
    const income2026 = analytics.income["2026"];
    if (income2026 === undefined) throw new Error("expected 2026 income in the corpus");
    render(
      <Theme>
        <TaxView
          analytics={{
            ...analytics,
            income: { 2026: { ...income2026, corporateActions: [] } },
          }}
          year={2026}
          scope={2026}
        />
      </Theme>,
    );
    expect(document.querySelector("[data-tax-corporate-actions]")).toBeNull();
  });
});
