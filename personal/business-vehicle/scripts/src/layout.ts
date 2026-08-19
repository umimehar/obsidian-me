/** The page shell every rendered page shares: masthead, nav, dateline, content, footnote. */

import { escapeHtml, plainDate } from "./format";
import { type PageId, navHtml } from "./nav";

export interface LayoutInput {
  readonly page: PageId;
  readonly title: string;
  readonly kicker: string;
  readonly standfirst: string;
  readonly asOf: string;
  readonly body: string;
  readonly footnote?: string;
}

export function layout(input: LayoutInput): string {
  const footnote = input.footnote
    ? `    <hr class="hr mt-rule" />\n    <div class="footnote"><p>${input.footnote}</p></div>\n`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)} — Business vehicle</title>
    <link rel="stylesheet" href="../../_assets/personal.css" />
  </head>
  <body>
    <header class="masthead">
      <p class="masthead-kicker">${escapeHtml(input.kicker)}</p>
      <h1 class="masthead-title">${escapeHtml(input.title)}</h1>
    </header>
${navHtml(input.page)}
    <div class="dateline">
      <span>2026 Mercedes-Benz GLC 43 AMG · 15248132 Canada Inc</span>
      <span class="reviewed">${escapeHtml(input.standfirst)}</span>
      <span>As of ${plainDate(input.asOf)}</span>
    </div>
    <main class="page">
${input.body}
${footnote}    </main>
  </body>
</html>
`;
}

/** A section heading with an optional italic note, matching the Ledger section-head block. */
export function section(title: string, note?: string): string {
  const noteHtml = note ? `\n        <p class="section-note">${escapeHtml(note)}</p>` : "";
  return `      <div class="section-head">
        <h2 class="section-title">${escapeHtml(title)}</h2>${noteHtml}
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
        `        <tr>${r
          .map((cell, i) => `<td${isNum(i) ? ' class="num"' : ""}>${cell}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");
  return `      <table class="table">
        <thead><tr>${head}</tr></thead>
        <tbody>
${body}
        </tbody>
      </table>`;
}

export function kv(pairs: readonly (readonly [string, string])[]): string {
  const items = pairs
    .map(([k, v]) => `        <dt>${escapeHtml(k)}</dt>\n        <dd>${v}</dd>`)
    .join("\n");
  return `      <dl class="kv">\n${items}\n      </dl>`;
}

export function callout(html: string): string {
  return `      <div class="callout">${html}</div>`;
}
