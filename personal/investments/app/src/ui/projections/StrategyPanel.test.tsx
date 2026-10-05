import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import type { Strategy } from "../../plan";
import { formatCurrency } from "../format";
import { expectNoCoarseForm } from "../testSupport/coarseForm";
import { StrategyPanel } from "./StrategyPanel";

/**
 * A hand-built strategy, not the committed `data/plan.json` one: the real
 * plan's three payroll phases and single watch item don't exercise every
 * branch (a gap between phases, an ended watch item), so this fixture covers
 * what the real one cannot.
 */
const STRATEGY: Strategy = {
  decided: "2026-10-01",
  directIndexing: {
    account: "Non-registered 1f9a",
    targets: [
      { sleeve: "U.S. Market Index", share: 0.7 },
      { sleeve: "U.S. Innovation Index", share: 0.3 },
    ],
    fillTarget: 15250,
    note: "Filled by deposits only.",
  },
  payroll: [
    {
      id: "phase-1",
      label: "Now",
      from: "2026-10-01",
      to: "2026-10-31",
      automations: [
        { target: "Spousal RRSP", amount: 1000 },
        { target: "Savings", amount: 500.5 },
      ],
      note: "Set 2026-10-01.",
    },
    {
      id: "phase-2",
      label: "RRSP paused",
      from: "2026-11-02",
      to: "2026-12-31",
      automations: [{ target: "Direct Indexing", amount: 2400 }],
      note: "Both RRSP transfers paused.",
    },
    {
      id: "phase-3",
      label: "2027",
      from: "2027-01-04",
      to: null,
      automations: [{ target: "Spousal RRSP", amount: 1000 }],
      note: "RRSP transfers resume.",
    },
  ],
  rrsp: {
    year: 2026,
    estimatedIncome: 235000,
    contributedToDate: 42000,
    contributedAsOf: "2026-10-01",
    deductionTarget: 53500,
    bracketTop: 181440,
    note: "Deducting brings taxable income to the bracket top.",
  },
  watch: [
    { label: "Active window", through: "2099-01-01", note: "Still open." },
    { label: "Ended window", through: "2020-01-01", note: "Long over." },
  ],
};

function renderPanel(today: string) {
  render(
    <Theme>
      <StrategyPanel strategy={STRATEGY} today={today} />
    </Theme>,
  );
}

describe("StrategyPanel", () => {
  afterEach(cleanup);

  test("badges the phase containing today as Current", () => {
    renderPanel("2026-11-15");
    const phase2 = screen.getByTestId("payroll-phase-2");
    expect(phase2.textContent).toContain("Current");
    const phase1 = screen.getByTestId("payroll-phase-1");
    expect(phase1.textContent).not.toContain("Current");
    const phase3 = screen.getByTestId("payroll-phase-3");
    expect(phase3.textContent).not.toContain("Current");
  });

  test("badges no phase when today falls in a gap between phases", () => {
    renderPanel("2026-11-01");
    for (const id of ["phase-1", "phase-2", "phase-3"]) {
      expect(screen.getByTestId(`payroll-${id}`).textContent).not.toContain("Current");
    }
  });

  test("badges an open ended phase current once its from date arrives", () => {
    renderPanel("2027-06-01");
    expect(screen.getByTestId("payroll-phase-3").textContent).toContain("Current");
  });

  test("shows a per-pay total, the sum of that phase's automations", () => {
    renderPanel("2026-10-15");
    const phase1 = screen.getByTestId("payroll-phase-1");
    expect(phase1.textContent).toContain(formatCurrency(1500.5));
    expectNoCoarseForm(phase1.textContent ?? "", 1500.5);
  });

  test("marks a watch item through today as Active, one through the past as Ended", () => {
    renderPanel("2026-10-01");
    const badges = [...document.querySelectorAll('[data-testid="strategy-watch-item"]')];
    expect(badges).toHaveLength(2);
    expect(badges[0]?.textContent).toContain("Active");
    expect(badges[1]?.textContent).toContain("Ended");
  });

  test("floors RRSP remaining to target at 0 when contributions exceed it", () => {
    render(
      <Theme>
        <StrategyPanel
          strategy={{
            ...STRATEGY,
            rrsp: { ...STRATEGY.rrsp, contributedToDate: 60000, deductionTarget: 53500 },
          }}
          today="2026-10-01"
        />
      </Theme>,
    );
    const rrsp = screen.getByTestId("strategy-rrsp");
    expect(rrsp.textContent).toContain(`Remaining to target: ${formatCurrency(0)}`);
  });

  test("every rendered figure matches its own formatCurrency call, no coarse form", () => {
    renderPanel("2026-10-15");
    const rrsp = screen.getByTestId("strategy-rrsp");
    expect(rrsp.textContent).toContain(formatCurrency(STRATEGY.rrsp.contributedToDate));
    expect(rrsp.textContent).toContain(formatCurrency(STRATEGY.rrsp.deductionTarget));
    expect(rrsp.textContent).toContain(formatCurrency(STRATEGY.rrsp.estimatedIncome));
    expect(rrsp.textContent).toContain(formatCurrency(STRATEGY.rrsp.bracketTop));
    const remaining = Math.max(STRATEGY.rrsp.deductionTarget - STRATEGY.rrsp.contributedToDate, 0);
    const taxable = STRATEGY.rrsp.estimatedIncome - STRATEGY.rrsp.deductionTarget;
    expect(rrsp.textContent).toContain(formatCurrency(remaining));
    expect(rrsp.textContent).toContain(formatCurrency(taxable));

    const directIndexing = screen.getByTestId("strategy-direct-indexing");
    expect(directIndexing.textContent).toContain(
      formatCurrency(STRATEGY.directIndexing.fillTarget),
    );
  });

  test("decided date and sleeve split disclaimer render", () => {
    renderPanel("2026-10-15");
    expect(screen.getByText(`Decided ${STRATEGY.decided}`)).toBeTruthy();
    expect(
      screen.getByText("Sleeve split is not in the statements, so progress is not measured here."),
    ).toBeTruthy();
  });
});
