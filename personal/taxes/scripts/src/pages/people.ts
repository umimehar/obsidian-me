/** Who is who: the corporation, the accountants, clients, staff, CRA. */

import { escapeHtml } from "../format";
import { kv, layout, prose, scopeTag, section, sourcesHtml } from "../layout";
import type { Entity, TaxData } from "../types";

const GROUPS: readonly (readonly [Entity["group"], string])[] = [
  ["self", "Us"],
  ["accountant", "Accountants"],
  ["client", "Clients"],
  ["employee", "Employees"],
  ["contractor", "Contractors"],
  ["government", "Government"],
  ["bank", "Banks and cards"],
  ["vendor", "Vendors"],
];

function card(d: TaxData, e: Entity): string {
  return `<div class="card" id="${escapeHtml(e.id)}">
          <div class="card-title">${escapeHtml(e.name)}</div>
          <div class="card-meta">${escapeHtml(e.role)}${e.period ? `, ${escapeHtml(e.period)}` : ""} ${scopeTag(e.scope)}</div>
          <p>${prose(e.detail, d.glossary)}</p>
          ${sourcesHtml(d, e.sources)}
        </div>`;
}

export function peoplePage(d: TaxData): string {
  const c = d.meta.corporation;
  const facts = kv([
    ["Legal name", escapeHtml(c.legal_name)],
    ["Operating name", escapeHtml(c.operating_name)],
    ["Business number", escapeHtml(c.bn)],
    ["HST account", escapeHtml(c.hst_account)],
    ["Payroll account", escapeHtml(c.payroll_account ?? "—")],
    ["Incorporated", escapeHtml(c.incorporated)],
    ["Type", escapeHtml(c.type)],
    ["Tax year", escapeHtml(c.year_end)],
    ["HST year", escapeHtml(c.hst_period)],
    ["Province", escapeHtml(c.province)],
    ["Address", escapeHtml(c.address)],
    [
      "Owner and director",
      `${escapeHtml(d.meta.person.name)}, SIN ${escapeHtml(d.meta.person.sin)}`,
    ],
  ]);
  const groups = GROUPS.filter(([g]) => d.entities.some((e) => e.group === g))
    .map(
      ([g, title]) => `${section(title)}
      <div class="card-grid">
        ${d.entities
          .filter((e) => e.group === g)
          .map((e) => card(d, e))
          .join("\n        ")}
      </div>`,
    )
    .join('\n      <hr class="hr mt-rule" />\n');
  return layout(d, {
    page: "people",
    title: "People",
    kicker: "Who is who",
    standfirst: "The corporation, accountants, clients and staff",
    body: `${section("The corporation")}\n${facts}\n      <hr class="hr mt-rule" />\n${groups}`,
  });
}
