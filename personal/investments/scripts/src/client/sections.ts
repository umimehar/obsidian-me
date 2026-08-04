import {
  capitalVsDepositsChart,
  cashflowChart,
  costBars,
  incomeChart,
  projectionChart,
} from "./charts";
// Populates the four pillar sections (Contributions & Room, Growth, Tax,
// Detail) from the parsed ledger and the active Scope. Pure aggregation
// lives in series.ts; this module is the DOM layer on top of it, plus a
// handful of small pure helpers (totalContributed, totalDeposits,
// totalIncome, estimateTax) that are cheap enough to unit test directly.
import type { Scope } from "./filter";
import { money, monthLabel } from "./format";
import { projectYears } from "./projection";
import type { ProjectionYear } from "./projection";
import {
  capitalTrend,
  cashflowSeries,
  costByAccount,
  flowsForPeriod,
  incomeSeries,
  projectionInputs,
  scopeYear,
  taxSummary,
} from "./series";
import type {
  AccountCost,
  LedgerFlow,
  ProjectionOptions,
  SeriesLedger,
  TaxRoomRow,
  TaxSummary,
  TrendSeries,
} from "./series";

// The parsed ledger this module reads is exactly series.ts's shape — kept as
// a distinct name here for readability at the DOM layer's call sites.
export type SectionsLedger = SeriesLedger;

// ---- pure helpers (unit tested in sections.test.ts) ----------------------

// Sum of `contrib` across the scoped accounts, within the scoped time
// window only (unlike the running-total series used for the trend chart).
export function totalContributed(ledger: SectionsLedger, scope: Scope): number {
  const months = new Set(scope.ris.map((i) => ledger.months[i]).filter((m): m is string => !!m));
  const accts = new Set(scope.accts);
  let total = 0;
  for (const row of ledger.series) {
    if (accts.has(row.account_id) && months.has(row.month)) total += row.contrib;
  }
  return total;
}

// Sum of `deposits` (net money in: CONTRIB + TRANSFER_IN + TRANSFER_OUT)
// across the scoped accounts, within the scoped time window. This is the
// true "money in" figure — see the investments CLAUDE.md — because internal
// transfers between the owner's own accounts cancel out in the total.
export function totalDeposits(ledger: SectionsLedger, scope: Scope): number {
  const months = new Set(scope.ris.map((i) => ledger.months[i]).filter((m): m is string => !!m));
  const accts = new Set(scope.accts);
  let total = 0;
  for (const row of ledger.series) {
    if (accts.has(row.account_id) && months.has(row.month)) total += row.deposits;
  }
  return total;
}

// Sum of `income` across the scoped accounts, within the scoped time window.
export function totalIncome(ledger: SectionsLedger, scope: Scope): number {
  const months = new Set(scope.ris.map((i) => ledger.months[i]).filter((m): m is string => !!m));
  const accts = new Set(scope.accts);
  let total = 0;
  for (const row of ledger.series) {
    if (accts.has(row.account_id) && months.has(row.month)) total += row.income;
  }
  return total;
}

export interface TaxEstimateInputs {
  interest: number;
  eligibleDividends: number;
  foreignIncome: number;
  realizedGains: number;
  rrspContributed: number;
  rate: number;
}

// Rough, non-filing estimate of the tax added by this year's investment
// income: eligible dividends get an approximate 38% gross-up offset by an
// ~85%-of-gross-up combined credit; only half of realized gains is taxable;
// RRSP contributions actually made this year (the current year's room
// "used") are treated as a deduction against the same marginal rate.
// See the on-page disclaimer — this is not a filing figure.
export function estimateTax(inputs: TaxEstimateInputs): number {
  const { interest, eligibleDividends, foreignIncome, realizedGains, rrspContributed, rate } =
    inputs;
  return (
    interest * rate +
    eligibleDividends * 1.38 * rate * 0.85 +
    foreignIncome * rate +
    realizedGains * 0.5 * rate -
    rrspContributed * rate
  );
}

// ---- shared DOM helpers ----------------------------------------------------

function heroCell(
  host: HTMLElement,
  label: string,
  value: string,
  note: string,
  lead = false,
): void {
  const cell = document.createElement("div");
  cell.className = lead ? "hero-cell lead" : "hero-cell";
  const l = document.createElement("div");
  l.className = "hero-cell-label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "hero-cell-value";
  v.textContent = value;
  const n = document.createElement("div");
  n.className = "hero-cell-note";
  n.textContent = note;
  cell.append(l, v, n);
  host.appendChild(cell);
}

