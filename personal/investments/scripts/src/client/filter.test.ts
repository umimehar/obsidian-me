import { describe, expect, test } from "bun:test";
import {
  ALL_TIME,
  type FilterAccount,
  type FilterState,
  type TimeState,
  applyAccountSelection,
  dateToMonthKey,
  formatScope,
  grainOf,
  groupAccounts,
  monthEndDate,
  monthLabel,
  pkey,
  resolveWindow,
} from "./filter";

const MONTHS = [
  "2024-01",
  "2024-02",
  "2024-03",
  "2024-04",
  "2024-05",
  "2024-06",
  "2024-07",
  "2024-08",
  "2024-09",
  "2024-10",
  "2024-11",
  "2024-12",
  "2025-01",
  "2025-02",
  "2025-03",
  "2025-04",
  "2025-05",
  "2025-06",
  "2025-07",
];

describe("resolveWindow", () => {
  test("all preset returns every month index", () => {
    expect(resolveWindow(ALL_TIME, MONTHS)).toEqual(MONTHS.map((_, i) => i));
  });

  test("ytd returns only months in the last month's year", () => {
    const time: TimeState = { mode: "preset", preset: "ytd", from: "", to: "" };
    const ris = resolveWindow(time, MONTHS);
    expect(ris.every((i) => MONTHS[i]?.startsWith("2025"))).toBe(true);
    expect(ris.length).toBe(7); // 2025-01..2025-07
  });

  test("1y returns the last 12 months", () => {
    const time: TimeState = { mode: "preset", preset: "1y", from: "", to: "" };
    const ris = resolveWindow(time, MONTHS);
    expect(ris.length).toBe(12);
    expect(MONTHS[ris[0] ?? -1]).toBe("2024-08");
    expect(MONTHS[ris[ris.length - 1] ?? -1]).toBe("2025-07");
  });

  test("3y clamps to the full range when fewer than 36 months exist", () => {
    const time: TimeState = { mode: "preset", preset: "3y", from: "", to: "" };
    const ris = resolveWindow(time, MONTHS);
    expect(ris.length).toBe(MONTHS.length);
  });

  test("custom range is inclusive of from and to", () => {
    const time: TimeState = { mode: "custom", preset: "all", from: "2024-11", to: "2025-01" };
    const ris = resolveWindow(time, MONTHS);
    expect(ris.map((i) => MONTHS[i])).toEqual(["2024-11", "2024-12", "2025-01"]);
  });

  test("empty months returns an empty window", () => {
    expect(resolveWindow(ALL_TIME, [])).toEqual([]);
  });
});

describe("applyAccountSelection (accounts orthogonal to time)", () => {
  test("toggling accounts preserves an active custom range", () => {
    const time: TimeState = { mode: "custom", preset: "all", from: "2024-11", to: "2025-01" };
    const before: FilterState = { accts: null, time };
    const after = applyAccountSelection(before, ["1", "2"]);
    expect(after.accts).toEqual(["1", "2"]);
    expect(after.time).toBe(time);
    // resolveMonths() must be unchanged by the account toggle.
    expect(resolveWindow(after.time, MONTHS)).toEqual(resolveWindow(before.time, MONTHS));
  });

  test("toggling accounts preserves an active preset", () => {
    const time: TimeState = { mode: "preset", preset: "1y", from: "", to: "" };
    const before: FilterState = { accts: ["1"], time };
    const after = applyAccountSelection(before, ["1", "2", "3"]);
    expect(after.accts).toEqual(["1", "2", "3"]);
    expect(after.time).toBe(time);
    expect(resolveWindow(after.time, MONTHS)).toEqual(resolveWindow(before.time, MONTHS));
  });

  test("clearing the selection back to all accounts still preserves time", () => {
    const time: TimeState = { mode: "custom", preset: "all", from: "2024-01", to: "2024-06" };
    const before: FilterState = { accts: ["1", "2"], time };
    const after = applyAccountSelection(before, null);
    expect(after.accts).toBeNull();
    expect(after.time).toBe(time);
  });
});

