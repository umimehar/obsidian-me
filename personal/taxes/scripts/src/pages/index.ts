/** The overview: answer first, detail on request. A headline, three tiles, the three clocks
    (select a bar to explain that return in place), Umar's next steps and the next dates. */

import { clocksSvg } from "../clocks";
import { daysBetween, escapeHtml, plainDate, relativeDays, shortDate } from "../format";
import { layout, prose } from "../layout";
import { PAID_NOT_FILED, filingBadge, isLive, resultText, sortItems } from "../status";
import type { Filing, OpenItem, TaxData } from "../types";

const STEPS_SHOWN = 3;
const DATES_SHOWN = 3;

interface Upcoming {
  readonly f: Filing;
  readonly date: string;
  readonly label: string;
}

export function upcoming(d: TaxData): Upcoming[] {
  return d.filings
    .filter((f) => f.status !== "filed" && f.status !== "assessed")
    .flatMap((f): Upcoming[] => {
      const out: Upcoming[] = [];
      if (f.due)
        out.push({
          f,
          date: f.due,
          label: PAID_NOT_FILED.includes(f.kind) ? `${f.title}, final payment` : `File ${f.title}`,
        });
      if (f.payment_due && f.payment_due !== f.due)
        out.push({ f, date: f.payment_due, label: `Pay the balance of ${f.title}` });
      return out;
    })
    .filter((x) => x.date >= d.meta.as_of)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The due date and how far away it is; a date already passed says so plainly. */
export function dueHtml(asOf: string, due: string | undefined): string {
  if (!due) return "";
  const when = shortDate(due, asOf.slice(0, 4));
  const late = daysBetween(asOf, due);
  return late < 0
    ? `<span class="tax-due tax-overdue">${when}, ${-late} ${-late === 1 ? "day" : "days"} overdue</span>`
    : `<span class="tax-due">${when}, ${relativeDays(asOf, due)}</span>`;
}

function tiles(d: TaxData): string {
  const next = upcoming(d)[0];
  const first = next
    ? `<a class="tax-tile" href="#dates"><span class="tax-tile-label">Next deadline</span><span class="tax-tile-value">${shortDate(next.date, d.meta.as_of.slice(0, 4))}</span><span class="tax-tile-note">${escapeHtml(next.label)}, ${relativeDays(d.meta.as_of, next.date)}</span></a>`
    : "";
  const rest = (d.meta.glance ?? [])
    .slice(0, 2)
    .map((t) => {
      const open = t.href
        ? `a class="tax-tile" href="${escapeHtml(t.href)}"`
        : `div class="tax-tile"`;
      const close = t.href ? "a" : "div";
      return `<${open}><span class="tax-tile-label">${escapeHtml(t.label)}</span><span class="tax-tile-value">${escapeHtml(t.value)}</span><span class="tax-tile-note">${escapeHtml(t.note)}</span></${close}>`;
    })
    .join("");
  return `      <div class="tax-tiles">${first}${rest}</div>`;
}

/** What the select panel shows for each return: plain words, never the line-by-line numbers. */
function clockPayload(d: TaxData): string {
  const byId = Object.fromEntries(
    d.filings.map((f) => [
      f.id,
      {
        title: escapeHtml(f.title),
        covers: `${plainDate(f.period_start)} to ${plainDate(f.period_end)}`,
        status: filingBadge(f.status),
        result: resultText(f),
        due: f.due ? plainDate(f.due) : "",
        plain: prose(f.plain, d.glossary),
      },
    ]),
  );
  return JSON.stringify(byId).replace(/</g, "\\u003c");
}

function clocks(d: TaxData): string {
  const end = `${Number(d.meta.as_of.slice(0, 4)) + 1}-12-31`;
  const svg = clocksSvg(d.filings, d.meta.corporation.incorporated, end, d.meta.as_of);
  return `      <section class="tax-clock-section" aria-labelledby="clocks-title">
        <h2 class="section-title" id="clocks-title">Three tax clocks</h2>
        <p class="section-note">The corporation, HST and personal taxes each run on their own year. Select a bar to see that return.</p>
        <div class="tax-scroll tax-clocks">${svg}</div>
        <ul class="tax-legend">
          <li><span class="clk-key clk-assessed"></span>Filed</li>
          <li><span class="clk-key clk-prepared"></span>Ready, not yet filed</li>
          <li><span class="clk-key clk-in-progress"></span>Year still running</li>
          <li><span class="clk-key-due"></span>Deadline</li>
        </ul>
        <div class="tax-clock-panel" id="clock-panel" aria-live="polite" hidden></div>
        <script type="application/json" id="clock-data">${clockPayload(d)}</script>
      </section>`;
}

function step(d: TaxData, item: OpenItem): string {
  return `<li class="tax-step">
            <details>
              <summary><span class="tax-step-title">${escapeHtml(item.title)}</span>${dueHtml(d.meta.as_of, item.due)}</summary>
              <p>${prose(item.detail, d.glossary)}</p>
            </details>
          </li>`;
}

function nextSteps(d: TaxData): string {
  const live = sortItems(d.openItems.filter(isLive));
  const mine = live.filter((i) => i.owner === "Umar");
  const others = live.length - mine.length;
  return `      <section class="tax-half" aria-labelledby="steps-title">
        <h2 class="section-title" id="steps-title">Your next steps</h2>
        <ol class="tax-steps">
          ${mine
            .slice(0, STEPS_SHOWN)
            .map((i) => step(d, i))
            .join("\n          ")}
        </ol>
        <p class="tax-more"><a href="todo.html">All ${mine.length} of yours, and ${others} with Saira and Claude</a></p>
      </section>`;
}

function dates(d: TaxData): string {
  const rows = upcoming(d)
    .slice(0, DATES_SHOWN)
    .map(
      (x) =>
        `<li><span class="tax-date-day">${shortDate(x.date, d.meta.as_of.slice(0, 4))}</span><span><a href="filings.html#${escapeHtml(x.f.id)}">${escapeHtml(x.label)}</a> <span class="tax-due">${relativeDays(d.meta.as_of, x.date)}</span></span></li>`,
    )
    .join("\n          ");
  return `      <section class="tax-half" id="dates" aria-labelledby="dates-title">
        <h2 class="section-title" id="dates-title">Coming up</h2>
        <ul class="tax-dates">
          ${rows}
        </ul>
        <p class="tax-more"><a href="timeline.html#ahead">Every date ahead</a></p>
      </section>`;
}

function fullPicture(d: TaxData): string {
  const points = d.meta.standing.points
    .map((p) => `<dt>${escapeHtml(p.label)}</dt><dd>${prose(p.text, d.glossary)}</dd>`)
    .join("\n          ");
  return `      <details class="tax-picture">
        <summary>The full picture, in four paragraphs</summary>
        <dl class="tax-points">
          ${points}
        </dl>
      </details>`;
}

const CLOCK_SCRIPT = `      (() => {
        const data = JSON.parse(document.getElementById("clock-data").textContent);
        const panel = document.getElementById("clock-panel");
        const box = document.querySelector(".tax-clocks");
        const today = document.querySelector(".clk-today");
        if (box && today && box.scrollWidth > box.clientWidth) {
          box.scrollLeft = today.getBoundingClientRect().left - box.getBoundingClientRect().left - box.clientWidth * 0.6;
        }
        let current = null;
        document.querySelectorAll(".clk a").forEach((a) => {
          a.addEventListener("click", (ev) => {
            ev.preventDefault();
            const id = a.getAttribute("href").split("#")[1];
            const f = data[id];
            if (!f) return;
            document.querySelectorAll(".clk a.is-selected").forEach((x) => x.classList.remove("is-selected"));
            if (current === id) { panel.hidden = true; current = null; return; }
            current = id;
            a.classList.add("is-selected");
            panel.innerHTML =
              '<div class="tax-clock-panel-head"><h3>' + f.title + "</h3>" + f.status + "</div>" +
              "<p>" + f.plain + "</p>" +
              '<dl class="tax-facts"><div><dt>Covers</dt><dd>' + f.covers + "</dd></div>" +
              "<div><dt>Result</dt><dd>" + f.result + "</dd></div>" +
              (f.due ? "<div><dt>Deadline</dt><dd>" + f.due + "</dd></div>" : "") + "</dl>" +
              '<p class="tax-more"><a href="filings.html#' + encodeURIComponent(id) + '">Open the return, with every line</a></p>';
            panel.hidden = false;
          });
        });
      })();`;

export function indexPage(d: TaxData): string {
  const body = `      <p class="tax-headline tax-lead">${prose(d.meta.standing.headline, d.glossary)}</p>
${tiles(d)}
${clocks(d)}
      <div class="tax-halves">
${nextSteps(d)}
${dates(d)}
      </div>
${fullPicture(d)}`;
  return layout(d, {
    page: "index",
    title: "Taxes",
    kicker: "Corporate and personal",
    standfirst: "Start here",
    body,
    script: CLOCK_SCRIPT,
  });
}
