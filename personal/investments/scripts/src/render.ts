// Render the datastore and analytics into one self-contained offline page.
import { readFileSync } from "node:fs";
import type { Analytics } from "./analytics";
import type { Datastore } from "./datastore";

const CSS_HREF = "../../_assets/personal.css";
const FLATPICKR_CSS_PATH = new URL(
  "../node_modules/flatpickr/dist/flatpickr.min.css",
  import.meta.url,
);

const STANDING_NOTE =
  "Compiled from monthly statements, which record what was paid, not what holdings are " +
  "worth. Figures are stated at cost; the brokerage app shows market value, so its totals " +
  "will differ, usually upward.";

async function bundleClient(): Promise<string> {
  const built = await Bun.build({
    entrypoints: [new URL("./client/main.ts", import.meta.url).pathname],
    minify: true,
    target: "browser",
  });
  const out = built.outputs[0];
  if (!out) throw new Error("client bundle produced no output");
  return await out.text();
}

function htmlEscape(text: unknown): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Static skeleton for the progressive scope filter. filter.ts populates
// #account-groups from the embedded ledger data at runtime and wires all
// interactions; this only emits the summary button and the empty popover
// shell so the page has something to attach to before the client script
// runs. Selectors are namespaced "fbx-" so they never collide with the rest
// of the shared stylesheet.
function filterShell(): string {
  return (
    '<div class="fbx-bar">' +
    '<button type="button" class="fbx-summary" id="scope-summary" aria-haspopup="true" ' +
    'aria-expanded="false" aria-controls="scope-popover">' +
    '<span id="scope-summary-text">All accounts · All time</span>' +
    '<span class="fbx-caret" aria-hidden="true">&#9662;</span></button>' +
    '<div class="fbx-popover" id="scope-popover" hidden>' +
    '<div class="fbx-popover-col"><div class="fbx-popover-label">Accounts</div>' +
    '<div id="account-groups"></div></div>' +
    '<div class="fbx-popover-col"><div class="fbx-popover-label">Time window</div>' +
    '<div class="fbx-presets" role="group" aria-label="Time presets">' +
    '<button type="button" class="fbx-preset on" data-preset="all">All</button>' +
    '<button type="button" class="fbx-preset" data-preset="ytd">YTD</button>' +
    '<button type="button" class="fbx-preset" data-preset="1y">1Y</button>' +
    '<button type="button" class="fbx-preset" data-preset="3y">3Y</button></div>' +
    '<input type="text" class="fbx-range-input" id="range-picker" ' +
    'placeholder="Custom range" readonly></div></div></div>'
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

function canvasBox(chartId: string): string {
  return `<div class="chartbox-canvas"><canvas id="${chartId}"></canvas></div>`;
}

function sectionHead(title: string, note: string): string {
  return (
    '<div class="section-head"><div>' +
    `<h2 class="section-title">${htmlEscape(title)}</h2>` +
    `<p class="section-note">${htmlEscape(note)}</p></div></div>`
  );
}

function subhead(title: string): string {
  return `<h3 class="pillar-subhead">${htmlEscape(title)}</h3>`;
}

function contribSection(): string {
  return (
    '<section class="section" id="section-contrib">' +
    sectionHead(
      "Contributions & Room",
      "Contributed and room used across the selected accounts and time window.",
    ) +
    '<div class="hero-row" id="headline"></div>' +
    '<div id="room"></div>' +
    subhead("Cash flow") +
    canvasBox("chart-cashflow") +
    "</section>"
  );
}

function growthSection(): string {
  return (
    '<section class="section" id="section-growth">' +
    sectionHead(
      "Growth",
      "Market value is a snapshot as of the latest pricing run — it responds to the account " +
        "filter, but not to the time window.",
    ) +
    '<div class="hero-row" id="growth-summary"></div>' +
    '<p class="section-note" id="growth-coverage-note"></p>' +
    subhead("By account") +
    canvasBox("chart-growth") +
    subhead("Capital vs contributions") +
    canvasBox("chart-trend") +
    "</section>"
  );
}

function taxSection(): string {
  return (
    '<section class="section" id="section-tax">' +
    sectionHead(
      "Tax this year",
      "Always the current tax year across all taxable accounts — not affected by the scope " +
        "filter above.",
    ) +
    '<div class="hero-row" id="tax-cards"></div>' +
    '<div class="pillar-tax-rate">' +
    '<label for="tax-rate">Marginal rate</label>' +
    '<input type="number" id="tax-rate" step="0.01" min="0" max="1" value="0.48">' +
    '<span>Estimated tax added: <strong id="tax-estimate"></strong></span></div>' +
    '<p class="pillar-disclaimer"><strong>Rough estimate — not for filing.</strong></p>' +
    subhead("Income received") +
    canvasBox("chart-income") +
    "</section>"
  );
}

function detailSection(): string {
  return (
    '<section class="section" id="section-detail">' +
    sectionHead("Detail", "Accounts and holdings within the current scope.") +
    '<details class="pillar-detail"><summary>Show tables</summary>' +
    subhead("Accounts") +
    '<p class="section-note">Market value is shown per account here; the holdings table below ' +
    "stays at cost.</p>" +
    '<div class="table-wrap" id="acct-table"></div>' +
    subhead("Holdings at cost") +
    '<p class="section-note">Adjusted cost base, not market value. Direct Indexing is ' +
    "collapsed to one row.</p>" +
    '<div class="table-wrap" id="hold-table"></div>' +
    "</details></section>"
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
  const flatpickrCss = readFileSync(FLATPICKR_CSS_PATH, "utf-8");
  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${htmlEscape(title)} — The Ledger</title>\n` +
    `<link rel="stylesheet" href="${CSS_HREF}">\n` +
    `<style>${flatpickrCss}</style>\n</head>\n<body>\n` +
    `<main class="page">${body}</main>${foot}\n</body>\n</html>\n`
  );
}

export async function renderIndex(_store: Datastore, analytics: Analytics): Promise<string> {
  const body =
    masthead() +
    filterShell() +
    contribSection() +
    rule() +
    growthSection() +
    rule() +
    taxSection() +
    rule() +
    detailSection() +
    rule() +
    footnote();
  const payload = JSON.stringify({ ledger: analytics.ledger });
  const clientJs = await bundleClient();
  const foot =
    `<script type="application/json" id="ledger-data">${payload}</script>` +
    `<script>${clientJs}</script>`;
  return page("The Ledger", body, foot);
}

export async function renderPages(
  store: Datastore,
  analytics: Analytics,
): Promise<Record<string, string>> {
  return { "index.html": await renderIndex(store, analytics) };
}