function account(overrides: Partial<FilterAccount>): FilterAccount {
  return {
    id: "acct_a",
    kind: "TFSA",
    name: "Test",
    short_id: "aaaa",
    currency: "CAD",
    ...overrides,
  };
}

describe("groupAccounts", () => {
  test("buckets known kinds into Registered/Taxable/Cash", () => {
    const accounts = [
      account({ id: "1", kind: "TFSA" }),
      account({ id: "2", kind: "RRSP" }),
      account({ id: "3", kind: "NonRegistered" }),
      account({ id: "4", kind: "Crypto" }),
      account({ id: "5", kind: "Chequing" }),
      account({ id: "6", kind: "CreditCard" }),
    ];
    const groups = groupAccounts(accounts);
    expect(groups.Registered.map((a) => a.id)).toEqual(["1", "2"]);
    expect(groups.Taxable.map((a) => a.id)).toEqual(["3", "4"]);
    expect(groups.Cash.map((a) => a.id)).toEqual(["5", "6"]);
  });

  test("an unclassified kind falls into Cash", () => {
    const groups = groupAccounts([account({ id: "7", kind: "USD" })]);
    expect(groups.Cash.map((a) => a.id)).toEqual(["7"]);
    expect(groups.Registered).toEqual([]);
    expect(groups.Taxable).toEqual([]);
  });
});

describe("formatScope", () => {
  test("all accounts and all time", () => {
    expect(formatScope(3, 3, ALL_TIME, MONTHS)).toBe("All accounts · All time");
  });

  test("zero selected also reads as all accounts", () => {
    expect(formatScope(0, 3, ALL_TIME, MONTHS)).toBe("All accounts · All time");
  });

  test("a narrowed account count, singular and plural", () => {
    const one: TimeState = { mode: "preset", preset: "1y", from: "", to: "" };
    expect(formatScope(1, 3, one, MONTHS)).toBe("1 account · Last 12 months");
    expect(formatScope(2, 3, one, MONTHS)).toBe("2 accounts · Last 12 months");
  });

  test("ytd and 3y presets", () => {
    const ytd: TimeState = { mode: "preset", preset: "ytd", from: "", to: "" };
    const threeY: TimeState = { mode: "preset", preset: "3y", from: "", to: "" };
    expect(formatScope(3, 3, ytd, MONTHS)).toBe("All accounts · Year to date");
    expect(formatScope(3, 3, threeY, MONTHS)).toBe("All accounts · Last 36 months");
  });

  test("custom range formats both month labels", () => {
    const custom: TimeState = { mode: "custom", preset: "all", from: "2025-01", to: "2025-06" };
    expect(formatScope(2, 3, custom, MONTHS)).toBe("2 accounts · Jan 2025 – Jun 2025");
  });
});

describe("monthLabel", () => {
  test("formats YYYY-MM as 'Mon YYYY'", () => {
    expect(monthLabel("2025-01")).toBe("Jan 2025");
    expect(monthLabel("2026-12")).toBe("Dec 2026");
  });
});

describe("monthEndDate", () => {
  test("returns the last calendar day of the month", () => {
    expect(monthEndDate("2024-02")).toBe("2024-02-29"); // leap year
    expect(monthEndDate("2025-02")).toBe("2025-02-28");
    expect(monthEndDate("2025-07")).toBe("2025-07-31");
    expect(monthEndDate("2025-04")).toBe("2025-04-30");
  });
});

describe("dateToMonthKey", () => {
  test("formats a local Date as YYYY-MM", () => {
    expect(dateToMonthKey(new Date(2025, 0, 15))).toBe("2025-01");
    expect(dateToMonthKey(new Date(2025, 10, 3))).toBe("2025-11");
  });
});

describe("grainOf / pkey", () => {
  test("grainOf switches to year grain past 24 months", () => {
    expect(grainOf(Array.from({ length: 24 }, (_, i) => i))).toBe("month");
    expect(grainOf(Array.from({ length: 25 }, (_, i) => i))).toBe("year");
  });

  test("pkey buckets by month or year depending on grain", () => {
    expect(pkey("2025-03", "month")).toBe("2025-03");
    expect(pkey("2025-03", "year")).toBe("2025");
  });
});