function tableEl(headers: string[]): { table: HTMLTableElement; tbody: HTMLTableSectionElement } {
  const table = document.createElement("table");
  table.className = "table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    if (h.startsWith("#")) {
      th.className = "num";
      th.textContent = h.slice(1);
    } else {
      th.textContent = h;
    }
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  const tbody = document.createElement("tbody");
  table.append(thead, tbody);
  return { table, tbody };
}

function canvasOf(id: string): HTMLCanvasElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLCanvasElement ? el : null;
}

// ---- Contributions & Room --------------------------------------------------

function renderContribHeadline(
  ledger: SectionsLedger,
  scope: Scope,
  tax: TaxSummary,
  year: string,
): void {
  const host = document.getElementById("headline");
  if (!host) return;
  host.textContent = "";
  const deposits = totalDeposits(ledger, scope);
  const roomUsed = tax.room.reduce((s, r) => s + r.used, 0);
  heroCell(
    host,
    "Money in",
    money(deposits),
    "All money added to the selected accounts, including transfers, over the selected " +
      "window. Internal transfers between your own accounts cancel out in the total.",
    true,
  );
  heroCell(
    host,
    `${year} room used`,
    money(roomUsed),
    "Across the selected registered accounts (TFSA, FHSA, RRSP, RESP), for the selected " +
      "window's tax year.",
  );
}

function roomBarRow(r: TaxRoomRow, year: string): HTMLDivElement {
  const rawPct = r.limit > 0 ? Math.round((r.used / r.limit) * 100) : 0;
  const fillPct = Math.min(100, rawPct);
  const row = document.createElement("div");
  row.className = "room-row";
  const label = document.createElement("div");
  label.className = "room-k";
  label.textContent = r.assessed ? `${r.group} ${year} · assessed` : `${r.group} ${year}`;
  const track = document.createElement("div");
  track.className = "room-track";
  const fill = document.createElement("div");
  fill.className = "room-fill";
  fill.style.width = `${fillPct}%`;
  track.appendChild(fill);
  const val = document.createElement("div");
  val.className = "room-v";
  val.textContent = `${money(r.used)} / ${money(r.limit)} · ${rawPct}%`;
  row.append(label, track, val);
  return row;
}

function renderRoomBars(room: TaxRoomRow[], year: string): void {
  const host = document.getElementById("room");
  if (!host) return;
  host.textContent = "";
  for (const r of room) {
    if (r.limit === 0 && r.used === 0) continue;
    host.appendChild(roomBarRow(r, year));
  }
  const note = document.createElement("p");
  note.className = "section-note";
  const anyAssessed = room.some((r) => r.assessed && !(r.limit === 0 && r.used === 0));
  note.textContent =
    "Bars compare this year's registered contributions, including external deposits not " +
    "coded as a contribution, for the selected accounts, to this year's limit. " +
    (anyAssessed
      ? "A bar marked assessed uses your CRA room from the notice of assessment, which " +
        "already includes carry-forward. Every other bar uses the generic annual maximum, " +
        "and unused room carries forward from prior years, so a full or over-full bar " +
        "there is not necessarily an over-contribution (for example an RESP catch-up year)."
      : "Unused room carries forward from prior years, so a full or over-full bar is not " +
        "necessarily an over-contribution (for example an RESP catch-up year).");
  host.appendChild(note);
}

function accountLabel(ledger: SectionsLedger, accountId: string): string {
  const a = ledger.accounts.find((acct) => acct.id === accountId);
  return a ? `${a.kind} ${a.short_id}` : accountId;
}

function flowRow(ledger: SectionsLedger, f: LedgerFlow): HTMLTableRowElement {
  const tr = document.createElement("tr");
  for (const v of [f.date, accountLabel(ledger, f.account_id), f.type]) {
    const td = document.createElement("td");
    td.textContent = v;
    tr.appendChild(td);
  }
  const amountTd = document.createElement("td");
  amountTd.className = "num";
  amountTd.textContent = money(f.amount);
  const descTd = document.createElement("td");
  descTd.textContent = f.description;
  tr.append(amountTd, descTd);
  return tr;
}

