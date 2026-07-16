// Render the datastore and analytics into one self-contained offline page.
import { readFileSync } from "node:fs";
import type { Analytics } from "./analytics";
import type { Account, Datastore } from "./datastore";

const CSS_HREF = "../../_assets/personal.css";

const KIND_ORDER = [
  "TFSA",
  "ManagedTFSA",
  "FHSA",
  "RRSP",
  "RESP",
  "NonRegistered",
  "DirectIndexing",
  "PE",
  "Crypto",
  "Other",
  "Chequing",
  "Savings",
  "USD",
  "CreditCard",
];

const STANDING_NOTE =
  "Compiled from monthly statements, which record what was paid, not what holdings are " +
  "worth. Figures are stated at cost; the brokerage app shows market value, so its totals " +
  "will differ, usually upward.";

const LEDGER_JS = readFileSync(new URL("./ledger.js", import.meta.url), "utf-8");

function htmlEscape(text: unknown): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function accountIdLabel(a: Account): string {
  return `${slug(a.kind)}-${slug(a.name)}·${a.short_id}`;
}

function kindSort(kind: string): number {
  const i = KIND_ORDER.indexOf(kind);
  return i === -1 ? KIND_ORDER.length : i;
}

function filterBar(accounts: Account[]): string {
  const ordered = [...accounts].sort(
    (a, b) => kindSort(a.kind) - kindSort(b.kind) || a.name.localeCompare(b.name),
  );
  const groups = new Map<string, Account[]>();
  for (const a of ordered) {
    const list = groups.get(a.kind) ?? [];
    list.push(a);
    groups.set(a.kind, list);
  }
  const chipGroups: string[] = [];
  for (const [kind, accts] of groups) {
    const chips = accts
      .map(
        (a) =>
          `<button type="button" class="chip acct" data-acct="${htmlEscape(a.masked_id)}" ` +
          `data-kind="${htmlEscape(kind)}" title="${htmlEscape(accountIdLabel(a))}">` +
          `${htmlEscape(a.name)} <span class="chip-id">${htmlEscape(a.short_id)}</span></button>`,
      )
      .join("");
    chipGroups.push(
      `<div class="kind-group"><button type="button" class="chip kind-toggle" ` +
        `data-kind="${htmlEscape(kind)}"><span class="badge">${htmlEscape(kind)}</span>` +
        `</button>${chips}</div>`,
    );
  }
  return (
    '<div class="filterbar" id="filterbar"><div class="fb-accounts">' +
    '<button type="button" class="chip on" data-all>All accounts</button>' +
    `${chipGroups.join("")}</div>` +
    '<div class="fb-side"><div class="seg fb-dates" role="group" aria-label="Date range">' +
    '<button type="button" class="seg-btn" data-range="ytd">YTD</button>' +
    '<button type="button" class="seg-btn" data-range="1y">1Y</button>' +
    '<button type="button" class="seg-btn" data-range="3y">3Y</button>' +
    '<button type="button" class="seg-btn on" data-range="all">All</button></div>' +
    '<div class="fb-scope" id="fb-scope"></div></div></div>'
  );
}

function masthead(): string {
  return (
    '<header class="masthead">' +
    '<div class="masthead-kicker">Personal Finance · Household Edition</div>' +
    '<h1 class="masthead-title">The Ledger</h1></header>' +
    '<div class="dateline"><span>Private Records</span>' +
    '<span class="reviewed" id="asof">Portfolio report</span>' +
    "<span>Stated at cost</span></div>" +
    `<p class="standing-note">${htmlEscape(STANDING_NOTE)}</p>`
  );
}

function chartSection(title: string, note: string, chartId: string): string {
  return (
    `<section class="section"><div class="section-head"><div>` +
    `<h2 class="section-title">${htmlEscape(title)}</h2>` +
    `<p class="section-note">${htmlEscape(note)}</p></div></div>` +
    `<div class="chartbox" id="${chartId}"><div class="ex-tip" id="${chartId}-tip"></div>` +
    `<div class="chart-ymax" id="${chartId}-ymax"></div>` +
    `<div class="chart-ymin" id="${chartId}-ymin"></div></div>` +
    `<div class="chart-legend" id="${chartId}-legend"></div></section>`
  );
}

