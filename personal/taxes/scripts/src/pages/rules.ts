/** The rules in force, each with the history of what it replaced. */

import { escapeHtml, plainDate } from "../format";
import { layout, prose, scopeTag, section, sourcesHtml } from "../layout";
import type { Decision, TaxData } from "../types";

/** Groups decisions by subject, newest version first. */
export function chains(decisions: readonly Decision[]): Decision[][] {
  const bySubject = new Map<string, Decision[]>();
  for (const dec of decisions)
    bySubject.set(dec.subject, [...(bySubject.get(dec.subject) ?? []), dec]);
  return [...bySubject.values()].map((c) =>
    c.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        Number(a.status === "superseded") - Number(b.status === "superseded"),
    ),
  );
}

/** `chain` is newest first, so each older rule was replaced on the date of the one before it. */
function history(d: TaxData, chain: readonly Decision[]): string {
  const older = chain.slice(1);
  if (older.length === 0) return "";
  const items = older
    .map(
      (o, i) =>
        `<li><span class="tax-deadline-date">${plainDate(o.date)} to ${plainDate(chain[i]?.date)}</span><span class="tax-old">${prose(o.decision, d.glossary)}</span></li>`,
    )
    .join("");
  return `<h4 class="tax-notes-head">Earlier versions</h4><ul class="tax-deadlines tax-history">${items}</ul>`;
}

function rule(d: TaxData, chain: readonly Decision[]): string {
  const [current, ...older] = chain;
  if (!current) return "";
  const retired = current.status === "superseded";
  const changed = older.length
    ? `, changed ${older.length} ${older.length === 1 ? "time" : "times"}`
    : "";
  return `      <article class="tax-rule${retired ? " is-retired" : ""}" id="${escapeHtml(current.subject)}">
        <h3 class="tax-rule-title">${escapeHtml(current.title)}</h3>
        <p class="tax-plain">${prose(current.decision, d.glossary)}</p>
        <details class="tax-rule-more">
          <summary>${retired ? "Retired" : "Since"} ${plainDate(current.date)}${changed}. Why?</summary>
          <p class="tax-why">${prose(current.rationale, d.glossary)}</p>
          ${history(d, chain)}
          <div class="tax-event-meta">${scopeTag(current.scope)}</div>
          ${sourcesHtml(d, current.sources)}
        </details>
      </article>`;
}

export function rulesPage(d: TaxData): string {
  const all = chains(d.decisions).sort((a, b) =>
    (b[0]?.date ?? "").localeCompare(a[0]?.date ?? ""),
  );
  const live = all.filter((c) => c[0]?.status === "active");
  const retired = all.filter((c) => c[0]?.status !== "active");
  const index = live
    .map((c) => c[0])
    .filter((c): c is Decision => c !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((c) => `<li><a href="#${escapeHtml(c.subject)}">${escapeHtml(c.title)}</a></li>`)
    .join("");
  const body = `      <ul class="tax-rule-index" aria-label="All rules in force">${index}</ul>
      <hr class="hr mt-rule" />
${section("In force", `${live.length} rules. Each one says what we do, why, and what it replaced.`)}
${live.map((c) => rule(d, c)).join("\n")}
${retired.length ? `      <hr class="hr mt-rule" />\n${section("Retired", "Rules that no longer apply and were not replaced.")}\n${retired.map((c) => rule(d, c)).join("\n")}` : ""}`;
  return layout(d, {
    page: "rules",
    title: "Rules we follow",
    kicker: "Decisions and how they changed",
    standfirst: "The newest version of each rule wins",
    body,
  });
}
