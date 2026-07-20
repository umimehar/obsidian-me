import { capitalVsDepositsChart, cashflowChart, costBars, incomeChart } from "./charts";
// Populates the four pillar sections (Contributions & Room, Growth, Tax this
// year, Detail) from the parsed ledger and the active Scope. Pure
// aggregation lives in series.ts; this module is the DOM layer on top of it,
// plus a couple of small pure helpers (totalContributed, totalIncome,
// estimateTax) that are cheap enough to unit test directly.
import type { Scope } from "./filter";
import { money } from "./format";
import { capitalTrend, cashflowSeries, costByAccount, incomeSeries } from "./series";
import type { AccountCost, SeriesLedger, TrendSeries } from "./series";

export interface TaxRoomRow {
  group: string;
  used: number;
  limit: number;
  remaining: number;
  over: boolean;
}

export interface TaxYearData {
  year: string;
  room: TaxRoomRow[];
  rrsp_deduction_available: number;
  income: { interest: number; eligible_dividends: number; foreign_income: number };
  realized_gains: number;
}

export interface SectionsTax {
  current_year: string;
  years: TaxYearData[];
}

// The subset of the parsed ledger this module reads: series.ts's shape plus
// the tax block. Kept local so this module never pulls in node-only code.
export interface SectionsLedger extends SeriesLedger {
  tax: SectionsTax;
}

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

function currentTaxYear(tax: SectionsTax): TaxYearData | undefined {
  return tax.years.find((y) => y.year === tax.current_year);
}

function renderContribHeadline(ledger: SectionsLedger, scope: Scope): void {
  const host = document.getElementById("headline");
  if (!host) return;
  host.textContent = "";
  const contributed = totalContributed(ledger, scope);
  const year = currentTaxYear(ledger.tax);
  const roomUsed = (year?.room ?? []).reduce((s, r) => s + r.used, 0);
  heroCell(
    host,
    "Registered contributions",
    money(contributed),
    "Contributions coded to registered accounts, used for contribution room. See Growth " +
      "for total money in.",
    true,
  );
  heroCell(
    host,
    `${ledger.tax.current_year} room used`,
    money(roomUsed),
    "Across all registered accounts (TFSA, FHSA, RRSP, RESP) — not scoped by the filter above.",
  );
}

function renderRoomBars(tax: SectionsTax): void {
  const host = document.getElementById("room");
  if (!host) return;
  host.textContent = "";
  const year = currentTaxYear(tax);
  if (!year) return;
  for (const r of year.room) {
    if (r.limit === 0 && r.used === 0) continue;
    const pct = r.limit > 0 ? Math.min(100, Math.round((r.used / r.limit) * 100)) : 0;
    const row = document.createElement("div");
    row.className = r.over ? "room-row pillar-over" : "room-row";
    const label = document.createElement("div");
    label.className = "room-k";
    label.textContent = `${r.group} ${year.year}`;
    const track = document.createElement("div");
    track.className = "room-track";
    const fill = document.createElement("div");
    fill.className = "room-fill";
    fill.style.width = `${pct}%`;
    track.appendChild(fill);
    const val = document.createElement("div");
    val.className = "room-v";
    val.textContent = `${money(r.used)} / ${money(r.limit)} · ${pct}%`;
    if (r.over) {
      const warn = document.createElement("span");
      warn.className = "pillar-warn";
      warn.textContent = "OVER";
      val.appendChild(warn);
    }
    row.append(label, track, val);
    host.appendChild(row);
  }
}

function drawCashflowChart(ledger: SectionsLedger, scope: Scope): void {
  const canvas = canvasOf("chart-cashflow");
  if (canvas) cashflowChart(canvas, cashflowSeries(ledger, scope));
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

// ---- Tax this year ------------------------------------------------------------

function renderTaxCards(tax: SectionsTax): void {
  const host = document.getElementById("tax-cards");
  if (!host) return;
  host.textContent = "";
  const year = currentTaxYear(tax);
  if (!year) return;
  heroCell(
    host,
    "Interest",
    money(year.income.interest),
    "Taxable interest received this year.",
    true,
  );
  heroCell(
    host,
    "Eligible dividends",
    money(year.income.eligible_dividends),
    "Canadian eligible dividends received this year.",
  );
  heroCell(
    host,
    "Foreign income",
    money(year.income.foreign_income),
    "Foreign dividends and other foreign income received this year.",
  );
  heroCell(
    host,
    "Realized gains",
    money(year.realized_gains),
    "Net realized capital gains (or losses) this year.",
  );
  heroCell(
    host,
    "RRSP deduction available",
    money(year.rrsp_deduction_available),
    "Unused RRSP room usable as a deduction.",
  );
}

function rrspContributed(year: TaxYearData): number {
  return year.room.find((r) => r.group === "RRSP")?.used ?? 0;
}

function updateTaxEstimate(tax: SectionsTax): void {
  const rateInput = document.getElementById("tax-rate");
  const out = document.getElementById("tax-estimate");
  if (!(rateInput instanceof HTMLInputElement) || !out) return;
  const year = currentTaxYear(tax);
  if (!year) {
    out.textContent = money(0);
    return;
  }
  const rate = Number(rateInput.value);
  const estimate = estimateTax({
    interest: year.income.interest,
    eligibleDividends: year.income.eligible_dividends,
    foreignIncome: year.income.foreign_income,
    realizedGains: year.realized_gains,
    rrspContributed: rrspContributed(year),
    rate: Number.isFinite(rate) ? rate : 0,
  });
  out.textContent = money(estimate);
}

// Wired once by main.ts (not on every rerender) so the tax-rate input only
// ever gets one listener; it recomputes just the estimate figure, no rerender.
export function wireTaxRateInput(ledger: SectionsLedger): void {
  const rateInput = document.getElementById("tax-rate");
  if (!(rateInput instanceof HTMLInputElement)) return;
  rateInput.addEventListener("input", () => updateTaxEstimate(ledger.tax));
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

// ---- entry point --------------------------------------------------------------

export function renderSections(ledger: SectionsLedger, scope: Scope): void {
  renderContribHeadline(ledger, scope);
  renderRoomBars(ledger.tax);
  drawCashflowChart(ledger, scope);

  const costRows = costByAccount(ledger, scope);
  const trend = capitalTrend(ledger, scope);
  renderGrowthSummary(ledger, scope, trend);
  drawGrowthCharts(trend, costRows);

  renderTaxCards(ledger.tax);
  updateTaxEstimate(ledger.tax);
  drawIncomeChart(ledger, scope);

  renderAcctTable(ledger, scope);
  renderHoldTable(ledger, scope);
}
