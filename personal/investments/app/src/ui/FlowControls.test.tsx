import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FlowPeriod } from "../analytics/flows/period";
import { FlowControls } from "./FlowControls";
import { defaultSelection } from "./chartAccounts";
import { loadAnalytics, loadFlows } from "./data";

afterEach(cleanup);

const { series } = loadAnalytics();
const flows = loadFlows();

function Harness({
  period,
  onPeriodChange,
}: { period: FlowPeriod | "all"; onPeriodChange: (p: FlowPeriod | "all") => void }) {
  return (
    <Theme>
      <FlowControls
        flows={flows}
        period={period}
        onPeriodChange={onPeriodChange}
        groupBy="accountType"
        onGroupByChange={() => {}}
        accountOptions={series}
        accounts={defaultSelection(series)}
        onAccountsChange={() => {}}
        isDefaultAccounts={true}
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
});
