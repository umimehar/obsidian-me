// Progressive scope filter: grouped accounts + a time window, driving every
// section on the page from one place. The account/time-resolution logic is
// ported from the old ledger.js (resolveMonths/grainOf/pkey), simplified to
// drop the year-chips mode since the calendar range picker now covers custom
// windows. DOM/flatpickr wiring lives alongside the pure helpers so the whole
// popover interaction stays in one file.
import flatpickr from "flatpickr";

export interface FilterAccount {
  id: string;
  kind: string;
  name: string;
  short_id: string;
  currency: string;
}

// The fields the client reads off the embedded ledger payload. Kept local
// (not imported from analytics.ts) so this module never pulls in node-only
// code when bundled for the browser.
export interface FilterLedger {
  accounts: FilterAccount[];
  months: string[];
}

export interface Scope {
  ris: number[];
  accts: string[];
}

export interface Filter {
  resolveMonths(): number[];
  selected(): string[];
  scopeLabel(): string;
}

export type Grain = "month" | "year";

export function grainOf(ris: number[]): Grain {
  return ris.length > 24 ? "year" : "month";
}

export function pkey(month: string, grain: Grain): string {
  return grain === "year" ? month.slice(0, 4) : month;
}

export type TimePreset = "all" | "ytd" | "1y" | "3y";

export interface TimeState {
  mode: "preset" | "custom";
  preset: TimePreset;
  from: string;
  to: string;
}

export const ALL_TIME: TimeState = { mode: "preset", preset: "all", from: "", to: "" };

// Resolve whichever time control is active into ascending indices into
// `months`. Every section on the page derives from this list, so all of them
// filter together with no per-section wiring.
export function resolveWindow(time: TimeState, months: string[]): number[] {
  const all = months.map((_, i) => i);
  if (time.mode === "custom" && time.from && time.to) {
    return all.filter((i) => {
      const m = months[i] ?? "";
      return m >= time.from && m <= time.to;
    });
  }
  const lastMonth = months[months.length - 1];
  if (time.preset === "ytd" && lastMonth) {
    const year = lastMonth.slice(0, 4);
    return all.filter((i) => (months[i] ?? "").startsWith(year));
  }
  if (time.preset === "1y" || time.preset === "3y") {
    const span = time.preset === "1y" ? 12 : 36;
    return all.slice(Math.max(0, months.length - span));
  }
  return all;
}

export interface FilterState {
  accts: string[] | null;
  time: TimeState;
}

// Account selection and the time window are orthogonal: changing which accounts
// are selected must never alter the active time window. Only the time controls
// are mutually exclusive with each other (see setPreset/setCustomRange). This
// pure transition proves that invariant — the time field is carried through
// untouched — and is what createFilter uses on every account toggle.
export function applyAccountSelection(state: FilterState, accts: string[] | null): FilterState {
  return { accts, time: state.time };
}

const REGISTERED_KINDS = new Set(["TFSA", "ManagedTFSA", "FHSA", "RRSP", "RESP"]);
const TAXABLE_KINDS = new Set(["NonRegistered", "DirectIndexing", "Crypto", "PE", "Other"]);

export interface AccountGroups {
  Registered: FilterAccount[];
  Taxable: FilterAccount[];
  Cash: FilterAccount[];
}

export const GROUP_ORDER: Array<keyof AccountGroups> = ["Registered", "Taxable", "Cash"];

