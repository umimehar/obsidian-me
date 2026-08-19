/** Contradictions and exposures found across the source documents. These are the reason
    the database exists, so they render the same way wherever they appear. */

import { escapeHtml } from "./format";
import type { Finding, Severity } from "./types";

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function bySeverity(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

export function findingsHtml(findings: readonly Finding[], opts: { only?: Severity } = {}): string {
  const shown = bySeverity(findings).filter((f) => !opts.only || f.severity === opts.only);
  if (shown.length === 0) {
    return `        <p class="section-note">Nothing outstanding.</p>`;
  }
  return shown
    .map(
      (f) => `        <div class="card">
          <p class="card-title">${escapeHtml(f.title)}</p>
          <p class="card-meta"><span class="badge">${escapeHtml(f.severity)}</span></p>
          <p>${escapeHtml(f.detail)}</p>
          <p><strong>Why it matters.</strong> ${escapeHtml(f.why)}</p>
          <p><strong>Do this.</strong> ${escapeHtml(f.action)}</p>
          ${
            f.sources.length
              ? `<p class="card-meta">${f.sources.map(escapeHtml).join("<br />")}</p>`
              : ""
          }
        </div>`,
    )
    .join("\n");
}
