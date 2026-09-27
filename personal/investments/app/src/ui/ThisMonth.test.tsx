import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { monthReview, reviewPeriods } from "../analytics/monthReview";
import type { AccountSeries, MonthPoint } from "../analytics/types";
import { GOLDENS } from "../goldens";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { Purpose } from "../store/registry";
import { ThisMonth } from "./ThisMonth";
import { loadAnalytics, loadCheckpoints } from "./data";
import { formatCurrency, formatRate, formatSignedCurrency } from "./format";

function month(overrides: Partial<MonthPoint> & { period: string }): MonthPoint {
  return {
    marketValue: null,
    bookCost: null,
    cashBalance: null,
    deposits: 0,
    withdrawals: 0,
    contributions: null,
    contributionMonthsSpanned: 1,
    contributionFirst60Days: null,
    contributionRestOfYear: null,
    contributionsSource: null,
    grants: 0,
    ...overrides,
  };
}

function account(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "TFSA 0001",
    kind: "TFSA" as AccountKind,
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned" as Purpose,
    inTotals: true,
    months: [],
    contributionsByYear: {},
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

function renderThisMonth(scope: "all" | number = "all") {
  render(
    <Theme>
      <ThisMonth analytics={loadAnalytics()} checkpoints={loadCheckpoints()} scope={scope} />
    </Theme>,
  );
}

/**
 * Awaited inside act: Radix's Select positions its listbox on a short timer
 * after the click, later than a single microtask flush -- the small settle
 * delay is what keeps this from occasionally leaking an unwrapped update.
 */
async function openMonthPicker() {
  await act(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "Month" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

async function pickMonth(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("option", { name: label }));
  });
}