// Buckets by kind. Anything outside the Registered/Taxable kind lists (e.g. a
// "USD" cash sub-account) lands in Cash, since it behaves like one.
export function groupAccounts(accounts: FilterAccount[]): AccountGroups {
  const groups: AccountGroups = { Registered: [], Taxable: [], Cash: [] };
  for (const a of accounts) {
    if (REGISTERED_KINDS.has(a.kind)) groups.Registered.push(a);
    else if (TAXABLE_KINDS.has(a.kind)) groups.Taxable.push(a);
    else groups.Cash.push(a);
  }
  return groups;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTH_NAMES[index] ?? month} ${month.slice(0, 4)}`;
}

function timeLabel(time: TimeState, months: string[]): string {
  if (time.mode === "custom" && time.from && time.to) {
    return `${monthLabel(time.from)} – ${monthLabel(time.to)}`;
  }
  if (time.preset === "ytd") return "Year to date";
  if (time.preset === "1y") return "Last 12 months";
  if (time.preset === "3y") return "Last 36 months";
  return "All time";
}

export function formatScope(
  selectedCount: number,
  totalCount: number,
  time: TimeState,
  months: string[],
): string {
  const acctsLabel =
    selectedCount === 0 || selectedCount === totalCount
      ? "All accounts"
      : `${selectedCount} account${selectedCount === 1 ? "" : "s"}`;
  return `${acctsLabel} · ${timeLabel(time, months)}`;
}

// Last calendar day of `month` ("YYYY-MM"), for flatpickr's maxDate.
export function monthEndDate(month: string): string {
  const [yearStr = "", monthStr = ""] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const end = new Date(Date.UTC(year, monthNum, 0));
  return end.toISOString().slice(0, 10);
}

export function dateToMonthKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function isGroupName(value: string | undefined): value is keyof AccountGroups {
  return value === "Registered" || value === "Taxable" || value === "Cash";
}

// Mutable controller shared by the module-level DOM helpers below, so
// createFilter stays a thin wire-up under the 100-line limit. Everything the
// helpers need to read state, mutate it, and re-notify lives here.
interface Controller {
  ledger: FilterLedger;
  allIds: string[];
  groups: AccountGroups;
  state: FilterState;
  rangePicker: flatpickr.Instance | null;
  onChange: () => void;
}

function selectedIds(c: Controller): string[] {
  return c.state.accts ?? c.allIds;
}

function applyAccounts(c: Controller, next: Set<string>): void {
  // Account changes are orthogonal to time: the active window (preset or
  // custom range) is carried through untouched, so resolveMonths() is
  // unchanged by toggling accounts.
  const accts = next.size === c.allIds.length ? null : [...next];
  c.state = applyAccountSelection(c.state, accts);
  paintAccountInputs(c);
  c.onChange();
}

function toggleAccount(c: Controller, id: string, checked: boolean): void {
  const next = new Set(selectedIds(c));
  if (checked) next.add(id);
  else next.delete(id);
  applyAccounts(c, next);
}

function toggleGroup(c: Controller, name: keyof AccountGroups, checked: boolean): void {
  const next = new Set(selectedIds(c));
  for (const a of c.groups[name]) {
    if (checked) next.add(a.id);
    else next.delete(a.id);
  }
  applyAccounts(c, next);
}

function setPreset(c: Controller, preset: TimePreset): void {
  c.state = { accts: c.state.accts, time: { mode: "preset", preset, from: "", to: "" } };
  c.rangePicker?.clear();
  paintPresets(c);
  c.onChange();
}

function setCustomRange(c: Controller, from: string, to: string): void {
  c.state = { accts: c.state.accts, time: { mode: "custom", preset: "all", from, to } };
  paintPresets(c);
  c.onChange();
}

function paintAccountInputs(c: Controller): void {
  const host = document.getElementById("account-groups");
  if (!host) return;
  const selected = new Set(selectedIds(c));
  for (const input of host.querySelectorAll("input[data-acct-id]")) {
    if (input instanceof HTMLInputElement) {
      input.checked = selected.has(input.dataset.acctId ?? "");
    }
  }
  for (const input of host.querySelectorAll("input[data-group]")) {
    if (!(input instanceof HTMLInputElement)) continue;
    const groupName = input.dataset.group;
    if (!isGroupName(groupName)) continue;
    const ids = c.groups[groupName].map((a) => a.id);
    input.checked = ids.length > 0 && ids.every((id) => selected.has(id));
  }
}

function paintPresets(c: Controller): void {
  const host = document.getElementById("scope-popover");
  if (!host) return;
  for (const btn of host.querySelectorAll("[data-preset]")) {
    if (!(btn instanceof HTMLElement)) continue;
    const active = c.state.time.mode === "preset" && btn.dataset.preset === c.state.time.preset;
    btn.classList.toggle("on", active);
  }
}

function buildAccountEl(a: FilterAccount): HTMLElement {
  const label = document.createElement("label");
  label.className = "fbx-acct";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.acctId = a.id;
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = a.kind;
  const idSpan = document.createElement("span");
  idSpan.className = "chip-id";
  idSpan.textContent = a.short_id;
  label.append(input, badge, ` ${a.name} `, idSpan);
  return label;
}

function buildGroupEl(name: keyof AccountGroups, accounts: FilterAccount[]): HTMLElement {
  const el = document.createElement("div");
  el.className = "fbx-group";
  const head = document.createElement("label");
  head.className = "fbx-group-toggle";
  const groupInput = document.createElement("input");
  groupInput.type = "checkbox";
  groupInput.dataset.group = name;
  head.append(groupInput, document.createTextNode(name));
  el.appendChild(head);
  const list = document.createElement("div");
  list.className = "fbx-group-list";
  for (const a of accounts) list.appendChild(buildAccountEl(a));
  el.appendChild(list);
  return el;
}

function renderAccountGroups(c: Controller): void {
  const host = document.getElementById("account-groups");
  if (!host) return;
  host.textContent = "";
  for (const name of GROUP_ORDER) {
    const accounts = c.groups[name];
    if (accounts.length === 0) continue;
    host.appendChild(buildGroupEl(name, accounts));
  }
  paintAccountInputs(c);
}

function wireAccountGroups(c: Controller): void {
  const host = document.getElementById("account-groups");
  host?.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (isGroupName(target.dataset.group)) {
      toggleGroup(c, target.dataset.group, target.checked);
    } else if (target.dataset.acctId) {
      toggleAccount(c, target.dataset.acctId, target.checked);
    }
  });
}

function wirePresets(c: Controller): void {
  const host = document.getElementById("scope-popover");
  host?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const preset = target.closest<HTMLElement>("[data-preset]")?.dataset.preset;
    if (preset === "all" || preset === "ytd" || preset === "1y" || preset === "3y") {
      setPreset(c, preset);
    }
  });
}

function wireRangePicker(c: Controller): void {
  const input = document.getElementById("range-picker");
  if (!(input instanceof HTMLInputElement)) return;
  const first = c.ledger.months[0];
  const last = c.ledger.months[c.ledger.months.length - 1];
  if (!first || !last) return;
  c.rangePicker = flatpickr(input, {
    mode: "range",
    minDate: `${first}-01`,
    maxDate: monthEndDate(last),
    onChange: (selectedDates: Date[]) => {
      if (selectedDates.length < 2) return;
      const [from, to] = selectedDates;
      if (!from || !to) return;
      setCustomRange(c, dateToMonthKey(from), dateToMonthKey(to));
    },
  });
}

function wirePopover(): void {
  const summary = document.getElementById("scope-summary");
  const popover = document.getElementById("scope-popover");
  if (!summary || !popover) return;
  const setOpen = (open: boolean): void => {
    popover.hidden = !open;
    summary.setAttribute("aria-expanded", String(open));
  };
  summary.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(popover.hidden);
  });
  document.addEventListener("click", (e) => {
    if (popover.hidden) return;
    const target = e.target;
    if (target instanceof Node && !popover.contains(target) && target !== summary) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}

export function createFilter(ledger: FilterLedger, onChange: () => void): Filter {
  const c: Controller = {
    ledger,
    allIds: ledger.accounts.map((a) => a.id),
    groups: groupAccounts(ledger.accounts),
    state: { accts: null, time: ALL_TIME },
    rangePicker: null,
    onChange,
  };
  renderAccountGroups(c);
  wireAccountGroups(c);
  paintPresets(c);
  wirePresets(c);
  wireRangePicker(c);
  wirePopover();
  return {
    resolveMonths: () => resolveWindow(c.state.time, ledger.months),
    selected: () => selectedIds(c),
    scopeLabel: () =>
      formatScope(selectedIds(c).length, c.allIds.length, c.state.time, ledger.months),
  };
}
