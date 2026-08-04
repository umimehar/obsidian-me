// The query-string contract for the page's scope filter, so a view can be
// bookmarked, shared, or reloaded without losing what was selected.
//
// The page is opened from the vault as a file:// document. history.replaceState
// with a query string is permitted there (a file: document's origin is not
// opaque for this check), so the URL is the right place for this rather than a
// fragment. Writes use replaceState, never pushState: a filter toggle should
// not cost a Back press to leave the page.
//
// Params, all omitted at their default so a default view has a bare URL:
//   accts   comma-separated account short_ids; absent means every account
//   t       time preset, one of ytd | 1y | 3y; absent means all time
//   from,to custom window bounds as YYYY-MM; both required, and they win over t
//   period  the expanded cashflow drill-down period, YYYY or YYYY-MM
//
// Decoding is total: anything unparseable or unknown falls back to the default
// rather than throwing, because a hand-edited or truncated URL must still open.
import type { FilterAccount, FilterState, TimeState } from "./filter";
import { ALL_TIME } from "./filter";

const PRESETS = new Set(["ytd", "1y", "3y"]);
const MONTH_RE = /^\d{4}-\d{2}$/;
const PERIOD_RE = /^\d{4}(-\d{2})?$/;

export interface ScopeUrlState {
  state: FilterState;
  period: string | null;
}

function isPreset(value: string): value is "ytd" | "1y" | "3y" {
  return PRESETS.has(value);
}

// Account ids are the long masked hashes; short_ids are the 4-char labels the
// page already shows on each chip. The URL carries short_ids so it stays
// readable. They are unique in practice; if two ever collided, decoding would
// select both, which degrades to a wider scope rather than a wrong one.
function idsFromShort(short: string[], accounts: FilterAccount[]): string[] {
  const wanted = new Set(short);
  return accounts.filter((a) => wanted.has(a.short_id)).map((a) => a.id);
}

function shortFromIds(ids: string[], accounts: FilterAccount[]): string[] {
  const wanted = new Set(ids);
  return accounts.filter((a) => wanted.has(a.id)).map((a) => a.short_id);
}

function decodeTime(params: URLSearchParams): TimeState {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (MONTH_RE.test(from) && MONTH_RE.test(to) && from <= to) {
    return { mode: "custom", preset: "all", from, to };
  }
  const preset = params.get("t") ?? "";
  if (isPreset(preset)) return { mode: "preset", preset, from: "", to: "" };
  return ALL_TIME;
}

function decodeAccounts(params: URLSearchParams, accounts: FilterAccount[]): string[] | null {
  const raw = params.get("accts");
  if (raw === null) return null;
  const short = raw.split(",").filter((s) => s !== "");
  const ids = idsFromShort(short, accounts);
  // Empty (every id unknown) or complete both mean "no narrowing", and the
  // filter represents that as null so the summary reads "All accounts".
  if (ids.length === 0 || ids.length === accounts.length) return null;
  return ids;
}

export function decodeScope(search: string, accounts: FilterAccount[]): ScopeUrlState {
  const params = new URLSearchParams(search);
  const period = params.get("period") ?? "";
  return {
    state: { accts: decodeAccounts(params, accounts), time: decodeTime(params) },
    period: PERIOD_RE.test(period) ? period : null,
  };
}

// Commas are legal unencoded in a query string, and URLSearchParams escapes
// them. Every value here is generated (hex short_ids, fixed presets, YYYY-MM),
// so unescaping just the separator is safe and keeps the URL readable.
function serialize(params: URLSearchParams): string {
  const query = params.toString().replace(/%2C/g, ",");
  return query ? `?${query}` : "";
}

export function encodeScope(scope: ScopeUrlState, accounts: FilterAccount[]): string {
  const params = new URLSearchParams();
  const { state, period } = scope;
  if (state.accts !== null) {
    const short = shortFromIds(state.accts, accounts);
    if (short.length > 0 && short.length < accounts.length) params.set("accts", short.join(","));
  }
  if (state.time.mode === "custom" && state.time.from && state.time.to) {
    params.set("from", state.time.from);
    params.set("to", state.time.to);
  } else if (state.time.preset !== "all") {
    params.set("t", state.time.preset);
  }
  if (period) params.set("period", period);
  return serialize(params);
}

// Rewrite the address bar in place. Guarded because a browser that refuses
// replaceState for this document must not take the page down with it — the
// filter still works, it just stops being linkable.
export function writeScopeUrl(scope: ScopeUrlState, accounts: FilterAccount[]): void {
  const query = encodeScope(scope, accounts);
  try {
    history.replaceState(null, "", `${location.pathname}${query}${location.hash}`);
  } catch {
    // Non-fatal: leave the URL as-is.
  }
}