function moversRows(): HTMLElement[] {
  return [...document.querySelectorAll("[data-mover-row]")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
}

describe("ThisMonth", () => {
  test("the default route's headline change matches the month golden", () => {
    renderThisMonth();
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toContain(GOLDENS.month.period.slice(0, 4));
    expect(heading.textContent).toContain(formatSignedCurrency(GOLDENS.month.change));
  });

  test("the movers table has one row per model move", () => {
    renderThisMonth();
    const analytics = loadAnalytics();
    const [latest] = reviewPeriods(analytics);
    if (latest === undefined) throw new Error("expected a reviewable period");
    const review = monthReview(analytics, latest);
    expect(moversRows().length).toBe(review.moves.length);
  });

  test("a mover's Change and Growth cells are toned jade for a gain, red for a loss", () => {
    renderThisMonth();
    const analytics = loadAnalytics();
    const [latest] = reviewPeriods(analytics);
    if (latest === undefined) throw new Error("expected a reviewable period");
    const review = monthReview(analytics, latest);
    const withGrowth = review.moves.find((m) => m.growth !== null && m.growth !== 0);
    if (withGrowth === undefined) throw new Error("expected at least one toned mover");

    const row = moversRows().find((r) => r.textContent?.includes(withGrowth.label));
    if (row === undefined) throw new Error(`expected a row for ${withGrowth.label}`);
    const growthCell = within(row).getByText(formatSignedCurrency(withGrowth.growth ?? 0));
    expect(growthCell.getAttribute("data-accent-color")).toBe(
      (withGrowth.growth ?? 0) >= 0 ? "jade" : "red",
    );
  });

  test("the income and costs row renders every activity figure", () => {
    renderThisMonth();
    const analytics = loadAnalytics();
    const [latest] = reviewPeriods(analytics);
    if (latest === undefined) throw new Error("expected a reviewable period");
    const review = monthReview(analytics, latest);
    const block = document.querySelector("[data-month-activity]");
    if (block === null) throw new Error("expected the income and costs block to render");
    expect(block.textContent).toContain(formatCurrency(review.activity.dividends));
    expect(block.textContent).toContain(formatCurrency(review.activity.interest));
    expect(block.textContent).toContain(formatCurrency(review.activity.lendingIncome));
    expect(block.textContent).toContain(formatCurrency(review.activity.withholdingTax));
    expect(block.textContent).toContain(formatCurrency(review.activity.fees));
  });

  test("review.activity counts inTotals accounts only", () => {
    // A structural check on the model this page renders from, not a second
    // formula: Chequing (never inTotals) must not be able to move this
    // figure, so nothing on screen can be inflated by a excluded account.
    const analytics = loadAnalytics();
    const [latest] = reviewPeriods(analytics);
    if (latest === undefined) throw new Error("expected a reviewable period");
    const review = monthReview(analytics, latest);
    const byAccount = analytics.activity[latest] ?? {};
    const excludedIds = analytics.series.filter((a) => !a.inTotals).map((a) => a.maskedId);
    const excludedDividends = excludedIds.reduce(
      (sum, id) => sum + (byAccount[id]?.dividends ?? 0),
      0,
    );
    // At least one excluded account has to exist in the real corpus (Chequing
    // always does) for this to be a non-vacuous check.
    expect(excludedIds.length).toBeGreaterThan(0);
    const includedDividends = analytics.series
      .filter((a) => a.inTotals)
      .reduce((sum, a) => sum + (byAccount[a.maskedId]?.dividends ?? 0), 0);
    expect(review.activity.dividends).toBeCloseTo(includedDividends, 6);
    if (excludedDividends !== 0) {
      expect(review.activity.dividends).not.toBeCloseTo(includedDividends + excludedDividends, 6);
    }
  });

  test("the coverage line names a newly opened account", () => {
    renderThisMonth();
    const line = document.querySelector("[data-month-coverage]");
    if (line === null) throw new Error("expected the coverage line to render at the latest month");
    expect(line.textContent).toContain("Newly opened");
    expect(line.textContent).toContain("Corporate (self)");
  });

  test("the coverage line states a missing account's own last value, so the headline gap is explained", () => {
    const present = account({
      maskedId: "acct_present",
      label: "Present",
      months: [
        month({ period: "2026-06", marketValue: 1000, bookCost: 900 }),
        month({ period: "2026-07", marketValue: 1100, bookCost: 900, deposits: 50 }),
      ],
    });
    const behind = account({
      maskedId: "acct_behind",
      label: "Managed (TFSA)",
      months: [month({ period: "2026-06", marketValue: 7670.2, bookCost: 7000 })],
    });
    const analytics = {
      meta: { generated: "", datastoreGenerated: "", accountCount: 2 },
      series: [present, behind],
      rooms: {},
      income: {},
      returns: [],
      rollups: { registration: [], account: [], purpose: [] },
      activity: {},
      statedFees: {},
      holdings: {
        period: "",
        total: 0,
        holdings: [],
        groups: [],
        currency: { CAD: 0, USD: 0 },
        assetClasses: [],
      },
    };

    render(
      <Theme>
        <ThisMonth analytics={analytics} checkpoints={[]} scope="all" />
      </Theme>,
    );
    const line = document.querySelector("[data-month-coverage]");
    if (line === null) throw new Error("expected the coverage line to render");
    expect(line.textContent).toContain(
      `Not yet reported: Managed (TFSA), last value ${formatCurrency(7670.2)}`,
    );
  });

  test("the checkpoint line states the exact app, statement and gap figures", async () => {
    const checkpoint = loadCheckpoints().find(
      (c) => c.coversPeriod === "2026-08" && c.reconciliation !== null,
    );
    if (checkpoint?.reconciliation == null) {
      throw new Error("expected a reconciled 2026-08 checkpoint");
    }
    const { appVisibleTotal, ourTotal, difference } = checkpoint.reconciliation;
    const apart = Math.abs(difference);
    const percent = (apart / ourTotal) * 100;

    renderThisMonth();
    await openMonthPicker();
    await pickMonth("August 2026");
    const line = document.querySelector("[data-checkpoint-line]");
    if (line === null) throw new Error("expected the checkpoint line to render for 2026-08");
    expect(line.textContent).toBe(
      `Wealthsimple app ${formatCurrency(appVisibleTotal)} against statements ` +
        `${formatCurrency(ourTotal)}, ${formatCurrency(apart)} apart (${formatRate(percent)})`,
    );

    await openMonthPicker();
    await pickMonth("July 2026");
    expect(document.querySelector("[data-checkpoint-line]")).toBeNull();
  });

  test("picking a different month in the select updates the headline", async () => {
    renderThisMonth();
    const analytics = loadAnalytics();
    const julyReview = monthReview(analytics, "2026-07");
    const julyChange =
      julyReview.start === null ? julyReview.end : julyReview.end - julyReview.start;

    await openMonthPicker();
    await pickMonth("July 2026");

    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      formatSignedCurrency(julyChange),
    );
  });

  test("a year scope limits the picker to that year's months, defaulting to the latest one", async () => {
    renderThisMonth(2024);
    const analytics = loadAnalytics();
    const periods2024 = reviewPeriods(analytics).filter((p) => p.startsWith("2024-"));
    const latest2024 = periods2024[0];
    if (latest2024 === undefined) throw new Error("expected at least one 2024 period");
    const review = monthReview(analytics, latest2024);
    const change = review.start === null ? review.end : review.end - review.start;
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      formatSignedCurrency(change),
    );

    await openMonthPicker();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toHaveLength(periods2024.length);
    for (const option of options) {
      expect(option).toContain("2024");
    }
  });

  test("switching the year scope live moves the picker's default month, and moves it back", () => {
    const analytics = loadAnalytics();
    const checkpoints = loadCheckpoints();
    const { rerender } = render(
      <Theme>
        <ThisMonth analytics={analytics} checkpoints={checkpoints} scope="all" />
      </Theme>,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("August 2026");

    rerender(
      <Theme>
        <ThisMonth analytics={analytics} checkpoints={checkpoints} scope={2024} />
      </Theme>,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("December 2024");

    rerender(
      <Theme>
        <ThisMonth analytics={analytics} checkpoints={checkpoints} scope="all" />
      </Theme>,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("August 2026");
  });
});