function flowTable(ledger: SectionsLedger, title: string, flows: LedgerFlow[]): HTMLElement {
  const wrap = document.createElement("div");
  const heading = document.createElement("h4");
  heading.textContent = `${title} (${flows.length})`;
  wrap.appendChild(heading);
  const { table, tbody } = tableEl(["Date", "Account", "Type", "#Amount", "Description"]);
  for (const f of flows) tbody.appendChild(flowRow(ledger, f));
  wrap.appendChild(table);
  return wrap;
}

// A clicked cashflow bar's label is either a full month ("YYYY-MM", in
// month grain) or a bare year ("YYYY", in year grain) — see flowsForPeriod.
// Months contain a dash; years don't, so that's enough to tell them apart
// and format the drill-down heading naturally for either.
function periodLabel(period: string): string {
  return period.includes("-") ? monthLabel(period) : period;
}

export interface SectionOptions {
  // A drill-down period to reopen on render, from the URL. Ignored when the
  // current scope no longer contains it.
  period?: string | null;
  // Fires when the expanded drill-down period changes, so the caller can put
  // it in the URL. null means nothing is expanded.
  onDrilldown?: (period: string | null) => void;
}

// Populates and opens the cashflow drill-down for a clicked chart bar. Reset
// by resetCashflowDrilldown() on every filter change, since a stale
// selection would otherwise survive a rerender.
function renderCashflowDrilldown(ledger: SectionsLedger, scope: Scope, period: string): void {
  const details = document.getElementById("cashflow-drill");
  const body = document.getElementById("cashflow-drill-body");
  if (!(details instanceof HTMLDetailsElement) || !body) return;
  body.textContent = "";
  const { inflow, outflow } = flowsForPeriod(ledger, scope, period);
  const heading = document.createElement("h3");
  heading.textContent = `${periodLabel(period)} — money in / out`;
  body.append(heading, flowTable(ledger, "Inflow", inflow), flowTable(ledger, "Outflow", outflow));
  details.open = true;
}

export function resetCashflowDrilldown(): void {
  const details = document.getElementById("cashflow-drill");
  const body = document.getElementById("cashflow-drill-body");
  if (body) body.textContent = "";
  if (details instanceof HTMLDetailsElement) details.open = false;
}

function drawCashflowChart(ledger: SectionsLedger, scope: Scope, opts: SectionOptions): void {
  const canvas = canvasOf("chart-cashflow");
  if (!canvas) return;
  const series = cashflowSeries(ledger, scope);
  cashflowChart(canvas, series, (period) => {
    renderCashflowDrilldown(ledger, scope, period);
    opts.onDrilldown?.(period);
  });
  // Restore a drill-down carried in the URL, but only when the period still
  // exists under the current scope. A stale one is dropped rather than opening
  // an empty panel.
  const restore = opts.period;
  if (restore && series.labels.includes(restore)) {
    renderCashflowDrilldown(ledger, scope, restore);
  } else if (restore) {
    opts.onDrilldown?.(null);
  }
}

// ---- Growth -----------------------------------------------------------------

// Money in and portfolio at cost, both as-of the end of the selected window
// (last point of the capital/deposits trend, which is cumulative to-date).
// See capitalTrend in series.ts for why deposits — not the CONTRIB-coded
// `contrib` field — is the true measure of external money in.
function growthTotals(trend: TrendSeries): { netDeposits: number; capital: number } {
  const netDeposits = trend.deposits.at(-1) ?? 0;
  const capital = trend.capital.at(-1) ?? 0;
  return { netDeposits, capital };
}

function renderGrowthSummary(ledger: SectionsLedger, scope: Scope, trend: TrendSeries): void {
  const host = document.getElementById("growth-summary");
  if (!host) return;
  host.textContent = "";
  const { netDeposits, capital } = growthTotals(trend);
  heroCell(
    host,
    "Net deposits",
    money(netDeposits),
    "All money added, including transfers, not just coded contributions.",
    true,
  );
  heroCell(
    host,
    "Portfolio at cost",
    money(capital),
    "Adjusted cost base plus cash of the selected accounts at the end of the selected window.",
  );
  heroCell(
    host,
    "Gain beyond deposits",
    money(capital - netDeposits),
    "Cost basis above what you put in (reinvested income and securities transferred in). " +
      "Not a market-value figure.",
  );
  heroCell(
    host,
    "Income received",
    money(totalIncome(ledger, scope)),
    "Dividends and interest received across the selected accounts and time window.",
  );
}

