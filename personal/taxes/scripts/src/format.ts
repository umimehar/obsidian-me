/** Formatting helpers shared by every page. Null renders as an em dash so missing reads as missing. */

const DASH = "—";

const MONEY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function money(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : MONEY.format(value);
}

/** "14 November 2025", "November 2025" or "2025", matching however precise the stored date is. */
export function plainDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const [year, month, day] = iso.split("-");
  const name = month ? MONTHS[Number(month) - 1] : undefined;
  if (!year) return iso;
  if (!month) return year;
  if (!name) return iso;
  return day ? `${Number(day)} ${name} ${year}` : `${name} ${year}`;
}

/** "4 Oct", or "4 Oct 2031" when the year differs from `currentYear`. */
export function shortDate(iso: string, currentYear?: string): string {
  const [year, month, day] = iso.split("-");
  const name = month ? MONTHS[Number(month) - 1]?.slice(0, 3) : undefined;
  if (!name) return iso;
  const base = day ? `${Number(day)} ${name}` : name;
  return currentYear && year !== currentYear ? `${base} ${year}` : base;
}

/** Milliseconds for an ISO date of any stored precision; YYYY and YYYY-MM mean the first day. */
export function dayMs(iso: string): number {
  const [y, m = "01", d = "01"] = iso.split("-");
  return Date.parse(`${y}-${m}-${d}T00:00:00Z`);
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const ms = dayMs(to) - dayMs(from);
  return Math.round(ms / 86_400_000);
}

export function relativeDays(asOf: string, due: string): string {
  const d = daysBetween(asOf, due);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A file:// link into the evidence folder, with each path segment encoded. */
export function evidenceHref(root: string, relPath: string): string {
  const encoded = relPath.split("/").map(encodeURIComponent).join("/");
  return `file://${root.split("/").map(encodeURIComponent).join("/")}/${encoded}`;
}
