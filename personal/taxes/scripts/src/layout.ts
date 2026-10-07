/** Page shell and the small building blocks every page uses. */

import { homedir } from "node:os";
import { escapeHtml, evidenceHref, plainDate } from "./format";
import { type PageId, navHtml } from "./nav";
import type { GlossaryTerm, Scope, SourceRef, TaxData } from "./types";

export interface LayoutInput {
  readonly page: PageId;
  readonly title: string;
  readonly kicker: string;
  readonly standfirst: string;
  readonly body: string;
  readonly script?: string;
}

export function layout(data: TaxData, input: LayoutInput): string {
  const latestYear = data.years[data.years.length - 1]?.year ?? 2026;
  const script = input.script ? `\n    <script>\n${input.script}\n    </script>` : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)} — Taxes</title>
    <link rel="stylesheet" href="../../_assets/personal.css" />
  </head>
  <body class="tax">
    <header class="masthead">
      <p class="masthead-kicker">${escapeHtml(input.kicker)}</p>
      <h1 class="masthead-title">${escapeHtml(input.title)}</h1>
    </header>
${navHtml(input.page, latestYear)}
    <div class="dateline">
      <span>${escapeHtml(data.meta.corporation.legal_name)}, o/a ${escapeHtml(data.meta.corporation.operating_name)}</span>
      <span class="reviewed">${escapeHtml(input.standfirst)}</span>
      <span>As of ${plainDate(data.meta.as_of)}</span>
    </div>
    <main class="page">
${input.body}
    </main>${script}
  </body>
</html>
`;
}

export function section(title: string, note?: string, id?: string): string {
  const noteHtml = note ? `\n        <p class="section-note">${escapeHtml(note)}</p>` : "";
  const idAttr = id ? ` id="${escapeHtml(id)}"` : "";
  return `      <div class="section-head"${idAttr}>
        <div><h2 class="section-title">${escapeHtml(title)}</h2>${noteHtml}</div>
      </div>`;
}

export function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  numericColumns: readonly number[] = [],
): string {
  const isNum = (i: number) => numericColumns.includes(i);
  const head = headers
    .map((h, i) => `<th${isNum(i) ? ' class="num"' : ""}>${escapeHtml(h)}</th>`)
    .join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td${isNum(i) ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`,
    )
    .join("\n          ");
  return `      <div class="tax-scroll"><table class="table">
        <thead><tr>${head}</tr></thead>
        <tbody>
          ${body}
        </tbody>
      </table></div>`;
}

export function kv(pairs: readonly (readonly [string, string])[]): string {
  const rows = pairs.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`).join("\n        ");
  return `      <dl class="kv">
        ${rows}
      </dl>`;
}

const SCOPE_LABEL: Record<Scope, string> = {
  corporate: "Corporation",
  personal: "Personal",
  both: "Both",
};

export function scopeTag(scope: Scope): string {
  return `<span class="tax-scope tax-scope-${scope}">${SCOPE_LABEL[scope]}</span>`;
}

/** Turns a source reference into a link where one can exist, plain text otherwise. */
export function sourceHtml(root: string, ref: SourceRef): string {
  if (ref.startsWith("session:")) return `Claude session ${escapeHtml(ref.slice(8, 16))}`;
  if (ref.startsWith("memory:")) return `Claude memory, ${escapeHtml(ref.slice(7))}`;
  if (ref.startsWith("vault:"))
    return `<a href="../../../${ref.slice(6).split("/").map(encodeURIComponent).join("/")}">${escapeHtml(ref.slice(6))}</a>`;
  const name = ref.split("/").pop() ?? ref;
  return `<a href="${evidenceHref(root, ref)}" title="${escapeHtml(ref)}">${escapeHtml(name)}</a>`;
}

export function sourcesHtml(data: TaxData, refs: readonly SourceRef[]): string {
  if (refs.length === 0) return "";
  const root = data.meta.evidence_root.replace(/^~/, homedir());
  const items = refs.map((r) => `<li>${sourceHtml(root, r)}</li>`).join("");
  return `<details class="tax-sources"><summary>Where this comes from</summary><ul>${items}</ul></details>`;
}

/** Escapes text and links the first mention of each glossary term, in one pass so a link's own
    title text is never rescanned. */
export function prose(text: string, glossary: readonly GlossaryTerm[]): string {
  if (glossary.length === 0) return escapeHtml(text);
  const byTerm = new Map(glossary.map((g) => [g.term.toLowerCase(), g]));
  const terms = [...glossary].map((g) => escapeRegExp(g.term)).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![\\w/-])(${terms.join("|")})(?![\\w-])`, "g");
  const seen = new Set<string>();
  let out = "";
  let last = 0;
  for (const m of text.matchAll(re)) {
    const hit = m[0];
    const g = byTerm.get(hit.toLowerCase());
    if (!g || seen.has(g.term) || m.index === undefined) continue;
    seen.add(g.term);
    out += escapeHtml(text.slice(last, m.index));
    out += `<a class="tax-term" href="glossary.html#${termId(g.term)}" title="${escapeHtml(g.plain)}">${escapeHtml(hit)}</a>`;
    last = m.index + hit.length;
  }
  return out + escapeHtml(text.slice(last));
}

export function termId(term: string): string {
  return `term-${term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
