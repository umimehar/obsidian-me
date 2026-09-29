import type { Statement } from "../../types";
import type { CashBlock, FlowRow } from "./types";

/** One block per account, month and currency: opening + rows = closing, with any gap kept. */
export function buildCashBlocks(
  statements: readonly Statement[],
  rows: readonly FlowRow[],
): CashBlock[] {
  const net = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.accountId}|${r.period}|${r.currency}`;
    net.set(key, (net.get(key) ?? 0) + r.amount);
  }
  return statements.flatMap((s) =>
    s.cash.map((c) => {
      const rowsNet = net.get(`${s.source.accountNo}|${s.source.period}|${c.currency}`) ?? 0;
      return {
        accountId: s.source.accountNo,
        period: s.source.period,
        currency: c.currency,
        opening: c.opening,
        closing: c.closing,
        fxRate: c.currency === "USD" ? s.fxRate : null,
        rowsNet,
        residual: c.closing - c.opening - rowsNet,
      };
    }),
  );
}
