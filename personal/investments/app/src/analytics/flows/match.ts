import type { FlowRow } from "./types";

const DAY_MS = 86_400_000;
const cents = (amount: number) => Math.round(Math.abs(amount) * 100);
const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/**
 * The more specific movement code wins a same-day, same-amount tie. A
 * transfer code (`TRFOUT`, `TRFOUTTF`, `CASH_TRANSFER`) names an internal
 * move; `WD`, `P2P_OUT` and `CASH_INTERAC_OUT` are generic outbound codes
 * that also happen to fit an internal transfer's shape on the corpus (2b74
 * 2026-01-14 carries both a WD and a TRFOUT of -700 against one +700
 * credit). Trying transfer codes first leaves the generic leg unpaired
 * rather than mislabelling the drill down on an arbitrary row order.
 */
const TRANSFER_CODES = new Set(["TRFOUT", "TRFOUTTF", "CASH_TRANSFER"]);

function byTransferCodeFirst(a: FlowRow, b: FlowRow): number {
  return Number(TRANSFER_CODES.has(b.code)) - Number(TRANSFER_CODES.has(a.code));
}

/**
 * Pairs a debit in one account with a credit in another: same currency,
 * same amount to the cent, dates within `maxLagDays`. Exact dates pair
 * first, then each extra day of lag in turn, so the closest partner wins.
 */
export function matchTransfers(rows: readonly FlowRow[], maxLagDays = 3): FlowRow[] {
  const result = rows.map((r) => ({ ...r }));
  const outs = result.filter((r) => r.movement && r.amount < 0).sort(byTransferCodeFirst);
  const ins = new Map<string, FlowRow[]>();
  for (const r of result) {
    if (!r.movement || r.amount <= 0) continue;
    const key = `${r.currency}|${cents(r.amount)}`;
    ins.set(key, [...(ins.get(key) ?? []), r]);
  }
  for (let lag = 0; lag <= maxLagDays; lag++) {
    for (const out of outs) {
      if (out.pairId !== null) continue;
      const partner = (ins.get(`${out.currency}|${cents(out.amount)}`) ?? []).find(
        (i) =>
          i.pairId === null &&
          i.accountId !== out.accountId &&
          Math.abs(dayOf(i.date) - dayOf(out.date)) === lag,
      );
      if (partner === undefined) continue;
      out.pairId = `${out.id}>${partner.id}`;
      partner.pairId = out.pairId;
      out.lagDays = lag;
      partner.lagDays = lag;
    }
  }
  return result;
}
