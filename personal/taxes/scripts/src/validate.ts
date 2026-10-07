/** Integrity checks on the datastore. Each problem names the record so the fix is obvious. */

import type { TaxData } from "./types";

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const SIN_LIKE = /\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/;
const ALLOWED_NINE_DIGITS = new Set(["795920958"]);

function idProblems(kind: string, ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) out.push(`${kind}: duplicate id ${id}`);
    seen.add(id);
  }
  return out;
}

function dateProblems(d: TaxData): string[] {
  const dated: [string, string | undefined][] = [
    ...d.timeline.map((e): [string, string] => [`timeline ${e.id}`, e.date]),
    ...d.decisions.map((e): [string, string] => [`decision ${e.id}`, e.date]),
    ...d.filings.flatMap((f): [string, string | undefined][] => [
      [`filing ${f.id} period_start`, f.period_start],
      [`filing ${f.id} period_end`, f.period_end],
      [`filing ${f.id} due`, f.due],
      [`filing ${f.id} filed_on`, f.filed_on],
      [`filing ${f.id} payment_due`, f.payment_due],
    ]),
    ...d.openItems.flatMap((i): [string, string | undefined][] => [
      [`open item ${i.id} due`, i.due],
      [`open item ${i.id} closed_on`, i.closed_on],
    ]),
  ];
  return dated
    .filter(([, v]) => v !== undefined && !DATE.test(v))
    .map(([where, v]) => `${where}: "${v}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
}

function supersessionProblems(d: TaxData): string[] {
  const subjects = new Map<string, number>();
  for (const dec of d.decisions) {
    if (dec.status === "active") subjects.set(dec.subject, (subjects.get(dec.subject) ?? 0) + 1);
  }
  return [...subjects.entries()]
    .filter(([, n]) => n > 1)
    .map(
      ([s, n]) => `decisions: ${n} active rules for subject "${s}"; mark the older ones superseded`,
    );
}

/** Flags anything shaped like a SIN or account number that is not the corporation's own BN. */
export function leakProblems(d: TaxData): string[] {
  const text = JSON.stringify({ ...d, catalog: null });
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(SIN_LIKE, "g"))) {
    const digits = m[0].replace(/\D/g, "");
    if (!ALLOWED_NINE_DIGITS.has(digits)) out.push(`possible SIN or account number "${m[0]}"`);
  }
  return out;
}

export function validate(d: TaxData): string[] {
  return [
    ...idProblems(
      "timeline",
      d.timeline.map((e) => e.id),
    ),
    ...idProblems(
      "filings",
      d.filings.map((e) => e.id),
    ),
    ...idProblems(
      "decisions",
      d.decisions.map((e) => e.id),
    ),
    ...idProblems(
      "open items",
      d.openItems.map((e) => e.id),
    ),
    ...idProblems(
      "entities",
      d.entities.map((e) => e.id),
    ),
    ...dateProblems(d),
    ...supersessionProblems(d),
    ...leakProblems(d),
  ];
}
