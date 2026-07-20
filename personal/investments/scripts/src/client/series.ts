// Pure aggregation over the parsed ledger + a Scope, producing chart-ready
// plain data. No DOM, no Chart.js — ported faithfully from the old
// hand-rolled client (`git show 95dca14:.../ledger.js`, seriesStock/flowSum/
// contribCum/bucketLast/bucketSum). Two subtleties carried over on purpose:
// flows (contrib/deposits/income/inflow/outflow) SUM within the window, so a
// non-contiguous selection never leaks excluded months; acb/cash are STOCKS
// read as-of the window end, forward-filled across months with no statement
// activity. Contributions are cumulative to-date (from month 0), not just
// within the window, matching the old client's running-total semantics.
import type { Grain, Scope } from "./filter";
import { grainOf, pkey } from "./filter";

export interface SeriesAccount {
  id: string;
  kind: string;
  name: string;
  short_id: string;
  currency: string;
}

export interface SeriesRow {
  account_id: string;
  month: string;
  contrib: number;
  deposits: number;
  income: number;
  inflow: number;
  outflow: number;
  cash: number | null;
  acb: number | null;
}

export interface GrowthAccountRow {
  account_id: string;
  cost: number;
  market: number;
  gain: number;
  gainPct: number;
}

export interface SeriesGrowth {
  as_of: string | null;
  coverage: number;
  accounts: GrowthAccountRow[];
  total: { cost: number; market: number; gain: number; gainPct: number };
}

// The subset of the parsed ledger this module reads. Kept local (not
// imported from analytics.ts) so this module never pulls in node-only code
// when bundled for the browser.
export interface SeriesLedger {
  accounts: SeriesAccount[];
  months: string[];
  series: SeriesRow[];
  holdings: Array<{ account_id: string; symbol: string; qty: number; acb: number }>;
  growth: SeriesGrowth;
}

export interface TrendSeries {
  labels: string[];
  capital: number[];
  contributions: number[];
}

export interface PeriodSeries {
  labels: string[];
  values: number[];
}

export interface CashflowSeries {
  labels: string[];
  inflow: number[];
  outflow: number[];
  net: number[];
}

export interface GrowthRow {
  account_id: string;
  name: string;
  kind: string;
  short_id: string;
  cost: number;
  market: number;
  gain: number;
  gainPct: number;
}

interface FlowRec {
  contrib: number;
  deposits: number;
  income: number;
  inflow: number;
  outflow: number;
}

type FlowField = keyof FlowRec;

interface Fill {
  flow: Map<string, FlowRec[]>;
  acbFF: Map<string, number[]>;
  cashFF: Map<string, number[]>;
}

interface Point {
  i: number;
  v: number;
}

interface BucketPoint {
  key: string;
  v: number;
}

function zeroFlow(): FlowRec {
  return { contrib: 0, deposits: 0, income: 0, inflow: 0, outflow: 0 };
}

function initFill(ledger: SeriesLedger): Fill {
  const flow = new Map<string, FlowRec[]>();
  const acbFF = new Map<string, number[]>();
  const cashFF = new Map<string, number[]>();
  for (const a of ledger.accounts) {
    flow.set(
      a.id,
      ledger.months.map(() => zeroFlow()),
    );
    acbFF.set(
      a.id,
      ledger.months.map(() => 0),
    );
    cashFF.set(
      a.id,
      ledger.months.map(() => 0),
    );
  }
  return { flow, acbFF, cashFF };
}

// Places each series row's raw values at its month index, and records which
// months carried an explicit (non-null) acb/cash reading so forwardFill()
// knows where the "seen" runs start.
function placeSeries(
  ledger: SeriesLedger,
  fill: Fill,
): { acbSeen: Map<string, Set<string>>; cashSeen: Map<string, Set<string>> } {
  const idx = new Map(ledger.months.map((m, i) => [m, i]));
  const acbSeen = new Map<string, Set<string>>(
    ledger.accounts.map((a) => [a.id, new Set<string>()]),
  );
  const cashSeen = new Map<string, Set<string>>(
    ledger.accounts.map((a) => [a.id, new Set<string>()]),
  );
  for (const s of ledger.series) {
    const i = idx.get(s.month);
    if (i === undefined) continue;
    const f = fill.flow.get(s.account_id);
    if (f) {
      f[i] = {
        contrib: s.contrib,
        deposits: s.deposits,
        income: s.income,
        inflow: s.inflow,
        outflow: s.outflow,
      };
    }
    if (s.acb != null) {
      const arr = fill.acbFF.get(s.account_id);
      if (arr) arr[i] = s.acb;
      acbSeen.get(s.account_id)?.add(s.month);
    }
    if (s.cash != null) {
      const arr = fill.cashFF.get(s.account_id);
      if (arr) arr[i] = s.cash;
      cashSeen.get(s.account_id)?.add(s.month);
    }
  }
  return { acbSeen, cashSeen };
}

function forwardFillOne(months: string[], arr: number[], seen: Set<string>): void {
  let carried = false;
  let last = 0;
  for (let i = 0; i < months.length; i++) {
    const m = months[i] ?? "";
    if (seen.has(m)) {
      carried = true;
      last = arr[i] ?? 0;
    } else if (carried) {
      arr[i] = last;
    }
  }
}

// Builds forward-filled, ledger.months-aligned arrays per account: raw flows
// (contrib/deposits/income/inflow/outflow, zero where unreported) and
// stock-carried acb/cash (last known value, held until the next reading).
function buildFill(ledger: SeriesLedger): Fill {
  const fill = initFill(ledger);
  const { acbSeen, cashSeen } = placeSeries(ledger, fill);
  for (const a of ledger.accounts) {
    forwardFillOne(ledger.months, fill.acbFF.get(a.id) ?? [], acbSeen.get(a.id) ?? new Set());
    forwardFillOne(ledger.months, fill.cashFF.get(a.id) ?? [], cashSeen.get(a.id) ?? new Set());
  }
  return fill;
}

