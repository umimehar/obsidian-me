// Pure, browser-safe formatters shared by the filter summary, the aggregated
// series module, and the Chart.js tooltips. Kept dependency-free so it can be
// imported from anywhere in the client bundle without pulling in the DOM.

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

// Whole-dollar amount, e.g. "$1,234" / "-$1,234".
export function money(v: number): string {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(v)).toLocaleString("en-CA")}`;
}

// Compact axis-label amount, e.g. "$1.2M" / "$34K" / "$123".
export function compact(v: number): string {
  const n = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (n >= 1e6) return `${sign}$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${sign}$${Math.round(n / 1e3)}K`;
  return `${sign}$${Math.round(n)}`;
}

// "YYYY-MM" -> "Mon YYYY". The canonical month formatter — filter.ts and
// series.ts both import this rather than keeping their own copy.
export function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTH_NAMES[index] ?? month} ${month.slice(0, 4)}`;
}

// The one place an account's display label is composed. An account with a
// real name renders that; anything else falls back to kind plus short_id,
// which is what every account showed before names were introduced. Keeping
// this in one function stops the filter chips, the charts, and the detail
// table drifting apart.
export function accountLabel(a: { kind: string; name?: string; short_id: string }): string {
  return a.name && a.name !== a.kind ? a.name : `${a.kind} ${a.short_id}`;
}
