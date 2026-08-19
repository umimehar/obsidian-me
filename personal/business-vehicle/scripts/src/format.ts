/** Formatting helpers shared by every rendered page. Null always renders as an em dash
    so a missing fact reads as missing rather than as a zero. */

const DASH = "—";

const MONEY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
});

const WHOLE_MONEY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
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
];

export function money(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : MONEY.format(value);
}

export function wholeMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : WHOLE_MONEY.format(value);
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return DASH;
  const rendered = `${Math.abs(value * 100).toFixed(digits)}%`;
  if (value > 0) return `+${rendered}`;
  if (value < 0) return `-${rendered}`;
  return rendered;
}

/** Whole months from start to end. The month only counts once its day of month is reached,
    which is what a lease payment schedule and a warranty window both mean by "months in". */
export function monthsBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const sign = end < start ? -1 : 1;
  const [a, b] = sign === 1 ? [start, end] : [end, start];
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return sign * months;
}

export function plainDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  const name = MONTHS[Number(month) - 1];
  if (!name) return iso;
  return `${Number(day)} ${name} ${year}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