function drawGrowthCharts(trend: TrendSeries, rows: AccountCost[]): void {
  const costCanvas = canvasOf("chart-growth");
  if (costCanvas) costBars(costCanvas, rows);
  const trendCanvas = canvasOf("chart-trend");
  if (trendCanvas) capitalVsDepositsChart(trendCanvas, trend);
}

// ---- Tax ------------------------------------------------------------------

function renderTaxTitle(year: string): void {
  const title = document.getElementById("tax-section-title");
  if (title) title.textContent = `Tax — ${year}`;
}

function renderTaxCards(tax: TaxSummary): void {
  const host = document.getElementById("tax-cards");
  if (!host) return;
  host.textContent = "";
  heroCell(host, "Interest", money(tax.interest), "Taxable interest received this year.", true);
  heroCell(
    host,
    "Eligible dividends",
    money(tax.eligible_dividends),
    "Canadian eligible dividends received this year.",
  );
  heroCell(
    host,
    "Foreign income",
    money(tax.foreign_income),
    "Foreign dividends and other foreign income received this year.",
  );
  heroCell(
    host,
    "Realized gains",
    money(tax.realized_gains),
    "Net realized capital gains (or losses) this year.",
  );
}

function rrspUsed(tax: TaxSummary): number {
  return tax.room.find((r) => r.group === "RRSP")?.used ?? 0;
}

function updateTaxEstimate(tax: TaxSummary): void {
  const rateInput = document.getElementById("tax-rate");
  const out = document.getElementById("tax-estimate");
  if (!(rateInput instanceof HTMLInputElement) || !out) return;
  const rate = Number(rateInput.value);
  const estimate = estimateTax({
    interest: tax.interest,
    eligibleDividends: tax.eligible_dividends,
    foreignIncome: tax.foreign_income,
    realizedGains: tax.realized_gains,
    rrspContributed: rrspUsed(tax),
    rate: Number.isFinite(rate) ? rate : 0,
  });
  out.textContent = money(estimate);
}

// The scope's tax summary is filter-aware, so the tax-rate input can't just
// close over the (static) ledger the way it used to. renderSections() stashes
// the latest summary here on every rerender; the input listener (wired once
// by main.ts) reads it back so a rate edit only recomputes the estimate
// figure, never a full section/chart rerender.
let currentTax: TaxSummary | null = null;

function setCurrentTax(tax: TaxSummary): void {
  currentTax = tax;
}

export function wireTaxRateInput(): void {
  const rateInput = document.getElementById("tax-rate");
  if (!(rateInput instanceof HTMLInputElement)) return;
  rateInput.addEventListener("input", () => {
    if (currentTax) updateTaxEstimate(currentTax);
  });
}

function drawIncomeChart(ledger: SectionsLedger, scope: Scope): void {
  const canvas = canvasOf("chart-income");
  if (canvas) incomeChart(canvas, incomeSeries(ledger, scope));
}

// ---- Detail: accounts + holdings tables --------------------------------------

interface AcctRow {
  kind: string;
  short_id: string;
  contrib: number;
  deposits: number;
  income: number;
  cost: number;
  cash: number;
}

function lastCash(ledger: SectionsLedger, accountId: string, months: Set<string>): number {
  let latestMonth = "";
  let value = 0;
  for (const row of ledger.series) {
    if (row.account_id !== accountId || row.cash == null || !months.has(row.month)) continue;
    if (row.month > latestMonth) {
      latestMonth = row.month;
      value = row.cash;
    }
  }
  return value;
}

function buildAcctRows(ledger: SectionsLedger, scope: Scope): AcctRow[] {
  const acctSet = new Set(scope.accts);
  const months = new Set(scope.ris.map((i) => ledger.months[i]).filter((m): m is string => !!m));
  const flows = new Map<string, { contrib: number; deposits: number; income: number }>();
  for (const row of ledger.series) {
    if (!acctSet.has(row.account_id) || !months.has(row.month)) continue;
    const t = flows.get(row.account_id) ?? { contrib: 0, deposits: 0, income: 0 };
    t.contrib += row.contrib;
    t.deposits += row.deposits;
    t.income += row.income;
    flows.set(row.account_id, t);
  }
  const costs = new Map(costByAccount(ledger, scope).map((c) => [c.account_id, c]));
  const rows: AcctRow[] = [];
  for (const a of ledger.accounts) {
    if (!acctSet.has(a.id)) continue;
    const f = flows.get(a.id) ?? { contrib: 0, deposits: 0, income: 0 };
    rows.push({
      kind: a.kind,
      short_id: a.short_id,
      contrib: f.contrib,
      deposits: f.deposits,
      income: f.income,
      cost: costs.get(a.id)?.cost ?? 0,
      cash: lastCash(ledger, a.id, months),
    });
  }
  return rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.short_id.localeCompare(b.short_id));
}

