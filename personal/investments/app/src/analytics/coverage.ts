import type { Datastore } from "../store/datastore";

export interface AccountCoverage {
  label: string;
  kind: string;
  inTotals: boolean;
  firstPeriod: string;
  lastPeriod: string;
  monthCount: number;
  /** Months from the account's first statement to the corpus's latest with no statement. */
  missing: string[];
}

export interface MonthCoverage {
  period: string;
  present: number;
  expected: number;
  missing: string[];
}

export interface Coverage {
  generated: string;
  latestPeriod: string;
  /** The newest month in which every account open by then has a statement. */
  latestComplete: string | null;
  accounts: AccountCoverage[];
  months: MonthCoverage[];
}

export function nextPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (year === undefined || month === undefined) throw new Error(`bad period ${period}`);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function periodRange(first: string, last: string): string[] {
  const out: string[] = [];
  for (let p = first; p <= last; p = nextPeriod(p)) out.push(p);
  return out;
}

/**
 * An account-month counts as covered when any statement exists for it,
 * whatever its template: the chequing accounts send a CASH statement, a
 * BROKERAGE one, or both, and each carries the month's closing balance.
 */
export function buildCoverage(datastore: Datastore): Coverage {
  const periods = datastore.statements.map((s) => s.source.period).sort();
  const earliest = periods[0];
  const latestPeriod = periods[periods.length - 1];
  if (earliest === undefined || latestPeriod === undefined) {
    throw new Error("the datastore holds no statements -- run `bun run build` first");
  }

  const seen = new Map<string, Set<string>>();
  for (const s of datastore.statements) {
    const set = seen.get(s.source.accountNo) ?? new Set<string>();
    set.add(s.source.period);
    seen.set(s.source.accountNo, set);
  }
  const has = (maskedId: string, period: string) => seen.get(maskedId)?.has(period) ?? false;

  const accounts = datastore.accounts.map((a) => ({
    label: a.label,
    kind: a.kind,
    inTotals: a.inTotals,
    firstPeriod: a.firstPeriod,
    lastPeriod: a.lastPeriod,
    monthCount: seen.get(a.maskedId)?.size ?? 0,
    missing: periodRange(a.firstPeriod, latestPeriod).filter((p) => !has(a.maskedId, p)),
  }));

  const months = periodRange(earliest, latestPeriod)
    .map((period) => {
      const open = datastore.accounts.filter((a) => a.firstPeriod <= period);
      const missing = open.filter((a) => !has(a.maskedId, period)).map((a) => a.label);
      return { period, present: open.length - missing.length, expected: open.length, missing };
    })
    .reverse();

  const complete = months.find((m) => m.missing.length === 0);
  return {
    generated: datastore.meta.generated,
    latestPeriod,
    latestComplete: complete?.period ?? null,
    accounts,
    months,
  };
}
