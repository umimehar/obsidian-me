import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadFlows } from "../../ui/data";
import { type TileBreakdown, tileBreakdowns } from "./breakdown";
import { allTime, yearPeriod } from "./period";

const DATASTORE_PATH = join(import.meta.dir, "..", "..", "..", "..", "data", "datastore.json");

/** Every tile whose parts are supposed to sum to the tile's own total -- `investedRate` is a ratio, never a sum. */
const SUMMING_TILES = ["paidIn", "invested", "leftInCash", "income", "costs", "left"] as const;

function partsSum(breakdown: TileBreakdown): number {
  return breakdown.parts.reduce((s, p) => s + p.amount, 0);
}

describe.if(existsSync(DATASTORE_PATH))("tileBreakdowns over the real corpus", () => {
  test("every summing tile's parts sum to the tile within a cent, and the identity holds within a cent", () => {
    const data = loadFlows();
    const all = new Set(data.accounts.map((a) => a.accountId));
    const months = [...new Set(data.blocks.map((b) => b.period))];
    const periods = [
      ...months.map((m) => ({ from: m, to: m })),
      ...[2023, 2024, 2025, 2026].map(yearPeriod),
      allTime(data),
    ];

    for (const p of periods) {
      const b = tileBreakdowns(data, p, all);
      for (const key of SUMMING_TILES) {
        const breakdown = b[key];
        expect(Math.abs(partsSum(breakdown) - breakdown.total)).toBeLessThan(0.005);
      }
      const lhs =
        b.identity.paidIn +
        b.identity.cesg +
        b.identity.income -
        b.identity.costs -
        b.identity.left -
        b.identity.currencyConversion;
      const rhs = b.identity.invested + b.identity.leftInCash;
      expect(Math.abs(lhs - rhs)).toBeLessThan(0.005);
    }
  });

  test("2026 figures match the ticket's own reviewer check", () => {
    const data = loadFlows();
    const all = new Set(data.accounts.map((a) => a.accountId));
    const b = tileBreakdowns(data, yearPeriod(2026), all);

    expect(b.paidIn.total).toBeCloseTo(134_880.63, 2);
    expect(b.invested.total).toBeCloseTo(144_420.23, 2);
    expect(b.leftInCash.total).toBeCloseTo(-18_197.11, 2);
    expect(b.income.total).toBeCloseTo(2_035.26, 2);
    expect(b.costs.total).toBeCloseTo(321.35, 2);
    expect(b.left.total).toBeCloseTo(10_885.85, 2);
    expect(b.investedRate.total).toBeCloseTo(1.049, 3);

    expect(b.paidIn.parts.find((p) => p.key === "payroll")?.amount).toBeCloseTo(46_464.63, 2);
    expect(b.paidIn.parts.find((p) => p.key === "outsideBank")?.amount).toBeCloseTo(20_816.0, 2);
    expect(b.paidIn.parts.find((p) => p.key === "interacIn")?.amount).toBeCloseTo(12_600.0, 2);
    expect(b.paidIn.parts.find((p) => p.key === "business")?.amount).toBeCloseTo(55_000.0, 2);

    expect(b.invested.parts.find((p) => p.key === "purchases")?.amount).toBeCloseTo(259_942.17, 2);
    expect(b.invested.parts.find((p) => p.key === "sales")?.amount).toBeCloseTo(-115_521.93, 2);

    expect(b.income.parts.find((p) => p.key === "dividends")?.amount).toBeCloseTo(1_745.69, 2);
    expect(b.income.parts.find((p) => p.key === "interest")?.amount).toBeCloseTo(65.64, 2);
    expect(b.income.parts.find((p) => p.key === "securitiesLending")?.amount).toBeCloseTo(1.73, 2);
    expect(b.income.parts.find((p) => p.key === "cashBack")?.amount).toBeCloseTo(142.2, 2);
    expect(b.income.parts.find((p) => p.key === "rewards")?.amount).toBeCloseTo(80.0, 2);

    expect(b.costs.parts.find((p) => p.key === "managementFees")?.amount).toBeCloseTo(234.25, 2);
    expect(b.costs.parts.find((p) => p.key === "withholdingTax")?.amount).toBeCloseTo(97.87, 2);
    expect(b.costs.parts.find((p) => p.key === "feeRebates")?.amount).toBeCloseTo(-10.77, 2);

    expect(b.left.parts.find((p) => p.key === "withdrawals")?.amount).toBeCloseTo(700.0, 2);
    expect(b.left.parts.find((p) => p.key === "cardPurchases")?.amount).toBeCloseTo(38.49, 2);
    expect(b.left.parts.find((p) => p.key === "sentToPerson")?.amount).toBeCloseTo(1.0, 2);

    expect(b.identity.currencyConversion).toBeCloseTo(285.57, 2);
  });
});
