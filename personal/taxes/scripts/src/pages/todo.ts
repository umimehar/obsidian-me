/** Every open item, grouped by who has to act; one line each, detail on request. */

import { escapeHtml, plainDate } from "../format";
import { layout, prose, scopeTag, section } from "../layout";
import { isLive, itemBadge, sortItems } from "../status";
import type { OpenItem, TaxData } from "../types";
import { dueHtml } from "./index";

const OWNER_ORDER = ["Umar", "Saira", "Claude"];

function row(d: TaxData, i: OpenItem): string {
  return `<li class="tax-step" id="${escapeHtml(i.id)}">
            <details>
              <summary><span class="tax-step-title">${escapeHtml(i.title)}</span>${dueHtml(d.meta.as_of, i.due)}</summary>
              <p>${prose(i.detail, d.glossary)}</p>
              <div class="tax-todo-meta">${itemBadge(i.status)} ${scopeTag(i.scope)}</div>
            </details>
          </li>`;
}

function rank(owner: string): number {
  const i = OWNER_ORDER.indexOf(owner);
  return i < 0 ? OWNER_ORDER.length : i;
}

export function todoPage(d: TaxData): string {
  const live = sortItems(d.openItems.filter(isLive));
  const owners = [...new Set(live.map((i) => i.owner))].sort((a, b) => rank(a) - rank(b));
  const groups = owners
    .map((owner) => {
      const items = live.filter((i) => i.owner === owner);
      const who = owner === "Umar" ? "You" : owner;
      return `${section(`${who}`, `${items.length} open`)}
        <ol class="tax-steps">
          ${items.map((i) => row(d, i)).join("\n          ")}
        </ol>`;
    })
    .join('\n      <hr class="hr mt-rule" />\n');
  const closed = d.openItems
    .filter((i) => !isLive(i))
    .sort((a, b) => (b.closed_on ?? "").localeCompare(a.closed_on ?? ""));
  const done = closed.length
    ? `      <hr class="hr mt-rule" />
      <details class="tax-picture">
        <summary>Done or no longer needed (${closed.length})</summary>
        <ul class="tax-done">${closed
          .map(
            (i) =>
              `<li><span>${escapeHtml(i.title)}</span><span class="tax-due">${i.closed_on ? plainDate(i.closed_on) : ""}</span></li>`,
          )
          .join("")}</ul>
      </details>`
    : "";
  return layout(d, {
    page: "todo",
    title: "To do",
    kicker: "Who has to act",
    standfirst: "Soonest first; open a line for the detail",
    body: `${groups}\n${done}`,
  });
}
