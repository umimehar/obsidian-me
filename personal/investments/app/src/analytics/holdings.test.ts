import { describe, expect, test } from "bun:test";
import rawDatastore from "@data/datastore.json";
import { GOLDENS } from "../goldens";
import type { Datastore } from "../store/datastore";
import { INDEX_GROUPS, buildHoldings } from "./holdings";

const DATASTORE = rawDatastore as Datastore;
const HOLDINGS = buildHoldings(DATASTORE.statements, DATASTORE.accounts);

describe("buildHoldings, over the real corpus", () => {
  test("total is within a cent per account of the portfolio total", () => {
    const tolerance = DATASTORE.accounts.length * 0.01;
    expect(Math.abs(HOLDINGS.total - GOLDENS.portfolio.total)).toBeLessThanOrEqual(tolerance);
  });

  test("VFV and VOO sum into the S&P 500 group", () => {
    const group = HOLDINGS.groups.find((g) => g.label === "S&P 500");
    expect(group).toBeDefined();
    expect(group?.symbols).toContain("VFV");
    const vfv = HOLDINGS.holdings.find((h) => h.symbol === "VFV");
    const voo = HOLDINGS.holdings.find((h) => h.symbol === "VOO");
    const expectedValue = (vfv?.value ?? 0) + (voo?.value ?? 0);
    expect(group?.value).toBeCloseTo(expectedValue, 6);
  });

  test("shares sum to 1 within 1e-9", () => {
    const sum = HOLDINGS.holdings.reduce((total, h) => total + h.share, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  test("every holding is attributed to at least one account label", () => {
    for (const holding of HOLDINGS.holdings) {
      expect(holding.accounts.length).toBeGreaterThan(0);
      for (const label of holding.accounts) expect(typeof label).toBe("string");
    }
  });

  test("index groups only ever list configured symbols", () => {
    for (const group of HOLDINGS.groups) {
      const configured = INDEX_GROUPS[group.label];
      expect(configured).toBeDefined();
      for (const symbol of group.symbols) expect(configured).toContain(symbol);
    }
  });

  test("currency split sums to the total, within a cent per account", () => {
    const tolerance = DATASTORE.accounts.length * 0.01;
    expect(Math.abs(HOLDINGS.currency.CAD + HOLDINGS.currency.USD - HOLDINGS.total)).toBeLessThan(
      tolerance,
    );
  });

  test("asset classes sum to the total", () => {
    const sum = HOLDINGS.assetClasses.reduce((total, c) => total + c.value, 0);
    expect(Math.abs(sum - HOLDINGS.total)).toBeLessThan(0.01);
  });

  test("the reported period is one the corpus actually reports", () => {
    expect(HOLDINGS.period.length).toBe(7);
    expect(HOLDINGS.period <= GOLDENS.corpus.latestPeriod).toBe(true);
  });
});
