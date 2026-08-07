import { describe, expect, test } from "bun:test";
import { cashflowTooltipLines } from "./cashflowTooltip";

describe("cashflowTooltipLines", () => {
  test("a gap month names the absence, never a figure", () => {
    expect(cashflowTooltipLines("2026-01", null)).toEqual([
      "Jan 2026",
      "No statement for this month",
    ]);
  });

  test("a real zero month prints both figures as zero, not as an absence", () => {
    const lines = cashflowTooltipLines("2026-01", {
      period: "2026-01",
      deposits: 0,
      withdrawals: 0,
      accountCount: 1,
    });
    expect(lines).toEqual([
      "Jan 2026",
      "Deposits $0.00",
      "Withdrawals $0.00",
      "1 account reported this month",
    ]);
    expect(lines.join(" ")).not.toContain("No statement");
  });

  test("full precision, not rounded to whole dollars", () => {
    const lines = cashflowTooltipLines("2026-01", {
      period: "2026-01",
      deposits: 3445,
      withdrawals: 1280.75,
      accountCount: 2,
    });
    expect(lines).toContain("Deposits $3,445.00");
    expect(lines).toContain("Withdrawals $1,280.75");
    expect(lines).toContain("2 accounts reported this month");
  });
});
