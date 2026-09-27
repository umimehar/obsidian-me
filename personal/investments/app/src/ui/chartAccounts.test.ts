import { describe, expect, test } from "bun:test";
import { buildPortfolioSeries } from "../analytics/portfolioSeries";
import {
  chartSubject,
  chartableAccounts,
  defaultSelection,
  isDefaultSelection,
  seriesForChart,
} from "./chartAccounts";
import { loadAnalytics } from "./data";

const { series } = loadAnalytics();

function id(label: string): string {
  const account = series.find((a) => a.label === label);
  if (account === undefined) throw new Error(`no account labelled ${label}`);
  return account.maskedId;
}

describe("chartableAccounts", () => {
  test("offers every account with a market value, except chequing, sorted by label", () => {
    const labels = chartableAccounts(series).map((a) => a.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(labels).toContain("Spousal RRSP");
    expect(labels.some((l) => l.startsWith("Chequing"))).toBe(false);
    expect(labels).toHaveLength(series.filter((a) => a.kind !== "Chequing").length);
  });
});

describe("defaultSelection", () => {
  test("is exactly the accounts in the portfolio total", () => {
    const counted = series.filter((a) => a.inTotals).map((a) => a.maskedId);
    expect([...defaultSelection(series)].sort()).toEqual(counted.sort());
    expect(defaultSelection(series).has(id("Spousal RRSP"))).toBe(false);
  });
});

describe("seriesForChart", () => {
  test("the default selection passes the series through untouched, so the chart is the portfolio", () => {
    expect(seriesForChart(series, defaultSelection(series))).toBe(series);
  });

  test("two accounts chart their sum and nothing else", () => {
    const picked = new Set([id("FHSA"), id("RESP")]);
    const last = buildPortfolioSeries(seriesForChart(series, picked)).at(-1);
    const expected = series
      .filter((a) => picked.has(a.maskedId))
      .reduce((sum, a) => sum + (a.months.at(-1)?.marketValue ?? 0), 0);
    expect(last?.accountCount).toBe(2);
    expect(last?.marketValue).toBeCloseTo(expected, 2);
  });

  test("an account held out of the total still charts when picked", () => {
    const picked = new Set([id("Spousal RRSP")]);
    expect(buildPortfolioSeries(seriesForChart(series, picked)).length).toBeGreaterThan(0);
  });

  test("the portfolio plus the spousal account is no longer the default", () => {
    const picked = new Set([...defaultSelection(series), id("Spousal RRSP")]);
    expect(isDefaultSelection(series, picked)).toBe(false);
    expect(buildPortfolioSeries(seriesForChart(series, picked)).at(-1)?.accountCount).toBe(
      picked.size,
    );
  });
});

describe("chartSubject", () => {
  test("names the portfolio, one account, or a count", () => {
    expect(chartSubject(series, defaultSelection(series))).toBe("Portfolio");
    expect(chartSubject(series, new Set([id("RESP")]))).toBe("RESP");
    expect(chartSubject(series, new Set([id("RESP"), id("FHSA")]))).toBe("2 accounts");
  });
});
