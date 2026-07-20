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
  external_in: number;
  external_out: number;
  deposits: number;
  income: number;
  inflow: number;
  outflow: number;
  cash: number | null;
  acb: number | null;
  interest: number;
  eligible_dividends: number;
  foreign_income: number;
  realized_gain: number;
}

export interface LedgerFlow {
  account_id: string;
  month: string;
  date: string;
  type: string;
  amount: number;
  description: string;
}

// The subset of the parsed ledger this module reads. Kept local (not
// imported from analytics.ts) so this module never pulls in node-only code
// when bundled for the browser.
export interface SeriesLedger {
  accounts: SeriesAccount[];
  months: string[];
  series: SeriesRow[];
  holdings: Array<{ account_id: string; symbol: string; qty: number; acb: number }>;
  limits: Record<string, Record<string, number>>;
  flows: LedgerFlow[];
}

export interface TrendSeries {
  labels: string[];
  capital: number[];
  contributions: number[];
  deposits: number[];
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

export interface AccountCost {
  account_id: string;
  kind: string;
  short_id: string;
  cost: number;
  contributions: number;
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

// Cumulative flow to-date at each window index: the running total is summed
// from month 0, not from the window start, so a filtered window (e.g. a
// single year) still reports the true to-date total at each point. Used for
// both contributions (CRA room) and deposits (true external money in).
function flowCumSeries(
  months: string[],
  ris: number[],
  accts: string[],
  flow: Map<string, FlowRec[]>,
  field: FlowField,
): Point[] {
  const byMonth = new Map<number, number>();
  let running = 0;
  for (let i = 0; i < months.length; i++) {
    for (const id of accts) running += flow.get(id)?.[i]?.[field] ?? 0;
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
    flowCumSeries(ledger.months, scope.ris, scope.accts, flow, "contrib"),
    ledger.months,
    grain,
  );
  const deposits = bucketLast(
    flowCumSeries(ledger.months, scope.ris, scope.accts, flow, "deposits"),
    ledger.months,
    grain,
  );
  return {
    labels: capital.map((p) => p.key),
    capital: capital.map((p) => p.v),
    contributions: contributions.map((p) => p.v),
    deposits: deposits.map((p) => p.v),
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

// Per-account cost snapshot for the selected scope (not a time series): the
// adjusted cost base forward-filled to the window's last selected month
// (reusing the same acb forward-fill capitalTrend uses), plus contributions
// summed within the window. Sorted by cost descending.
export function costByAccount(ledger: SeriesLedger, scope: Scope): AccountCost[] {
  const { flow, acbFF } = buildFill(ledger);
  const byId = new Map(ledger.accounts.map((a) => [a.id, a]));
  const endIdx = scope.ris.length > 0 ? Math.max(...scope.ris) : -1;
  const rows: AccountCost[] = [];
  for (const id of scope.accts) {
    const a = byId.get(id);
    if (!a) continue;
    const cost = endIdx >= 0 ? (acbFF.get(id)?.[endIdx] ?? 0) : 0;
    let contributions = 0;
    for (const i of scope.ris) contributions += flow.get(id)?.[i]?.contrib ?? 0;
    rows.push({ account_id: id, kind: a.kind, short_id: a.short_id, cost, contributions });
  }
  return rows.sort((a, b) => b.cost - a.cost);
}

// The tax year the Tax and Room sections report: the year of the last month
// in the resolved window, so an "All time" scope reports the latest data
// year and a custom range reports the range's end year. Falls back to the
// ledger's own last month when the window is empty.
export function scopeYear(ledger: SeriesLedger, scope: Scope): string {
  const lastIdx = scope.ris.length > 0 ? Math.max(...scope.ris) : ledger.months.length - 1;
  const m = ledger.months[lastIdx] ?? ledger.months[ledger.months.length - 1] ?? "";
  return m.slice(0, 4);
}

export interface TaxRoomRow {
  group: string;
  used: number;
  limit: number;
  remaining: number;
}

export interface TaxSummary {
  interest: number;
  eligible_dividends: number;
  foreign_income: number;
  realized_gains: number;
  room: TaxRoomRow[];
}

// Registered account kinds collapse into four CRA room groups; ManagedTFSA
// shares the TFSA group's room with regular TFSA accounts.
const REGISTERED_GROUPS: Record<string, string> = {
  TFSA: "TFSA",
  ManagedTFSA: "TFSA",
  FHSA: "FHSA",
  RRSP: "RRSP",
  RESP: "RESP",
};
const ROOM_GROUP_ORDER = ["TFSA", "FHSA", "RRSP", "RESP"];

// Tax income, realized gains, and registered room, all filter-aware: summed
// only over the scoped accounts and the given tax year (see scopeYear).
// Income/gain fields are 0 for non-taxable accounts at the analytics layer,
// so summing across the full scope is safe. Room `used` sums `external_in`
// (real contributions, including external deposits that Wealthsimple coded
// as TRANSFER_IN rather than CONTRIB) for the scoped accounts in each
// registered group; there is no OVER flag — unused room carries forward from
// prior years, so a full bar is not necessarily an over-contribution.
export function taxSummary(ledger: SeriesLedger, scope: Scope, year: string): TaxSummary {
  const accts = new Set(scope.accts);
  const kindById = new Map(ledger.accounts.map((a) => [a.id, a.kind]));
  let interest = 0;
  let eligibleDividends = 0;
  let foreignIncome = 0;
  let realizedGains = 0;
  const used = new Map<string, number>();
  for (const row of ledger.series) {
    if (!accts.has(row.account_id) || !row.month.startsWith(year)) continue;
    interest += row.interest;
    eligibleDividends += row.eligible_dividends;
    foreignIncome += row.foreign_income;
    realizedGains += row.realized_gain;
    const group = REGISTERED_GROUPS[kindById.get(row.account_id) ?? ""];
    if (group) used.set(group, (used.get(group) ?? 0) + row.external_in);
  }
  const room = ROOM_GROUP_ORDER.map((group) => {
    const u = used.get(group) ?? 0;
    const limit = ledger.limits[group]?.[year] ?? 0;
    return { group, used: u, limit, remaining: limit - u };
  });
  return {
    interest,
    eligible_dividends: eligibleDividends,
    foreign_income: foreignIncome,
    realized_gains: realizedGains,
    room,
  };
}

export interface PeriodFlows {
  inflow: LedgerFlow[];
  outflow: LedgerFlow[];
}

// The scoped account flows (CONTRIB / TRANSFER_IN / TRANSFER_OUT) for one
// period, split into money in (positive amount) and money out (negative
// amount, i.e. TRANSFER_OUT). `period` is either a full month ("YYYY-MM"),
// matching that month only, or a bare year ("YYYY"), matching every month in
// it — this is what lets a click on a YEAR-grain cashflow bar drill into the
// whole year's transactions. Backs the cashflow chart's drill-down.
export function flowsForPeriod(ledger: SeriesLedger, scope: Scope, period: string): PeriodFlows {
  const accts = new Set(scope.accts);
  const matching = ledger.flows.filter(
    (f) => f.month.startsWith(period) && accts.has(f.account_id),
  );
  const byDate = (a: LedgerFlow, b: LedgerFlow): number => a.date.localeCompare(b.date);
  return {
    inflow: matching.filter((f) => f.amount > 0).sort(byDate),
    outflow: matching.filter((f) => f.amount < 0).sort(byDate),
  };
}
