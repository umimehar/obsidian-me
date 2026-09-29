import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FlowPeriod } from "../analytics/flows/period";
import { FlowControls } from "./FlowControls";
import { loadAnalytics, loadFlows } from "./data";

afterEach(cleanup);

const { series } = loadAnalytics();
const flows = loadFlows();

const ALL_ACCOUNT_IDS = new Set(series.map((a) => a.maskedId));

function Harness({
  period,
  onPeriodChange,
  accounts = ALL_ACCOUNT_IDS,
}: {
  period: FlowPeriod | "all";
  onPeriodChange: (p: FlowPeriod | "all") => void;
  accounts?: ReadonlySet<string>;
}) {
  return (
    <Theme>
      <FlowControls
        flows={flows}
        period={period}
        onPeriodChange={onPeriodChange}
        groupBy="accountType"
        onGroupByChange={() => {}}
        accountOptions={series}
        accounts={new Set(accounts)}
        onAccountsChange={() => {}}
        isDefaultAccounts={accounts.size === series.length}
        onResetAccounts={() => {}}
      />
    </Theme>
  );
}

async function openPeriodSelect() {
  await act(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "Period" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe("FlowControls", () => {
  test("all time is the preset shown when the period prop is all", () => {
    render(<Harness period="all" onPeriodChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Period" }).textContent).toBe("All time");
  });

  test("switching to Year opens a year select defaulting to the corpus's latest year", async () => {
    const picked: { period: FlowPeriod | "all" } = { period: "all" };
    const setPeriod = (p: FlowPeriod | "all") => {
      picked.period = p;
    };
    const { rerender } = render(<Harness period={picked.period} onPeriodChange={setPeriod} />);
    await openPeriodSelect();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "Year" }));
    });
    const { period } = picked;
    expect(period).not.toBe("all");
    if (period !== "all") {
      expect(period.from.slice(5)).toBe("01");
      expect(period.to.slice(5)).toBe("12");
    }
    rerender(<Harness period={period} onPeriodChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Year" })).toBeDefined();
  });

  test("no dependent select renders for This month or All time", () => {
    const { rerender } = render(<Harness period="all" onPeriodChange={() => {}} />);
    expect(screen.queryByRole("combobox", { name: "Year" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Month" })).toBeNull();

    rerender(<Harness period={{ from: "2026-01", to: "2026-06" }} onPeriodChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "From" })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "To" })).toBeDefined();
  });

  test("the account filter reads 'All N accounts', never 'Portfolio', when every account is selected", () => {
    render(<Harness period="all" onPeriodChange={() => {}} />);
    const trigger = document.querySelector("[data-account-filter]");
    expect(trigger?.textContent).toBe(`All ${series.length} accounts`);
    expect(trigger?.textContent).not.toContain("Portfolio");
  });

  test("a partial selection reads the account count, or the single account's own label", () => {
    const [first, second] = series;
    if (first === undefined || second === undefined) throw new Error("need two accounts");
    const { rerender } = render(
      <Harness
        period="all"
        onPeriodChange={() => {}}
        accounts={new Set([first.maskedId, second.maskedId])}
      />,
    );
    expect(document.querySelector("[data-account-filter]")?.textContent).toBe("2 accounts");

    rerender(
      <Harness period="all" onPeriodChange={() => {}} accounts={new Set([first.maskedId])} />,
    );
    expect(document.querySelector("[data-account-filter]")?.textContent).toBe(first.label);
  });
});