function acctNameCell(r: AcctRow): HTMLTableCellElement {
  const td = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = r.kind;
  const idSpan = document.createElement("span");
  idSpan.className = "chip-id";
  idSpan.textContent = r.short_id;
  td.append(badge, " ", idSpan);
  return td;
}

function renderAcctTable(ledger: SectionsLedger, scope: Scope): void {
  const host = document.getElementById("acct-table");
  if (!host) return;
  host.textContent = "";
  const { table, tbody } = tableEl([
    "Account",
    "#Contributed",
    "#Net deposits",
    "#At cost",
    "#Cash",
    "#Income",
  ]);
  for (const r of buildAcctRows(ledger, scope)) {
    const tr = document.createElement("tr");
    tr.appendChild(acctNameCell(r));
    for (const v of [r.contrib, r.deposits, r.cost, r.cash]) {
      const td = document.createElement("td");
      td.className = "num";
      td.textContent = money(v);
      tr.appendChild(td);
    }
    const incomeTd = document.createElement("td");
    incomeTd.className = "num pos";
    incomeTd.textContent = money(r.income);
    tr.appendChild(incomeTd);
    tbody.appendChild(tr);
  }
  host.appendChild(table);
}

interface HoldingRow {
  symbol: string;
  kind: string;
  qty: number;
  acb: number;
}

interface HoldingsData {
  rows: HoldingRow[];
  diCount: number;
  diCost: number;
}

function buildHoldingRows(ledger: SectionsLedger, scope: Scope): HoldingsData {
  const acctSet = new Set(scope.accts);
  const kindById = new Map(ledger.accounts.map((a) => [a.id, a.kind]));
  let diCost = 0;
  let diCount = 0;
  const rest: HoldingRow[] = [];
  for (const h of ledger.holdings) {
    if (!acctSet.has(h.account_id)) continue;
    const kind = kindById.get(h.account_id) ?? "";
    if (kind === "DirectIndexing") {
      diCost += h.acb;
      diCount += 1;
    } else {
      rest.push({ symbol: h.symbol, kind, qty: h.qty, acb: h.acb });
    }
  }
  rest.sort((a, b) => b.acb - a.acb);
  return { rows: rest, diCount, diCost };
}

function holdingRowEl(
  symbol: string,
  kind: string,
  qty: string,
  acb: number,
  weight: number,
): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const symTd = document.createElement("td");
  const strong = document.createElement("strong");
  strong.textContent = symbol;
  symTd.appendChild(strong);
  const kindTd = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = kind;
  kindTd.appendChild(badge);
  const qtyTd = document.createElement("td");
  qtyTd.className = "num";
  qtyTd.textContent = qty;
  const costTd = document.createElement("td");
  costTd.className = "num";
  costTd.textContent = money(acb);
  const wTd = document.createElement("td");
  wTd.className = "num";
  wTd.textContent = `${Math.round(weight * 100)}%`;
  tr.append(symTd, kindTd, qtyTd, costTd, wTd);
  return tr;
}

function renderHoldTable(ledger: SectionsLedger, scope: Scope): void {
  const host = document.getElementById("hold-table");
  if (!host) return;
  host.textContent = "";
  const { rows, diCount, diCost } = buildHoldingRows(ledger, scope);
  const total = diCost + rows.reduce((s, r) => s + r.acb, 0) || 1;
  const { table, tbody } = tableEl(["Security", "Account", "#Shares", "#At cost", "#Weight"]);
  if (diCost > 0) {
    tbody.appendChild(
      holdingRowEl(
        `Direct Indexing (${diCount} holdings)`,
        "DirectIndexing",
        "—",
        diCost,
        diCost / total,
      ),
    );
  }
  for (const h of rows.slice(0, 40)) {
    const qty = String(Math.round(h.qty * 1e4) / 1e4);
    tbody.appendChild(holdingRowEl(h.symbol, h.kind, qty, h.acb, h.acb / total));
  }
  host.appendChild(table);
}

