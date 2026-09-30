import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GOLDENS } from "../../goldens";
import { loadFlows } from "../../ui/data";
import { type TileBreakdown, tileBreakdowns } from "./breakdown";
import { allTime, yearPeriod } from "./period";
import type { FlowsData } from "./types";

const DATASTORE_PATH = join(import.meta.dir, "..", "..", "..", "..", "data", "datastore.json");

/** Every tile whose parts are supposed to sum to the tile's own total -- `investedRate` is a ratio, never a sum. */
const SUMMING_TILES = ["paidIn", "invested", "leftInCash", "income", "costs", "left"] as const;

function partsSum(breakdown: TileBreakdown): number {
  return breakdown.parts.reduce((s, p) => s + p.amount, 0);
}

/**
 * Every account selection the corpus identity has to hold under: all of
 * them (the default), everything but chequing (the reviewer's own worked
 * case -- a filtered selection whose paired legs cross the boundary most),
 * a single TFSA, and a single chequing account.
 */
function accountSelections(data: FlowsData): { label: string; accounts: Set<string> }[] {
  const all = new Set(data.accounts.map((a) => a.accountId));
  const withoutChequing = new Set(
    data.accounts.filter((a) => a.kind !== "Chequing").map((a) => a.accountId),
  );
  const oneTfsa = data.accounts.find((a) => a.kind === "TFSA");
  const oneChequing = data.accounts.find((a) => a.kind === "Chequing");
  const selections = [
    { label: "all accounts", accounts: all },
    { label: "without chequing", accounts: withoutChequing },
  ];
  if (oneTfsa !== undefined) {
    selections.push({ label: "a single TFSA", accounts: new Set([oneTfsa.accountId]) });
  }
  if (oneChequing !== undefined) {
    selections.push({ label: "a single chequing", accounts: new Set([oneChequing.accountId]) });
  }
  return selections;
}

describe.if(existsSync(DATASTORE_PATH))("tileBreakdowns over the real corpus", () => {
  test("every summing tile's parts sum to the tile within a cent, and the identity holds within a cent, under every account selection", () => {
    const data = loadFlows();
    const months = [...new Set(data.blocks.map((b) => b.period))];
    const periods = [
      ...months.map((m) => ({ from: m, to: m })),
      ...[2023, 2024, 2025, 2026].map(yearPeriod),
      allTime(data),
    ];

    for (const { accounts } of accountSelections(data)) {
      for (const p of periods) {
        const b = tileBreakdowns(data, p, accounts);
        for (const key of SUMMING_TILES) {
          const breakdown = b[key];
          expect(Math.abs(partsSum(breakdown) - breakdown.total)).toBeLessThan(0.005);
        }
        const lhs =
          b.identity.paidIn +
          b.identity.cesg +
          b.identity.income +
          b.identity.movedIn -
          b.identity.costs -
          b.identity.left -
          b.identity.movedOut -
          b.identity.currencyConversion;
        const rhs = b.identity.invested + b.identity.leftInCash;
        expect(Math.abs(lhs - rhs)).toBeLessThan(0.005);
      }
    }
  });

  test("without chequing in 2026, the identity needs its moved-in term -- the reviewer's own worked case", () => {
    const data = loadFlows();
    const withoutChequing = new Set(
      data.accounts.filter((a) => a.kind !== "Chequing").map((a) => a.accountId),
    );
    const b = tileBreakdowns(data, yearPeriod(2026), withoutChequing);
    expect(b.identity.movedIn).toBeCloseTo(103278.98, 1);
  });

  test("2026 figures over all accounts match the golden, computed by the SAME production function", () => {
    const data = loadFlows();
    const all = new Set(data.accounts.map((a) => a.accountId));
    const b = tileBreakdowns(data, yearPeriod(2026), all);
    const golden = GOLDENS.flows.breakdown2026;
    const headline = GOLDENS.flows.headline["2026"];

    expect(b.paidIn.total).toBeCloseTo(headline.paidIn, 2);
    expect(b.invested.total).toBeCloseTo(headline.invested, 2);
    expect(b.leftInCash.total).toBeCloseTo(headline.leftInCash, 2);
    expect(b.income.total).toBeCloseTo(headline.income, 2);
    expect(b.costs.total).toBeCloseTo(headline.costs, 2);
    expect(b.left.total).toBeCloseTo(headline.left, 2);
    expect(b.investedRate.total).toBeCloseTo(headline.investedRate ?? 0, 6);

    for (const tile of SUMMING_TILES) {
      const goldenParts = golden.tiles[tile];
      if (goldenParts === undefined) throw new Error(`golden carries no parts for ${tile}`);
      for (const part of b[tile].parts) {
        expect(part.amount).toBeCloseTo(goldenParts[part.key] ?? Number.NaN, 2);
      }
      expect(Object.keys(goldenParts).sort()).toEqual(b[tile].parts.map((p) => p.key).sort());
    }

    expect(b.identity.paidIn).toBeCloseTo(golden.identity.paidIn, 2);
    expect(b.identity.cesg).toBeCloseTo(golden.identity.cesg, 2);
    expect(b.identity.income).toBeCloseTo(golden.identity.income, 2);
    expect(b.identity.movedIn).toBeCloseTo(golden.identity.movedIn, 2);
    expect(b.identity.costs).toBeCloseTo(golden.identity.costs, 2);
    expect(b.identity.left).toBeCloseTo(golden.identity.left, 2);
    expect(b.identity.movedOut).toBeCloseTo(golden.identity.movedOut, 2);
    expect(b.identity.currencyConversion).toBeCloseTo(golden.identity.currencyConversion, 2);
    expect(b.identity.invested).toBeCloseTo(golden.identity.invested, 2);
    expect(b.identity.leftInCash).toBeCloseTo(golden.identity.leftInCash, 2);
  });
});
