/** Plain definitions for every term the other pages use. */

import { escapeHtml } from "../format";
import { layout, termId } from "../layout";
import type { TaxData } from "../types";

export function glossaryPage(d: TaxData): string {
  const terms = [...d.glossary]
    .sort((a, b) => a.term.localeCompare(b.term))
    .map(
      (g) => `<dt id="${termId(g.term)}">${escapeHtml(g.term)}</dt><dd>${escapeHtml(g.plain)}</dd>`,
    )
    .join("\n        ");
  return layout(d, {
    page: "glossary",
    title: "Glossary",
    kicker: "Tax words in plain language",
    standfirst: "Linked from every page where the word appears",
    body: `      <dl class="tax-glossary">
        ${terms}
      </dl>`,
  });
}