// ---- Thirty Year Projection ------------------------------------------------

// Owner-supplied projection constants. Neither is derivable from the ledger
// payload — see analytics.ts's RESP_BENEFICIARY_BIRTH_YEAR (a fact about a
// person, not a statement) and the plan's RRSP-last-contribution-year
// decision (the owner turns 71, and loses RRSP room, in 2068). Duplicated
// here rather than imported, because src/client/ never imports values from
// analytics.ts (see this project's CLAUDE.md).
const PROJECTION_YEARS = 30;
const RRSP_LAST_CONTRIBUTION_YEAR = "2068";
const RESP_BENEFICIARY_BIRTH_YEAR = 2025;

// Registered account kinds, mirroring the private REGISTERED_GROUPS keys in
// series.ts (not exported there). Used only to detect a partial registered
// selection for the projection's per-person-room warning.
const REGISTERED_KINDS = new Set(["TFSA", "ManagedTFSA", "FHSA", "RRSP", "RESP"]);

// Pure: clamps a rate reading to [min, max], falling back to the last known
// good value on anything non-numeric or out of range, rather than letting a
// bad input reach the engine as NaN. Exported for the boundary tests — the
// DOM-reading wrapper below is what production code actually calls.
export function clampProjectionRate(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

// Reads the input, and writes the accepted rate back into the field. The
// write-back matters: on a rejected entry (out of range, or not a number) the
// projection falls back to the last good rate, and without this the field
// would keep displaying the rejected text while the chart showed a different
// rate. A number on screen that is not the number in use is a bug, so the
// field is corrected rather than left as typed.
function clampPercentInput(inputId: string, min: number, max: number, fallback: number): number {
  const el = document.getElementById(inputId);
  if (!(el instanceof HTMLInputElement)) return fallback;
  // An empty field must NOT read as zero. A type=number input blanks itself on
  // non-numeric text, and Number("") is 0 — which is a legal rate here, so
  // typing "abc" would silently become a 0% return instead of falling back.
  const raw = el.value.trim();
  const accepted = raw === "" ? fallback : clampProjectionRate(Number(raw), min, max, fallback);
  // Correct a rejected entry, but never mid-typing: rewriting on every
  // keystroke would fight the user (e.g. "1" on the way to "12"). The change
  // event fires on commit, when the field is no longer focused.
  if (Number(raw) !== accepted && el !== document.activeElement) el.value = String(accepted);
  return accepted;
}

export interface ProjectionSummaryFigures {
  contributed: number;
  grants: number;
  endingValue: number;
  endingValueToday: number;
}

// Pure: the headline figures plus the same-year deflation to today's money
// at the given indexation rate. Exported so the rate-recompute path (a
// changed rate produces a changed summary, without touching the DOM) is
// unit testable.
export function projectionSummaryFigures(
  rows: ProjectionYear[],
  indexRate: number,
): ProjectionSummaryFigures {
  const last = rows.at(-1);
  const years = rows.length - 1;
  const endingValue = last?.value ?? 0;
  return {
    contributed: last?.cumulativeIn ?? 0,
    grants: last?.cumulativeGrant ?? 0,
    endingValue,
    endingValueToday: endingValue / (1 + indexRate) ** years,
  };
}

function projectionNoteText(row: ProjectionYear): string {
  return row.notes
    .map((n) => (n === "FHSA closed, withdrawn for home" ? `${n} (${money(row.withdrawn)})` : n))
    .join("; ");
}

// `Record<string, number>` fields read with noUncheckedIndexedAccess come
// back possibly-undefined even for the group keys projection.ts always
// populates (TFSA/FHSA/RRSP/RESP) — this sums them defensively rather than
// asserting the type away.
function sumGroups(record: Record<string, number>): number {
  return Object.values(record).reduce((s, v) => s + (v ?? 0), 0);
}

function projectionRow(row: ProjectionYear): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const yearTd = document.createElement("td");
  yearTd.textContent = row.year;
  tr.appendChild(yearTd);
  const roomRemaining = sumGroups(row.roomRemaining);
  const amounts = [
    row.contributions.TFSA,
    row.contributions.FHSA,
    row.contributions.RRSP,
    row.contributions.RESP,
    row.grant,
    row.cumulativeIn,
    row.cumulativeGrant,
    roomRemaining,
    row.value,
  ];
  for (const v of amounts) {
    const td = document.createElement("td");
    td.className = "num";
    td.textContent = money(v ?? 0);
    tr.appendChild(td);
  }
  const noteTd = document.createElement("td");
  noteTd.textContent = projectionNoteText(row);
  tr.appendChild(noteTd);
  return tr;
}