function footnote(): string {
  return (
    '<section class="section footnote" id="about"><div class="section-head"><div>' +
    '<h2 class="section-title">About these figures</h2></div></div>' +
    "<p>These figures are compiled from monthly account statements. The statements record " +
    "cash movements (deposits, withdrawals, transfers), contributions, dividends and " +
    "interest received, and each buy or sell with its price at the time of trade. They do " +
    "not carry current market prices, so a holding's present market value and any " +
    "unrealised gain cannot be shown.</p>" +
    "<p><strong>Invested at cost</strong> is the adjusted cost base of positions still held: " +
    "what was paid for them, reduced proportionally as they were sold. " +
    "<strong>Contributions</strong> are deposits coded as contributions, gross of " +
    "recontributions. <strong>Net deposits</strong> adds transfers in and subtracts " +
    "transfers out, so it is the money put in net of money taken out; it is the closest " +
    "match to the brokerage app's own net-deposits figure, though the statements cannot tell " +
    "an internal transfer between your own accounts from an external withdrawal, so the two " +
    "need not tie to the cent. <strong>Cash on hand</strong> is uninvested cash. " +
    "<strong>Growth beyond contributions</strong> is the cost base above contributions, i.e. " +
    "capital that arrived as transfers in or reinvested income.</p></section>"
  );
}

function rule(): string {
  return '<div class="hr mt-rule"></div>';
}

function page(title: string, body: string, foot: string): string {
  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${htmlEscape(title)} — The Ledger</title>\n` +
    `<link rel="stylesheet" href="${CSS_HREF}">\n</head>\n<body>\n` +
    `<main class="page">${body}</main>${foot}\n</body>\n</html>\n`
  );
}

export function renderIndex(store: Datastore, analytics: Analytics): string {
  const body =
    masthead() +
    filterBar(store.accounts) +
    '<div class="hero-row" id="headline"></div>' +
    '<div class="waterfall" id="waterfall"></div>' +
    rule() +
    chartSection(
      "Capital deployed over time",
      "Cumulative cost base of holdings plus cash. The thin line is cumulative contributions; " +
        "the gap above it is transfers in and reinvested income.",
      "cap",
    ) +
    rule() +
    chartSection("Income received", "Dividends and interest by period.", "inc") +
    rule() +
    chartSection(
      "Cash flow",
      "Money in above the line, money out below; net marked per period.",
      "cf",
    ) +
    rule() +
    '<section class="section"><div class="section-head"><div>' +
    '<h2 class="section-title">Contributions &amp; room</h2>' +
    '<p class="section-note">Contributed against annual room, per registered type.</p>' +
    '</div></div><div id="room"></div></section>' +
    rule() +
    '<section class="section"><div class="section-head"><div>' +
    '<h2 class="section-title">Accounts</h2>' +
    '<p class="section-note">Grouped by type; figures within the current filter.</p>' +
    '</div></div><div class="table-wrap" id="acct-table"></div></section>' +
    rule() +
    '<section class="section"><div class="section-head"><div>' +
    '<h2 class="section-title">Holdings at cost</h2>' +
    '<p class="section-note">Adjusted cost base, not market value. Direct Indexing ' +
    "is collapsed to one row.</p></div></div>" +
    '<div class="table-wrap" id="hold-table"></div></section>' +
    rule() +
    footnote();
  const payload = JSON.stringify({ ledger: analytics.ledger });
  const foot =
    `<script type="application/json" id="ledger-data">${payload}</script>` +
    `<script>${LEDGER_JS}</script>`;
  return page("The Ledger", body, foot);
}

export function renderPages(store: Datastore, analytics: Analytics): Record<string, string> {
  return { "index.html": renderIndex(store, analytics) };
}
