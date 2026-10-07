/** The full history, newest first, one section per year, filterable by whose taxes and what happened. */

import { escapeHtml, money, plainDate, shortDate } from "../format";
import { layout, prose, scopeTag, sourcesHtml } from "../layout";
import type { TaxData, TimelineCategory, TimelineEvent } from "../types";

export const CATEGORY_LABEL: Record<TimelineCategory, string> = {
  filing: "Returns filed",
  payment: "Payments",
  refund: "Refunds",
  decision: "Decisions",
  document: "Documents",
  correspondence: "Emails and letters",
  discovery: "Findings",
  correction: "Corrections",
  deadline: "Deadlines",
  engagement: "Accountants",
  payroll: "Payroll",
  session: "Work sessions",
  other: "Other",
};

function eventHtml(d: TaxData, e: TimelineEvent, currentYear?: string): string {
  const amount =
    e.amount !== undefined ? `<span class="tax-amount num">${money(e.amount)}</span>` : "";
  return `<li class="tax-event" data-scope="${e.scope}" data-cat="${e.category}" id="${escapeHtml(e.id)}">
            <details>
              <summary>
                <time class="tax-event-date" datetime="${e.date}">${shortDate(e.date, currentYear)}</time>
                <span class="tax-event-title"><span class="tax-dot tax-dot-${e.scope}" aria-hidden="true"></span>${escapeHtml(e.title)}</span>${amount}
              </summary>
              <div class="tax-event-body">
                <p>${prose(e.detail, d.glossary)}</p>
                <div class="tax-event-meta">${scopeTag(e.scope)}<span class="tax-cat">${CATEGORY_LABEL[e.category]}</span></div>
                ${sourcesHtml(d, e.sources)}
              </div>
            </details>
          </li>`;
}

export function groupByYear(events: readonly TimelineEvent[]): [string, TimelineEvent[]][] {
  const sorted = [...events].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of sorted) {
    const y = e.date.slice(0, 4);
    groups.set(y, [...(groups.get(y) ?? []), e]);
  }
  return [...groups.entries()];
}

const FILTER_SCRIPT = `      (() => {
        const state = { scope: "all", cat: "all" };
        const events = document.querySelectorAll(".tax-event");
        const count = document.getElementById("tl-count");
        function apply() {
          let shown = 0;
          events.forEach((el) => {
            const s = el.dataset.scope;
            const okScope = state.scope === "all" || s === state.scope || s === "both";
            const okCat = state.cat === "all" || el.dataset.cat === state.cat;
            el.hidden = !(okScope && okCat);
            if (!el.hidden) shown++;
          });
          document.querySelectorAll(".tax-year-block").forEach((b) => {
            b.hidden = !b.querySelector(".tax-event:not([hidden])");
          });
          count.textContent = shown + " of " + events.length + " events";
        }
        document.querySelectorAll("[data-filter-scope]").forEach((btn) => {
          btn.addEventListener("click", () => {
            state.scope = btn.dataset.filterScope;
            document.querySelectorAll("[data-filter-scope]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
            apply();
          });
        });
        document.getElementById("tl-cat").addEventListener("change", (ev) => { state.cat = ev.target.value; apply(); });
        apply();
        const target = location.hash && document.getElementById(location.hash.slice(1));
        if (target) {
          target.querySelectorAll(":scope > details").forEach((x) => { x.open = true; });
          for (let el = target.parentElement; el; el = el.parentElement) if (el.tagName === "DETAILS") el.open = true;
          target.scrollIntoView();
        }
      })();`;

export function timelinePage(d: TaxData): string {
  const cats = [...new Set(d.timeline.map((e) => e.category))].sort();
  const options = cats.map((c) => `<option value="${c}">${CATEGORY_LABEL[c]}</option>`).join("");
  const ahead = d.timeline
    .filter((e) => e.date > d.meta.as_of)
    .sort((x, y) => x.date.localeCompare(y.date));
  const aheadBlock = ahead.length
    ? `      <section class="tax-year-block tax-ahead" id="ahead">
        <details>
          <summary><h2 class="tax-year-head">Still to come</h2> <span class="tax-count">${ahead.length} dates, next ${plainDate(ahead[0]?.date)}</span></summary>
          <ol class="tax-events">
            ${ahead.map((e) => eventHtml(d, e, d.meta.as_of.slice(0, 4))).join("\n            ")}
          </ol>
        </details>
      </section>\n`
    : "";
  const blocks = groupByYear(d.timeline.filter((e) => e.date <= d.meta.as_of))
    .map(
      ([year, events]) => `      <section class="tax-year-block">
        <h2 class="tax-year-head">${year}</h2>
        <ol class="tax-events">
          ${events.map((e) => eventHtml(d, e)).join("\n          ")}
        </ol>
      </section>`,
    )
    .join("\n");
  const history = `${aheadBlock}${blocks}`;
  const body = `      <div class="tax-filters" role="group" aria-label="Filter the timeline">
        <div class="tax-seg">
          <button type="button" data-filter-scope="all" aria-pressed="true">Everything</button>
          <button type="button" data-filter-scope="corporate" aria-pressed="false">Corporation</button>
          <button type="button" data-filter-scope="personal" aria-pressed="false">Personal</button>
        </div>
        <label class="tax-select">Show <select id="tl-cat"><option value="all">all kinds of events</option>${options}</select></label>
        <span class="tax-count-line" id="tl-count" aria-live="polite"></span>
      </div>
${history}`;
  return layout(d, {
    page: "timeline",
    title: "Timeline",
    kicker: "Everything that happened",
    standfirst: "Newest first, back to incorporation",
    body,
    script: FILTER_SCRIPT,
  });
}