function renderProjectionTable(rows: ProjectionYear[]): void {
  const host = document.getElementById("proj-table");
  if (!host) return;
  host.textContent = "";
  const { table, tbody } = tableEl([
    "Year",
    "#TFSA",
    "#FHSA",
    "#RRSP",
    "#RESP",
    "#CESG grant",
    "#Cumulative in",
    "#Cumulative grant",
    "#Room remaining",
    "#Value",
    "Notes",
  ]);
  for (const row of rows) tbody.appendChild(projectionRow(row));
  host.appendChild(table);
}

function renderProjectionSummary(rows: ProjectionYear[], indexRate: number): void {
  const host = document.getElementById("proj-summary");
  if (!host) return;
  host.textContent = "";
  const figures = projectionSummaryFigures(rows, indexRate);
  const years = rows.length - 1;
  heroCell(
    host,
    "Total contributed",
    money(figures.contributed),
    "Your own money across the projection, TFSA/FHSA/RRSP/RESP combined.",
    true,
  );
  heroCell(
    host,
    "Total grants",
    money(figures.grants),
    "Government CESG received on the RESP over the projection.",
  );
  heroCell(host, "Ending value", money(figures.endingValue), `Nominal value after ${years} years.`);
  heroCell(
    host,
    "Ending value, today's money",
    money(figures.endingValueToday),
    `Deflated at the ${(indexRate * 100).toFixed(1)}% indexation rate — the return is nominal.`,
  );
}

function drawProjectionChart(rows: ProjectionYear[], opening: number): void {
  const canvas = canvasOf("chart-projection");
  if (canvas) projectionChart(canvas, rows, opening);
}

// The eight statements the spec requires the page to say, every render —
// see docs/superpowers/specs/2026-08-04-registered-projection-design.md,
// "What the page must say". Two are parameterised by this render's actual
// inputs and outputs rather than the spec's own worked example numbers.
function projectionCaveats(
  fhsaCloseYear: string,
  indexRate: number,
  figures: ProjectionSummaryFigures,
): string[] {
  return [
    "The opening balance is cost basis, not market value, so every projected value is " +
      "understated.",
    "RRSP room assumes the CRA annual maximum, which needs earned income near $188,000.",
    "FHSA contributions stop at the lifetime cap; the account closes in " +
      `${fhsaCloseYear} with its balance withdrawn for a home.`,
    "The return is nominal, not adjusted for inflation. At a " +
      `${(indexRate * 100).toFixed(1)}% indexation rate, the ending value is about ` +
      `${money(figures.endingValueToday)} in today's money, not ${money(figures.endingValue)}.`,
    "RESP withdrawal for school is not modelled, so late years overstate.",
    "Indexed limits are seeded from published figures, so they may lag the real ones by " +
      "about a year.",
    "When the account selection is partial, room figures are not meaningful, because room " +
      "is assessed per person.",
    "Thirty years of compounding is a scenario, not a forecast. Small changes to the " +
      "return input swing the result by millions.",
  ];
}

function renderProjectionCaveats(items: string[]): void {
  const host = document.getElementById("proj-caveats");
  if (!host) return;
  host.textContent = "";
  const list = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "section-note";
    li.textContent = item;
    list.appendChild(li);
  }
  host.appendChild(list);
}

// True only when SOME but not all of the ledger's registered accounts are
// in scope — a full or empty selection needs no warning, since room is
// meaningful for "all of them" and moot for "none of them".
function partialRegisteredSelection(ledger: SectionsLedger, scope: Scope): boolean {
  const registeredIds = ledger.accounts
    .filter((a) => REGISTERED_KINDS.has(a.kind))
    .map((a) => a.id);
  if (registeredIds.length === 0) return false;
  const selected = new Set(scope.accts);
  const selectedCount = registeredIds.filter((id) => selected.has(id)).length;
  return selectedCount > 0 && selectedCount < registeredIds.length;
}

