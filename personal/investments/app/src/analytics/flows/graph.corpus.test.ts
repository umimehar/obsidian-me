import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GOLDENS } from "../../goldens";
import type { Datastore } from "../../store/datastore";
import { loadFlows } from "../../ui/data";
import { type GroupBy, buildFlowGraph } from "./graph";
import { allTime, yearPeriod } from "./period";
import { flowSummary } from "./summary";

const DATASTORE_PATH = join(import.meta.dir, "..", "..", "..", "..", "data", "datastore.json");
const GROUP_BYS: readonly GroupBy[] = [
  "accountType",
  "account",
  "purpose",
  "assetClass",
  "holding",
];

describe.if(existsSync(DATASTORE_PATH))("the flow graph over the real corpus", () => {
  test("every month, every year and all time balances for every group by", () => {
    const data = loadFlows();
    const all = new Set(data.accounts.map((a) => a.accountId));
    const months = [...new Set(data.blocks.map((b) => b.period))];
    const periods = [
      ...months.map((m) => ({ from: m, to: m })),
      ...[2023, 2024, 2025, 2026].map(yearPeriod),
      allTime(data),
    ];
    for (const p of periods) {
      for (const g of GROUP_BYS) {
        expect(() => buildFlowGraph(data, p, g, all)).not.toThrow();
      }
    }
  });

  test("the headline flows match the goldens", () => {
    const data = loadFlows();
    const all = new Set(data.accounts.map((a) => a.accountId));

    for (const key of ["2025", "2026", "all"] as const) {
      const p = key === "all" ? allTime(data) : yearPeriod(Number(key));
      const golden = GOLDENS.flows.headline[key];
      const s = flowSummary(data, p, all);
      const graph = buildFlowGraph(data, p, "accountType", all);

      expect(s.paidIn).toBeCloseTo(golden.paidIn, 2);
      expect(s.paidInBySource.payroll).toBeCloseTo(golden.paidInBySource.payroll, 2);
      expect(s.paidInBySource.outsideBank).toBeCloseTo(golden.paidInBySource.outsideBank, 2);
      expect(s.paidInBySource.interacIn).toBeCloseTo(golden.paidInBySource.interacIn, 2);
      expect(s.paidInBySource.business).toBeCloseTo(golden.paidInBySource.business, 2);
      expect(s.invested).toBeCloseTo(golden.invested, 2);
      expect(s.leftInCash).toBeCloseTo(golden.leftInCash, 2);
      expect(s.income).toBeCloseTo(golden.income, 2);
      expect(s.costs).toBeCloseTo(golden.costs, 2);
      expect(s.left).toBeCloseTo(golden.left, 2);
      expect(s.investedRate).toBeCloseTo(golden.investedRate ?? 0, 6);
      expect(graph.totalIn).toBeCloseTo(golden.totalIn, 2);
    }
  });

  test("chequing inflows count once: 2b74 2026-05 payroll in equals the statement's own deposits", async () => {
    // The independent figure, read straight off the datastore rather than
    // through `flows.json`: the BROKERAGE statement's own stated
    // `paidIn.deposits`, proving the duplicate CASH statement for that
    // month was dropped rather than double counted.
    const datastore = (await Bun.file(DATASTORE_PATH).json()) as Datastore;
    const account = datastore.accounts.find((a) => a.shortId === "2b74");
    if (account === undefined) throw new Error("2b74 not found in the datastore registry");
    const statement = datastore.statements.find(
      (s) =>
        s.source.accountNo === account.maskedId &&
        s.source.period === "2026-05" &&
        s.source.template === "BROKERAGE",
    );
    if (statement === undefined) throw new Error("2b74 2026-05 BROKERAGE statement not found");
    const cadBlock = statement.cash.find((c) => c.currency === "CAD");
    if (cadBlock === undefined) throw new Error("2b74 2026-05 has no CAD cash block");
    const statedDeposits = cadBlock.paidIn?.deposits ?? 0;

    const data = loadFlows();
    const rowsIn = data.rows
      .filter((r) => r.accountId === account.maskedId && r.period === "2026-05" && r.amount > 0)
      .reduce((sum, r) => sum + r.amount, 0);

    expect(rowsIn).toBeCloseTo(statedDeposits, 2);
  });
});
