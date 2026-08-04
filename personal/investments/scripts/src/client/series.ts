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
import type { AccountAllocation } from "./projection";
import type { ProjectionInputs, RegisteredRules } from "./projection";

export interface SeriesAccount {
  id: string;
  kind: string;
  name: string;
  short_id: string;
  currency: string;
  first_activity: string;
}

export interface SeriesRow {
  account_id: string;
  month: string;
  contrib: number;
  external_in: number;
  external_out: number;
  deposits: number;
  // Government grant money received into the account this month (CESG on an
  // RESP). Not a contribution and does not consume room, but the projection
  // needs the amount already received — this is the only client-reachable
  // source for it (see the `cesgReceived` derivation below).
  grant: number;
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
  assessed_room: Record<string, Record<string, number>>;
  registered_rules: Record<string, number>;
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
  name: string;
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
    rows.push({
      account_id: id,
      kind: a.kind,
      name: a.name,
      short_id: a.short_id,
      cost,
      contributions,
    });
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
  // True when `limit` is this person's CRA-assessed room from a notice of
  // assessment (carry-forward included), false when it is the generic annual
  // maximum. The two mean different things and the page says which it showed.
  assessed: boolean;
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
export const REGISTERED_GROUPS: Record<string, string> = {
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
// so summing across the full scope is safe. Room `used` sums `contrib` (the
// contributions Wealthsimple explicitly tagged CONTRIB) for the scoped
// accounts in each registered group. It deliberately does NOT use the gross
// `external_in`, because a routing/hub account inflates that with deposits
// that pass straight through to other accounts (see CLAUDE.md's hub caveat).
// There is no OVER flag. A bar measured against the generic annual maximum can
// read full without being an over-contribution, because unused room carries
// forward. A bar carrying `assessed: true` is measured against CRA-assessed
// room that already includes the carry-forward, so there the comparison is
// real — but it still is not a filing figure.
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
    if (group) used.set(group, (used.get(group) ?? 0) + row.contrib);
  }
  const room = ROOM_GROUP_ORDER.map((group) => {
    const u = used.get(group) ?? 0;
    const noa = ledger.assessed_room?.[group]?.[year];
    const assessed = noa !== undefined;
    const limit = assessed ? noa : (ledger.limits[group]?.[year] ?? 0);
    return { group, used: u, limit, remaining: limit - u, assessed };
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

export interface ProjectionOptions {
  returnRate: number;
  indexRate: number;
  years: number;
  rrspLastYear: string;
  // OWNER-SUPPLIED. Not derivable from the ledger payload (see
  // analytics.ts's RESP_BENEFICIARY_BIRTH_YEAR, which this file must not
  // import — it reaches here as an explicit parameter instead).
  respBeneficiaryBirthYear: number;
}

// Registered account ids in scope, grouped the same way taxSummary groups
// them (ManagedTFSA shares the TFSA group).
function scopedAccountsByGroup(ledger: SeriesLedger, scope: Scope): Map<string, string[]> {
  const accts = new Set(scope.accts);
  const byGroup = new Map<string, string[]>();
  for (const a of ledger.accounts) {
    const group = REGISTERED_GROUPS[a.kind];
    if (!group || !accts.has(a.id)) continue;
    const list = byGroup.get(group) ?? [];
    list.push(a.id);
    byGroup.set(group, list);
  }
  return byGroup;
}

// Opening balance per group: portfolio at cost (last non-null acb, plus cash)
// at the scope window's end, reusing buildFill's forward-fill — the same
// convention capitalTrend and costByAccount already use, not a second one.
function openingByGroup(
  ledger: SeriesLedger,
  scope: Scope,
  byGroup: Map<string, string[]>,
): Record<string, number> {
  const { acbFF, cashFF } = buildFill(ledger);
  const endIdx = scope.ris.length > 0 ? Math.max(...scope.ris) : -1;
  const out: Record<string, number> = {};
  for (const [group, ids] of byGroup) {
    let v = 0;
    if (endIdx >= 0) {
      for (const id of ids) v += (acbFF.get(id)?.[endIdx] ?? 0) + (cashFF.get(id)?.[endIdx] ?? 0);
    }
    out[group] = v;
  }
  return out;
}

// RESP counts every dollar landing in the account as a contribution for the
// $50,000 lifetime cap and for what was contributed this year — CRA rule,
// not just what Wealthsimple tagged CONTRIB. `deposits` (CONTRIB plus every
// TRANSFER_IN/TRANSFER_OUT, netted) already carries that; `contrib` alone
// undercounts by the deposits that arrived as a plain transfer in. Every
// other group keeps using `contrib`, for the routing-hub reason `taxSummary`
// documents.
function groupField(group: string): "contrib" | "deposits" {
  return group === "RESP" ? "deposits" : "contrib";
}

function sumField(
  ledger: SeriesLedger,
  ids: string[],
  field: "contrib" | "deposits" | "grant",
  yearFilter?: string,
): number {
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  let total = 0;
  for (const row of ledger.series) {
    if (!idSet.has(row.account_id)) continue;
    if (yearFilter !== undefined && !row.month.startsWith(yearFilter)) continue;
    total += row[field];
  }
  return total;
}

function contributedThisYearByGroup(
  ledger: SeriesLedger,
  byGroup: Map<string, string[]>,
  year: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of ROOM_GROUP_ORDER) {
    out[group] = sumField(ledger, byGroup.get(group) ?? [], groupField(group), year);
  }
  return out;
}

// The FHSA account's first-activity year plus 15 (the account must close by
// then). Looked up across the full ledger, not the account scope, because
// the closure date is a fact about the account, not a view of it — filtering
// it out of the current selection shouldn't change when it closes. Empty
// string (an immediate, already-closed year in the engine) if no FHSA
// account exists on the payload at all.
function fhsaCloseYearFrom(ledger: SeriesLedger): string {
  let earliest: string | null = null;
  for (const a of ledger.accounts) {
    if (a.kind !== "FHSA") continue;
    if (earliest === null || a.first_activity < earliest) earliest = a.first_activity;
  }
  return earliest === null ? "" : String(Number(earliest.slice(0, 4)) + 15);
}

function buildRules(raw: Record<string, number>): RegisteredRules {
  const field = (key: string): number => raw[key] ?? 0;
  return {
    fhsaAnnual: field("fhsaAnnual"),
    fhsaLifetime: field("fhsaLifetime"),
    respLifetime: field("respLifetime"),
    respGrantTarget: field("respGrantTarget"),
    respCatchupTarget: field("respCatchupTarget"),
    cesgRate: field("cesgRate"),
    cesgAnnualBasic: field("cesgAnnualBasic"),
    cesgAnnualMax: field("cesgAnnualMax"),
    cesgLifetime: field("cesgLifetime"),
    tfsaRounding: field("tfsaRounding"),
    rrspRounding: field("rrspRounding"),
  };
}

// RRSP room the start year can still use: the CRA-assessed figure from a
// notice of assessment when one exists for the year, else the generic annual
// maximum — either way minus what's already been contributed this year, and
// never negative. Falling back to the bare maximum (ignoring what's already
// used) would double-count room already consumed.
function rrspAssessedRemaining(
  ledger: SeriesLedger,
  year: string,
  contributedThisYear: Record<string, number>,
): number {
  const base = ledger.assessed_room.RRSP?.[year] ?? ledger.limits.RRSP?.[year] ?? 0;
  return Math.max(0, base - (contributedThisYear.RRSP ?? 0));
}

// Builds the thirty-year projection's inputs from the current scope: opening
// balances, room used and available, and lifetime contributions/grants for
// the registered account groups. Pure — see src/client/projection.ts for the
// engine this feeds and docs/superpowers/specs/2026-08-04-registered-
// projection-design.md for the rules this codifies.
export function projectionInputs(
  ledger: SeriesLedger,
  scope: Scope,
  year: string,
  opts: ProjectionOptions,
): ProjectionInputs {
  const byGroup = scopedAccountsByGroup(ledger, scope);
  const respIds = byGroup.get("RESP") ?? [];
  const contributedThisYear = contributedThisYearByGroup(ledger, byGroup, year);
  const rules = buildRules(ledger.registered_rules);

  return {
    startYear: year,
    years: opts.years,
    returnRate: opts.returnRate,
    indexRate: opts.indexRate,
    opening: openingByGroup(ledger, scope, byGroup),
    contributedThisYear,
    lifetimeContributed: {
      FHSA: sumField(ledger, byGroup.get("FHSA") ?? [], "contrib"),
      RESP: sumField(ledger, respIds, "deposits"),
    },
    // Lifetime, not scoped to `year`: how much CESG has ever landed in the
    // account, read off the `grant` field summed from GRANT-type
    // transactions (see the SeriesRow doc comment above).
    cesgReceived: sumField(ledger, respIds, "grant"),
    cesgRoomAccrued: rules.cesgAnnualBasic * (Number(year) - opts.respBeneficiaryBirthYear + 1),
    rrspAssessedRemaining: rrspAssessedRemaining(ledger, year, contributedThisYear),
    fhsaCloseYear: fhsaCloseYearFrom(ledger),
    // Only the groups the selection actually covers. Without this the engine
    // projected all four regardless, so selecting one TFSA still showed RRSP
    // and FHSA contributions — and inflated them, because those groups then
    // looked like they had contributed nothing yet this year.
    groups: ROOM_GROUP_ORDER.filter((g) => (byGroup.get(g) ?? []).length > 0),
    rrspLastYear: opts.rrspLastYear,
    cesgLastYear: String(opts.respBeneficiaryBirthYear + 17),
    roomBase: {
      TFSA: ledger.limits.TFSA?.[year] ?? 0,
      RRSP: ledger.limits.RRSP?.[year] ?? 0,
    },
    rules,
  };
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

// Per-account shares of each registered group's contributions, for the
// per-account projection lines. Derived from the scope year's actual
// contributions, so the split reflects how the owner really funds the
// accounts rather than an invented rule.
//
// Two fallbacks, because a group can legitimately have no contributions in the
// scope year: fall back to each account's share of the group's opening balance,
// and if that is also zero, split evenly. An account with neither
// contributions nor a balance (a routing hub, for instance) gets a zero share
// and is dropped by the caller rather than drawn as a flat zero line.
export function accountAllocations(
  ledger: SeriesLedger,
  scope: Scope,
  year: string,
): AccountAllocation[] {
  const accts = new Set(scope.accts);
  // ACB **plus cash**, matching openingByGroup exactly. costByAccount's `cost`
  // is ACB only, and using it here left the per-account lines summing about
  // $34,000 below the group total after thirty years of compounding.
  const { acbFF, cashFF } = buildFill(ledger);
  const endIdx = scope.ris.length > 0 ? Math.max(...scope.ris) : -1;
  const opening = new Map<string, number>(
    ledger.accounts.map((a) => [
      a.id,
      endIdx >= 0 ? (acbFF.get(a.id)?.[endIdx] ?? 0) + (cashFF.get(a.id)?.[endIdx] ?? 0) : 0,
    ]),
  );
  const contributed = new Map<string, number>();
  for (const row of ledger.series) {
    if (!accts.has(row.account_id) || !row.month.startsWith(year)) continue;
    contributed.set(row.account_id, (contributed.get(row.account_id) ?? 0) + row.contrib);
  }
  const out: AccountAllocation[] = [];
  for (const group of ROOM_GROUP_ORDER) {
    const members = ledger.accounts.filter(
      (a) => accts.has(a.id) && REGISTERED_GROUPS[a.kind] === group,
    );
    if (members.length === 0) continue;
    const byContrib = members.map((a) => contributed.get(a.id) ?? 0);
    const byOpening = members.map((a) => opening.get(a.id) ?? 0);
    const basis = byContrib.some((v) => v > 0) ? byContrib : byOpening;
    const total = basis.reduce((s, v) => s + v, 0);
    members.forEach((a, i) => {
      const share = total > 0 ? (basis[i] ?? 0) / total : 1 / members.length;
      out.push({ accountId: a.id, group, share, opening: opening.get(a.id) ?? 0 });
    });
  }
  return out;
}