function sumAccountsAt(ids: string[], arrays: Map<string, number[]>, i: number): number {
  let v = 0;
  for (const id of ids) v += arrays.get(id)?.[i] ?? 0;
  return v;
}

// Cumulative contributions to-date at each window index: the running total
// is summed from month 0, not from the window start, so a filtered window
// (e.g. a single year) still reports the true to-date total at each point.
function contribCumSeries(
  months: string[],
  ris: number[],
  accts: string[],
  flow: Map<string, FlowRec[]>,
): Point[] {
  const byMonth = new Map<number, number>();
  let running = 0;
  for (let i = 0; i < months.length; i++) {
    for (const id of accts) running += flow.get(id)?.[i]?.contrib ?? 0;
    byMonth.set(i, running);
  }
  return ris.map((i) => ({ i, v: byMonth.get(i) ?? 0 }));
}

function flowSumSeries(
  ris: number[],
  accts: string[],
  flow: Map<string, FlowRec[]>,
  field: FlowField,
): Point[] {
  return ris.map((i) => {
    let v = 0;
    for (const id of accts) v += flow.get(id)?.[i]?.[field] ?? 0;
    return { i, v };
  });
}

// Groups points into grain buckets (month or year), keeping the LAST value
// seen per bucket — correct for stock quantities (acb/cash/cumulative
// contributions), where the period's value is its value at period end.
function bucketLast(points: Point[], months: string[], grain: Grain): BucketPoint[] {
  const out: BucketPoint[] = [];
  const seen = new Map<string, number>();
  for (const p of points) {
    const key = pkey(months[p.i] ?? "", grain);
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push({ key, v: p.v });
    } else {
      const existing = out[at];
      if (existing) existing.v = p.v;
    }
  }
  return out;
}

// Groups points into grain buckets, SUMMING within each bucket — correct for
// flow quantities (income/inflow/outflow), where the period's value is the
// total activity across its constituent months.
function bucketSum(points: Point[], months: string[], grain: Grain): BucketPoint[] {
  const out: BucketPoint[] = [];
  const seen = new Map<string, number>();
  for (const p of points) {
    const key = pkey(months[p.i] ?? "", grain);
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push({ key, v: p.v });
    } else {
      const existing = out[at];
      if (existing) existing.v += p.v;
    }
  }
  return out;
}

// Capital-at-cost (acb + cash, as-of each bucket's end) alongside cumulative
// contributions to-date, aligned to the same label array.
export function capitalTrend(ledger: SeriesLedger, scope: Scope): TrendSeries {
  const { flow, acbFF, cashFF } = buildFill(ledger);
  const grain = grainOf(scope.ris);
  const capitalPoints = scope.ris.map((i) => ({
    i,
    v: sumAccountsAt(scope.accts, acbFF, i) + sumAccountsAt(scope.accts, cashFF, i),
  }));
  const capital = bucketLast(capitalPoints, ledger.months, grain);
  const contributions = bucketLast(
    contribCumSeries(ledger.months, scope.ris, scope.accts, flow),
    ledger.months,
    grain,
  );
  return {
    labels: capital.map((p) => p.key),
    capital: capital.map((p) => p.v),
    contributions: contributions.map((p) => p.v),
  };
}

// Income received per period (summed within each bucket).
export function incomeSeries(ledger: SeriesLedger, scope: Scope): PeriodSeries {
  const { flow } = buildFill(ledger);
  const grain = grainOf(scope.ris);
  const bucketed = bucketSum(
    flowSumSeries(scope.ris, scope.accts, flow, "income"),
    ledger.months,
    grain,
  );
  return { labels: bucketed.map((p) => p.key), values: bucketed.map((p) => p.v) };
}

// Inflow / outflow / net per period (summed within each bucket).
export function cashflowSeries(ledger: SeriesLedger, scope: Scope): CashflowSeries {
  const { flow } = buildFill(ledger);
  const grain = grainOf(scope.ris);
  const inflow = bucketSum(
    flowSumSeries(scope.ris, scope.accts, flow, "inflow"),
    ledger.months,
    grain,
  );
  const outflow = bucketSum(
    flowSumSeries(scope.ris, scope.accts, flow, "outflow"),
    ledger.months,
    grain,
  );
  const net = inflow.map((p, i) => p.v + (outflow[i]?.v ?? 0));
  return {
    labels: inflow.map((p) => p.key),
    inflow: inflow.map((p) => p.v),
    outflow: outflow.map((p) => p.v),
    net,
  };
}

// Growth-by-account snapshot (not a time series): L.growth.accounts joined
// to name/kind/short_id and filtered to the scoped account ids.
export function growthByAccount(ledger: SeriesLedger, scope: Scope): GrowthRow[] {
  const acctIds = new Set(scope.accts);
  const byId = new Map(ledger.accounts.map((a) => [a.id, a]));
  const rows: GrowthRow[] = [];
  for (const g of ledger.growth.accounts) {
    if (!acctIds.has(g.account_id)) continue;
    const a = byId.get(g.account_id);
    rows.push({
      account_id: g.account_id,
      name: a?.name ?? g.account_id,
      kind: a?.kind ?? "",
      short_id: a?.short_id ?? "",
      cost: g.cost,
      market: g.market,
      gain: g.gain,
      gainPct: g.gainPct,
    });
  }
  return rows;
}
