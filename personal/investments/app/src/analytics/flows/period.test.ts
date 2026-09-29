import { describe, expect, test } from "bun:test";
import { allTime, inPeriod, latestMonth, missingAccounts, yearPeriod } from "./period";
import type { FlowAccount, FlowsData } from "./types";

function account(overrides: Partial<FlowAccount> & { accountId: string }): FlowAccount {
  return {
    shortId: overrides.accountId.slice(-4),
    label: overrides.accountId,
    kind: "TFSA",
    purpose: "growth",
    inTotals: true,
    firstPeriod: "2023-01",
    lastPeriod: "2026-08",
    ...overrides,
  };
}

function data(
  accounts: FlowAccount[],
  blockPeriods: { accountId: string; period: string }[],
): FlowsData {
  return {
    generated: "2026-09-29",
    accounts,
    rows: [],
    blocks: blockPeriods.map((b) => ({
      accountId: b.accountId,
      period: b.period,
      currency: "CAD",
      opening: 0,
      closing: 0,
      fxRate: null,
      rowsNet: 0,
      residual: 0,
    })),
  };
}

describe("inPeriod", () => {
  test("bounds are inclusive", () => {
    const p = { from: "2026-01", to: "2026-06" };
    expect(inPeriod("2026-01", p)).toBe(true);
    expect(inPeriod("2026-06", p)).toBe(true);
    expect(inPeriod("2025-12", p)).toBe(false);
    expect(inPeriod("2026-07", p)).toBe(false);
  });
});

test("yearPeriod spans January through December", () => {
  expect(yearPeriod(2025)).toEqual({ from: "2025-01", to: "2025-12" });
});

test("allTime spans the earliest to latest block period", () => {
  const d = data(
    [account({ accountId: "acct_a" })],
    [
      { accountId: "acct_a", period: "2023-06" },
      { accountId: "acct_a", period: "2026-08" },
      { accountId: "acct_a", period: "2024-01" },
    ],
  );
  expect(allTime(d)).toEqual({ from: "2023-06", to: "2026-08" });
});

test("latestMonth is a one-month period at the latest block", () => {
  const d = data([account({ accountId: "acct_a" })], [{ accountId: "acct_a", period: "2026-08" }]);
  expect(latestMonth(d)).toEqual({ from: "2026-08", to: "2026-08" });
});

describe("missingAccounts", () => {
  test("names an account that is still open but reported nothing this period, while another account did", () => {
    const open = account({ accountId: "acct_open", firstPeriod: "2023-01", lastPeriod: "2026-08" });
    const other = account({
      accountId: "acct_other",
      firstPeriod: "2023-01",
      lastPeriod: "2026-08",
    });
    const d = data([open, other], [{ accountId: "acct_other", period: "2026-08" }]);
    const p = { from: "2026-08", to: "2026-08" };

    const missing = missingAccounts(d, p, new Set(["acct_open", "acct_other"]));

    expect(missing.map((a) => a.accountId)).toEqual(["acct_open"]);
  });

  test("names an account that fell behind (lastPeriod before the period end) while another still reports", () => {
    const late = account({ accountId: "acct_late", firstPeriod: "2023-01", lastPeriod: "2026-06" });
    const other = account({
      accountId: "acct_other",
      firstPeriod: "2023-01",
      lastPeriod: "2026-08",
    });
    const d = data([late, other], [{ accountId: "acct_other", period: "2026-08" }]);
    const p = { from: "2026-08", to: "2026-08" };

    const missing = missingAccounts(d, p, new Set(["acct_late", "acct_other"]));

    expect(missing.map((a) => a.accountId)).toEqual(["acct_late"]);
  });

  test("ignores a closed account when no other selected account reports at the period end either", () => {
    const closed = account({
      accountId: "acct_closed",
      firstPeriod: "2023-01",
      lastPeriod: "2024-06",
    });
    const d = data([closed], []);
    const p = { from: "2026-08", to: "2026-08" };

    expect(missingAccounts(d, p, new Set(["acct_closed"]))).toEqual([]);
  });

  test("a newly opened account with a statement at the period end is not missing", () => {
    const fresh = account({
      accountId: "acct_fresh",
      firstPeriod: "2026-08",
      lastPeriod: "2026-08",
    });
    const d = data([fresh], [{ accountId: "acct_fresh", period: "2026-08" }]);
    const p = { from: "2026-08", to: "2026-08" };

    expect(missingAccounts(d, p, new Set(["acct_fresh"]))).toEqual([]);
  });
});
