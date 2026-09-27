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

  test("the selected year's row carries aria-current and its own class", () => {
    renderReal(2025);
    expect(yearRow(2025).getAttribute("aria-current")).toBe("true");
    expect(yearRow(2025).className).toContain("ivt-selected-row");
    expect(yearRow(2026).getAttribute("aria-current")).toBeNull();
    expect(yearRow(2026).className).not.toContain("ivt-selected-row");
  });

  test("the year table states the FX converted amount, not only the count", () => {
    renderReal(2026);
    const row2026 = within(yearRow(2026));
    expect(
      row2026.getByText(formatCurrency(GOLDENS.incomeCosts.byYear["2026"].fxConversionAmount)),
    ).toBeDefined();
  });

  test("2025 and 2026 chequing interest, stated apart from the totals", () => {
    renderReal(2025, 2025);
    expect(document.querySelector("[data-chequing-interest]")?.textContent).toContain(
      "not in the portfolio total",
    );

    const total2025 = [...document.querySelectorAll("[data-chequing-interest]")].reduce(
      (sum, node) => {
        const match = /\$[\d,]+\.\d{2}/.exec(node.textContent ?? "");
        return sum + (match ? Number(match[0].replace(/[$,]/g, "")) : 0);
      },
      0,
    );
    expect(total2025).toBeCloseTo(GOLDENS.incomeCosts.chequingInterestByYear["2025"], 2);
  });

  test("income by account renders, sorted by what each account pays", () => {
    renderReal(2026);
    expect(screen.getByRole("heading", { name: "Income by account, 2026" })).toBeDefined();
    expect(document.querySelectorAll("[data-account-income-row]").length).toBeGreaterThan(0);
  });

  test("every top-level section heading is an h2, siblings rather than nested", () => {
    renderReal(2026);
    const headings = screen.getAllByRole("heading", { level: 2 });
    const texts = headings.map((h) => h.textContent);
    expect(texts).toEqual([
      "Income and costs, 2026",
      "Monthly dividends, 2026",
      "Income by account, 2026",
      "Foreign withholding tax by account, 2026",
      "Investment income, 2026",
    ]);
    // No h3 anywhere in this tab: withholding used to nest under the chart's
    // own h2 as a subsection, which this heading order rules out.
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
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
  fxConversionAmount: 0,
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
    statedFees: {},
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

  test.each([
    ["RRSP", "Not recoverable; US listed securities held directly in an RRSP are exempt"],
    ["Corporate", "Claimable as a foreign tax credit"],
    ["TFSA", "Lost, cannot be recovered"],
  ] as const)("a %s account's withholding row reads %s", (kind, expected) => {
    const acct = account({ maskedId: "acct_kind", kind: kind as AccountKind });
    const analytics = fixture({
      series: [acct],
      activity: { "2026-01": { acct_kind: { ...ZERO, withholdingTax: 3 } } },
    });
    render(
      <Theme>
        <IncomeCosts analytics={analytics} year={2026} scope={2026} />
      </Theme>,
    );
    const row = document.querySelector('[data-withholding-row="acct_kind"]');
    expect(row?.textContent).toContain(expected);
    cleanup();
  });

  test("an RRSP account's recovery cell reads the exact full sentence, capital US intact", () => {
    const rrsp = account({ maskedId: "acct_rrsp", kind: "RRSP" });
    const analytics = fixture({
      series: [rrsp],
      activity: { "2026-01": { acct_rrsp: { ...ZERO, withholdingTax: 9.5 } } },
    });
    render(
      <Theme>
        <IncomeCosts analytics={analytics} year={2026} scope={2026} />
      </Theme>,
    );
    const row = document.querySelector('[data-withholding-row="acct_rrsp"]');
    const cells = row?.querySelectorAll("td, th") ?? [];
    const recoveryCell = cells[cells.length - 1];
    expect(recoveryCell?.textContent).toBe(
      "Not recoverable; US listed securities held directly in an RRSP are exempt, so check " +
        "why this was withheld",
    );
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
    // Its own kind (SpousalRRSP), not a hardcoded RRSP branch: the recovery
    // sentence is the same one an RRSP row gets, read off the row's own
    // `recovery`, and the capital "US" survives -- no more forced lowercase.
    expect(note?.textContent).toContain(
      "Not recoverable; US listed securities held directly in an RRSP are exempt",
    );
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