function renderProjectionWarning(ledger: SectionsLedger, scope: Scope): void {
  const host = document.getElementById("proj-warning");
  if (!host) return;
  host.textContent = "";
  if (!partialRegisteredSelection(ledger, scope)) return;
  const p = document.createElement("p");
  p.className = "pillar-disclaimer";
  p.textContent =
    "Only some registered accounts are selected. Contribution room is assessed per " +
    "person, not per account, so the room and cap figures below are not meaningful for " +
    "a subset — switch to all accounts to read them.";
  host.appendChild(p);
}

function drawProjection(
  ledger: SectionsLedger,
  scope: Scope,
  year: string,
  returnRate: number,
  indexRate: number,
): void {
  const opts: ProjectionOptions = {
    returnRate,
    indexRate,
    years: PROJECTION_YEARS,
    rrspLastYear: RRSP_LAST_CONTRIBUTION_YEAR,
    respBeneficiaryBirthYear: RESP_BENEFICIARY_BIRTH_YEAR,
  };
  const inputs = projectionInputs(ledger, scope, year, opts);
  const rows = projectYears(inputs);
  const opening = Object.values(inputs.opening).reduce((s, v) => s + v, 0);

  renderProjectionTable(rows);
  renderProjectionSummary(rows, indexRate);
  drawProjectionChart(rows, opening);
  renderProjectionCaveats(
    projectionCaveats(inputs.fhsaCloseYear, indexRate, projectionSummaryFigures(rows, indexRate)),
  );
  renderProjectionWarning(ledger, scope);
}

// Mirrors currentTax below: renderProjectionSection() stashes the last
// scope/ledger/year here on every full rerender, so the rate-input listener
// (wired once by main.ts) can recompute just the projection — never a full
// section or chart rerender — from the last-rendered inputs.
interface ProjectionState {
  ledger: SectionsLedger;
  scope: Scope;
  year: string;
}
let currentProjection: ProjectionState | null = null;
let lastGoodReturnPct = 8;
let lastGoodIndexPct = 2;

function recomputeProjection(): void {
  if (!currentProjection) return;
  const returnPct = clampPercentInput("proj-return", 0, 20, lastGoodReturnPct);
  const indexPct = clampPercentInput("proj-index", 0, 10, lastGoodIndexPct);
  lastGoodReturnPct = returnPct;
  lastGoodIndexPct = indexPct;
  const { ledger, scope, year } = currentProjection;
  drawProjection(ledger, scope, year, returnPct / 100, indexPct / 100);
}

export function wireProjectionRateInputs(): void {
  for (const id of ["proj-return", "proj-index"]) {
    const el = document.getElementById(id);
    if (!(el instanceof HTMLInputElement)) continue;
    // `input` recomputes live as you type; `change` fires on commit (blur or
    // Enter), which is when a rejected entry gets corrected back to the rate
    // actually in use. See clampPercentInput.
    el.addEventListener("input", recomputeProjection);
    el.addEventListener("change", recomputeProjection);
  }
}

function renderProjectionSection(ledger: SectionsLedger, scope: Scope, year: string): void {
  currentProjection = { ledger, scope, year };
  const returnPct = clampPercentInput("proj-return", 0, 20, lastGoodReturnPct);
  const indexPct = clampPercentInput("proj-index", 0, 10, lastGoodIndexPct);
  lastGoodReturnPct = returnPct;
  lastGoodIndexPct = indexPct;
  drawProjection(ledger, scope, year, returnPct / 100, indexPct / 100);
}

// ---- entry point --------------------------------------------------------------

export function renderSections(
  ledger: SectionsLedger,
  scope: Scope,
  opts: SectionOptions = {},
): void {
  const year = scopeYear(ledger, scope);
  const tax = taxSummary(ledger, scope, year);

  renderContribHeadline(ledger, scope, tax, year);
  renderRoomBars(tax.room, year);
  resetCashflowDrilldown();
  drawCashflowChart(ledger, scope, opts);

  const costRows = costByAccount(ledger, scope);
  const trend = capitalTrend(ledger, scope);
  renderGrowthSummary(ledger, scope, trend);
  drawGrowthCharts(trend, costRows);

  renderTaxTitle(year);
  renderTaxCards(tax);
  setCurrentTax(tax);
  updateTaxEstimate(tax);
  drawIncomeChart(ledger, scope);

  renderProjectionSection(ledger, scope, year);

  renderAcctTable(ledger, scope);
  renderHoldTable(ledger, scope);
}
