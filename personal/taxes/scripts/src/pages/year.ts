/** One page per calendar year: what happened, the returns that touch it, the numbers, the paperwork. */

import { bytes, escapeHtml, money, shortDate } from "../format";
import { layout, prose, scopeTag, section, table } from "../layout";
import { filingBadge, resultText } from "../status";
import type { DocCategory, TaxData, YearRecord } from "../types";
import { CATEGORY_LABEL } from "./timeline";

export const DOC_LABEL: Record<DocCategory, string> = {
  t2: "Corporate returns",
  t1: "Personal returns",
  "hst-return": "HST returns",
  slip: "Tax slips and receipts for credits",
  payroll: "Payroll",
  accountant: "Accountant's working papers",
  resolution: "Corporate resolutions",
  vehicle: "Vehicle lease",
  "bank-statement": "Bank statements",
  "card-statement": "Credit card statements",
  invoice: "Invoices",
  receipt: "Receipts",
  workbook: "Spreadsheets",
  report: "Reports and analyses",
  package: "Packages sent out",
  workspace: "Claude working files",
  other: "Other",
};

function yearStrip(d: TaxData, current: number): string {
  const links = d.years
    .map((y) =>
      y.year === current
        ? `<a href="year-${y.year}.html" aria-current="page">${y.year}</a>`
        : `<a href="year-${y.year}.html">${y.year}</a>`,
    )
    .join("");
  return `      <nav class="tax-years" aria-label="Years">${links}</nav>`;
}

function overlaps(start: string, end: string, year: number): boolean {
  return start.slice(0, 4) <= String(year) && end.slice(0, 4) >= String(year);
}

function story(d: TaxData, y: YearRecord): string {
  const col = (title: string, paras: readonly string[]) =>
    paras.length === 0
      ? ""
      : `<div><h3 class="pillar-subhead">${title}</h3>${paras.map((p) => `<p>${prose(p, d.glossary)}</p>`).join("")}</div>`;
  return `      <p class="tax-headline">${prose(y.summary, d.glossary)}</p>
      <div class="tax-two">${col("The corporation", y.corporate_story)}${col("Personal", y.personal_story)}</div>`;
}

function returns(d: TaxData, year: number): string {
  const rows = d.filings
    .filter((f) => overlaps(f.period_start, f.period_end, year))
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .map((f) => [
      `<a href="filings.html#${f.id}">${escapeHtml(f.title)}</a>`,
      scopeTag(f.scope),
      filingBadge(f.status),
      resultText(f),
    ]);
  if (rows.length === 0) return "";
  return `${section("Returns that cover this year", "HST years cross calendar years, so an HST return can appear on two pages.")}
${table(["Return", "Whose", "State", "Result"], rows, [3])}`;
}

function figures(d: TaxData, y: YearRecord): string {
  if (y.groups.length === 0) return section("The detail");
  const groups = y.groups
    .map(
      (g) => `        <details class="tax-group">
          <summary><span class="tax-group-title">${escapeHtml(g.title)}</span><span class="tax-count">${g.figures.length} ${g.figures.length === 1 ? "figure" : "figures"}</span></summary>
          ${g.note ? `<p class="section-note">${escapeHtml(g.note)}</p>` : ""}
${table(
  ["", "Amount", "Basis"],
  g.figures.map((f) => [
    `${/^total/i.test(f.label) ? `<strong>${escapeHtml(f.label)}</strong>` : escapeHtml(f.label)}${f.note ? `<span class="tax-row-note">${prose(f.note, d.glossary)}</span>` : ""}`,
    money(f.value),
    `<span class="tax-basis">${escapeHtml(f.basis)}</span>`,
  ]),
  [1],
)}
        </details>`,
    )
    .join("\n");
  return `${section("The detail", "Open any section. Basis says where a figure comes from: the filed return, the bank, or an estimate.")}
      <div class="tax-groups">
${groups}
      </div>`;
}

function events(d: TaxData, year: number): string {
  const rows = d.timeline
    .filter((e) => e.date.startsWith(String(year)) && e.category !== "session")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (e) =>
        `<li><span class="tax-deadline-date">${shortDate(e.date)}</span><span><a href="timeline.html#${escapeHtml(e.id)}">${escapeHtml(e.title)}</a></span><span class="tax-cat">${CATEGORY_LABEL[e.category]}</span></li>`,
    );
  if (rows.length === 0) return "";
  return `      <details class="tax-group">
        <summary><span class="tax-group-title">What happened, in order</span><span class="tax-count">${rows.length} events</span></summary>
        <ul class="tax-deadlines">
          ${rows.join("\n          ")}
        </ul>
      </details>`;
}

function paperwork(d: TaxData, year: number): string {
  const files = d.catalog.files.filter((f) => f.year === year && f.duplicate_of === null);
  if (files.length === 0) return "";
  const byCat = new Map<DocCategory, { n: number; b: number }>();
  for (const f of files) {
    const cur = byCat.get(f.category) ?? { n: 0, b: 0 };
    byCat.set(f.category, { n: cur.n + 1, b: cur.b + f.bytes });
  }
  const rows = [...byCat.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([c, v]) => [
      `<a href="documents.html?year=${year}&amp;cat=${c}">${DOC_LABEL[c]}</a>`,
      String(v.n),
      bytes(v.b),
    ]);
  return `      <details class="tax-group">
        <summary><span class="tax-group-title">Paperwork on file</span><span class="tax-count">${files.length} files, not counting copies inside packages</span></summary>
${table(["Kind", "Files", "Size"], rows, [1, 2])}
      </details>`;
}

export function yearPage(d: TaxData, y: YearRecord): string {
  const statusWord = { closed: "Closed year", open: "Year in progress", partial: "Part year" }[
    y.status
  ];
  const body = [
    `${yearStrip(d, y.year)}\n${story(d, y)}`,
    returns(d, y.year),
    [figures(d, y), events(d, y.year), paperwork(d, y.year)].filter(Boolean).join("\n"),
  ]
    .filter(Boolean)
    .join('\n      <hr class="hr mt-rule" />\n');
  return layout(d, {
    page: "years",
    title: String(y.year),
    kicker: statusWord,
    standfirst: "January to December",
    body,
  });
}
