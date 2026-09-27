import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { AnalyticsOutput } from "../analytics/build";
import { incomeByYear } from "../analytics/incomeCosts";
import type { AccountSeries } from "../analytics/types";
import { GOLDENS } from "../goldens";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { IncomeCosts } from "./IncomeCosts";
import { loadAnalytics } from "./data";
import { formatCurrency } from "./format";

afterEach(cleanup);

const REAL = loadAnalytics();

function renderReal(year: number, scope: number | "all" = year) {
  render(
    <Theme>
      <IncomeCosts analytics={REAL} year={year} scope={scope} />
    </Theme>,
  );
}

function yearRow(year: number): HTMLElement {
  const node = document.querySelector(`[data-income-year-row="${year}"]`);
  if (node === null) throw new Error(`expected a row for ${year}`);
  return node as HTMLElement;
}

describe("IncomeCosts, over the real corpus", () => {
  test("the year table has one row per year the corpus covers, oldest first", () => {
    renderReal(2026);
    const rows = [...document.querySelectorAll("[data-income-year-row]")];
    expect(rows.map((r) => r.getAttribute("data-income-year-row"))).toEqual(
      incomeByYear(REAL).map((y) => String(y.year)),
    );
  });

  test("2025 and 2026 rows show the pinned activity totals", () => {
    renderReal(2026);
    const row2025 = within(yearRow(2025));
    expect(
      row2025.getByText(formatCurrency(GOLDENS.incomeCosts.byYear["2025"].dividends)),
    ).toBeDefined();
    expect(
      row2025.getByText(formatCurrency(GOLDENS.incomeCosts.byYear["2025"].withholdingTax)),
    ).toBeDefined();

    const row2026 = within(yearRow(2026));
    expect(
      row2026.getByText(formatCurrency(GOLDENS.incomeCosts.byYear["2026"].dividends)),
    ).toBeDefined();
    expect(
      row2026.getByText(String(GOLDENS.incomeCosts.byYear["2026"].fxConversions)),
    ).toBeDefined();
  });

  test("the selected year's row is marked", () => {
    renderReal(2025);
    expect(yearRow(2025).getAttribute("data-selected")).toBe("");
    expect(yearRow(2026).getAttribute("data-selected")).toBeNull();
  });

  test("all time shows the latest year, labelled as such", () => {
    renderReal(2026, "all");
    expect(screen.getByText("Income and costs, latest year 2026")).toBeDefined();
  });

  test("a specific year is labelled directly, not as the latest", () => {
    renderReal(2025, 2025);
    expect(screen.getByText("Income and costs, 2025")).toBeDefined();
  });

  test("the monthly dividends chart renders for the selected year", () => {
    renderReal(2026);
    expect(screen.getByRole("heading", { name: "Monthly dividends, 2026" })).toBeDefined();
  });

  test("the investment income tax view renders underneath, for the same year", () => {
    renderReal(2025, 2025);
    expect(document.querySelector("[data-tax-income]")).not.toBeNull();
    expect(screen.getByText("Investment income, 2025")).toBeDefined();
  });

  test("no withholding row states a zero figure", () => {
    renderReal(2026);
    const rows = [...document.querySelectorAll("[data-withholding-row]")];
    for (const row of rows) {
      expect(row.textContent).not.toContain("$0.00");
    }
  });
});

function account(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "NonRegistered 0001",
    kind: "NonRegistered" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned" as Purpose,
    inTotals: true,
    months: [],
    contributionsByYear: {},
    ...overrides,
  };
}

const ZERO = {
  dividends: 0,
  interest: 0,
  lendingIncome: 0,
  withholdingTax: 0,
  fees: 0,
  fxConversions: 0,
};

function fixture(overrides: Partial<AnalyticsOutput> = {}): AnalyticsOutput {
  return {
    meta: { generated: "", datastoreGenerated: "", accountCount: 0 },
    series: [],
    rooms: {},
    income: {},
    returns: [],
    rollups: { registration: [], account: [], purpose: [] },
    activity: {},
    ...overrides,
  };
}

describe("IncomeCosts, withholding by kind (fixture)", () => {
  test("a NonRegistered account recovers as a credit", () => {
    const rrsp = account({
      maskedId: "acct_credit",
      kind: "NonRegistered",
      label: "NonRegistered",
    });
    const analytics = fixture({
      series: [rrsp],
      activity: { "2026-01": { acct_credit: { ...ZERO, withholdingTax: 4.5 } } },
    });
    render(
      <Theme>
        <IncomeCosts analytics={analytics} year={2026} scope={2026} />
      </Theme>,
    );
    const row = document.querySelector('[data-withholding-row="acct_credit"]');
    expect(row?.textContent).toContain("Claimable as a foreign tax credit");
  });

  test("the spousal RRSP appears on its own line, not in the account table", () => {
    const spousal = account({
      maskedId: "acct_spousal",
      kind: "SpousalRRSP",
      label: "Spousal RRSP",
      inTotals: false,
    });
    const analytics = fixture({
      series: [spousal],
      activity: { "2026-01": { acct_spousal: { ...ZERO, withholdingTax: 6.25 } } },
    });
    render(
      <Theme>
        <IncomeCosts analytics={analytics} year={2026} scope={2026} />
      </Theme>,
    );
    expect(document.querySelector('[data-withholding-row="acct_spousal"]')).toBeNull();
    const note = document.querySelector('[data-withholding-spousal="acct_spousal"]');
    expect(note?.textContent).toContain(formatCurrency(6.25));
    expect(note?.textContent).toContain("not counted above");
  });

  test("no withholding at all shows the empty state rather than an empty table", () => {
    const analytics = fixture({ series: [account()] });
    render(
      <Theme>
        <IncomeCosts analytics={analytics} year={2026} scope={2026} />
      </Theme>,
    );
    expect(document.querySelector("[data-withholding-empty]")?.textContent).toContain(
      "No foreign withholding tax in 2026",
    );
    expect(document.querySelector("[data-withholding-table]")).toBeNull();
  });
});
