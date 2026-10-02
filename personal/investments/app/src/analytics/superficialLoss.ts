import type { Statement } from "../types";
import { PERSONAL_NONREG_KINDS } from "./accountScopes";
import type { SaleDetail } from "./income";
import type { AccountSeries } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * One loss sale the superficial-loss rule may touch: the sale itself, the
 * 30-day window it opens (`windowEnd`), and -- for a sale old enough that
 * the window has fully elapsed -- whether a replacement buy of the same
 * symbol actually landed inside it. `stillOpen` is true for a sale too
 * recent to know yet: the window has not elapsed as of `asOf`, so the
 * absence of a matching buy so far proves nothing.
 */
export interface SuperficialLossCandidate {
  sale: SaleDetail;
  windowStart: string;
  windowEnd: string;
  stillOpen: boolean;
  /** A BUY of the identical symbol inside the window, in any of the owner's accounts (registered and spousal included). Null when none is found. */
  matchedBuy: { date: string; maskedId: string } | null;
}

interface SymbolBuy {
  symbol: string;
  date: string;
  maskedId: string;
}

/** Every `BUY` row in the corpus, across every account regardless of kind -- a replacement buy in a TFSA, RRSP or the spousal RRSP counts exactly as one in a personal non-registered account does. */
function allBuys(statements: readonly Statement[]): SymbolBuy[] {
  const buys: SymbolBuy[] = [];
  for (const s of statements) {
    if (s.source.template !== "BROKERAGE") continue;
    for (const row of s.activity) {
      if (row.code !== "BUY") continue;
      const match = /^(\S+) -/.exec(row.description)?.[1];
      if (match) buys.push({ symbol: match, date: row.date, maskedId: s.source.accountNo });
    }
  }
  return buys;
}

/** The latest activity date across every statement -- "as of" for deciding whether a sale's window has fully elapsed. */
export function latestStatementDate(statements: readonly Statement[]): string {
  let latest = "";
  for (const s of statements) {
    for (const row of s.activity) {
      if (row.date > latest) latest = row.date;
    }
  }
  return latest;
}

/**
 * The superficial-loss watch: every loss sale in a personal non-registered
 * or Crypto account (see `PERSONAL_NONREG_KINDS`), flagged with the 30-day
 * window its replacement-buy rule opens around it and whether any account
 * -- registered or spousal RRSP included -- bought the identical symbol
 * inside that window.
 *
 * This never computes the denied amount: CRA's superficial loss formula
 * needs the replacement shares still held at the window's end, which this
 * project's per-statement ledger does not track precisely enough to state
 * as a filing figure. It flags the sale and the window instead, so the
 * owner knows to check rather than trusting a number this code cannot earn.
 */
export function superficialLossWatch(
  statements: readonly Statement[],
  series: readonly AccountSeries[],
  sales: readonly SaleDetail[],
): SuperficialLossCandidate[] {
  const personalIds = new Set(
    series.filter((a) => PERSONAL_NONREG_KINDS.has(a.kind)).map((a) => a.maskedId),
  );
  const buys = allBuys(statements);
  const asOf = latestStatementDate(statements);

  const candidates: SuperficialLossCandidate[] = [];
  for (const sale of sales) {
    if (sale.gain >= 0 || !personalIds.has(sale.maskedId)) continue;
    const windowStart = addDays(sale.date, -WINDOW_DAYS);
    const windowEnd = addDays(sale.date, WINDOW_DAYS);
    const stillOpen = daysBetween(windowEnd, asOf) < 0;

    const matchedBuy =
      buys.find(
        (b) =>
          b.symbol === sale.symbol &&
          b.date >= windowStart &&
          b.date <= windowEnd &&
          !(b.maskedId === sale.maskedId && b.date === sale.date),
      ) ?? null;

    candidates.push({
      sale,
      windowStart,
      windowEnd,
      stillOpen,
      matchedBuy: matchedBuy ? { date: matchedBuy.date, maskedId: matchedBuy.maskedId } : null,
    });
  }
  return candidates.sort((a, b) => a.sale.date.localeCompare(b.sale.date));
}
