/** Every return: what period it covers, its state, what it came to, and the lines on it. */

import { escapeHtml, money, plainDate } from "../format";
import { layout, prose, scopeTag, section, sourcesHtml, table } from "../layout";
import { filingBadge, resultText } from "../status";
import type { Filing, FilingKind, TaxData } from "../types";

const KIND_TITLE: Record<FilingKind, string> = {
  T2: "Corporate income tax (T2)",
  HST: "HST returns",
  T1: "Personal income tax (T1)",
  T4: "Payroll slips (T4)",
  T4A: "T4A slips",
  T5: "Dividend slips (T5)",
  payroll: "Payroll remittances",
  instalments: "Tax instalments",
  other: "Other filings",
};

const KIND_ORDER: readonly FilingKind[] = [
  "T2",
  "HST",
  "T1",
  "T4",
  "payroll",
  "instalments",
  "T4A",
  "T5",
  "other",
];

type Fact = readonly [string, string];

const pair = (facts: readonly Fact[]) =>
  `<dl class="tax-facts">${facts.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

export function filingHtml(d: TaxData, f: Filing): string {
  const done = f.status === "filed" || f.status === "assessed";
  const key: Fact[] = [
    ["Covers", `${plainDate(f.period_start)} to ${plainDate(f.period_end)}`],
    ["Result", resultText(f)],
  ];
  if (done && f.filed_on) key.push(["Filed", plainDate(f.filed_on)]);
  else if (f.due) key.push(["Deadline", plainDate(f.due)]);
  const more: Fact[] = [];
  if (f.due && done) more.push(["Filing deadline", plainDate(f.due)]);
  if (f.payment_due) more.push(["Payment deadline", plainDate(f.payment_due)]);
  if (f.filed_by) more.push(["Filed by", escapeHtml(f.filed_by)]);
  if (f.confirmation) more.push(["Confirmation", escapeHtml(f.confirmation)]);
  const notes = f.notes.length
    ? `<h4 class="tax-notes-head">Worth knowing</h4><ul class="tax-notes">${f.notes.map((n) => `<li>${prose(n, d.glossary)}</li>`).join("")}</ul>`
    : "";
  const lines = f.lines.length
    ? `<h4 class="tax-notes-head">Every line on the return</h4>\n${table(
        ["Line", "Amount"],
        f.lines.map((l) => [escapeHtml(l.label), money(l.value)]),
        [1],
      )}`
    : "";
  const extras = [
    f.notes.length ? `${f.notes.length} ${f.notes.length === 1 ? "note" : "notes"}` : "",
    f.lines.length ? `${f.lines.length} lines` : "",
  ].filter(Boolean);
  return `      <article class="tax-filing" id="${escapeHtml(f.id)}">
        <header class="tax-filing-head"><h3>${escapeHtml(f.title)}</h3>${filingBadge(f.status)}</header>
        <p class="tax-plain">${prose(f.plain, d.glossary)}</p>
        ${pair(key)}
        <details class="tax-rule-more">
          <summary>More${extras.length ? `: ${extras.join(", ")}` : ""}</summary>
          ${more.length ? pair(more) : ""}
          ${notes}
          ${lines}
          <div class="tax-event-meta">${scopeTag(f.scope)}</div>
          ${sourcesHtml(d, f.sources)}
        </details>
      </article>`;
}

export function filingsPage(d: TaxData): string {
  const kinds = KIND_ORDER.filter((k) => d.filings.some((f) => f.kind === k));
  const jump = kinds.map((k) => `<a href="#kind-${k}">${KIND_TITLE[k]}</a>`).join("");
  const body = kinds
    .map((k) => {
      const items = d.filings
        .filter((f) => f.kind === k)
        .sort((a, b) => b.period_start.localeCompare(a.period_start))
        .map((f) => filingHtml(d, f))
        .join("\n");
      return `${section(KIND_TITLE[k], undefined, `kind-${k}`)}\n${items}`;
    })
    .join('\n      <hr class="hr mt-rule" />\n');
  return layout(d, {
    page: "filings",
    title: "Returns filed",
    kicker: "Every return, newest first",
    standfirst: "What each one covered and what it came to",
    body: `      <nav class="tax-jump" aria-label="Kinds of return">${jump}</nav>\n${body}`,
  });
}
