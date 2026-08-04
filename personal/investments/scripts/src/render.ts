// Render the datastore and analytics into one self-contained offline page.
import { readFileSync } from "node:fs";
import type { Analytics } from "./analytics";
import { monthLabel } from "./client/format";
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

// "Jul 2023 – Jun 2026" span of the underlying data, from the first to the
// last month in the ledger. Rendered statically at build time since the
// month list never changes without a rebuild.
function dataRangeLabel(months: string[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return "";
  return `Data: ${monthLabel(first)} – ${monthLabel(last)}`;
}

function masthead(months: string[]): string {
  return (
    '<header class="masthead">' +
    '<div class="masthead-kicker">Personal Finance · Household Edition</div>' +
    '<h1 class="masthead-title">The Ledger</h1></header>' +
    '<div class="dateline"><span>Private Records</span>' +
    '<span class="reviewed" id="asof">Portfolio report</span>' +
    `<span id="data-range">${htmlEscape(dataRangeLabel(months))}</span>` +
    "<span>Stated at cost</span></div>" +
    `<p class="standing-note">${htmlEscape(STANDING_NOTE)}</p>`
  );
}

function canvasBox(chartId: string): string {
  return `<div class="chartbox-canvas"><canvas id="${chartId}"></canvas></div>`;
}

function sectionHead(title: string, note: string, titleId?: string): string {
  const idAttr = titleId ? ` id="${titleId}"` : "";
  return (
    '<div class="section-head"><div>' +
    `<h2 class="section-title"${idAttr}>${htmlEscape(title)}</h2>` +
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
      "Money you put in and registered room used across the selected accounts and time " +
        "window.",
    ) +
    '<div class="hero-row" id="headline"></div>' +
    '<div id="room"></div>' +
    subhead("External money in / out") +
    '<p class="section-note">External deposits into and withdrawals out of the selected ' +
    "accounts, not trading activity — transfers between your own accounts are excluded. " +
    "Click a bar to see the underlying transactions.</p>" +
    canvasBox("chart-cashflow") +
    '<details class="pillar-detail" id="cashflow-drill">' +
    "<summary>Transactions for the selected period</summary>" +
    '<div id="cashflow-drill-body"></div></details>' +
    "</section>"
  );
}

function growthSection(): string {
  return (
    '<section class="section" id="section-growth">' +
    sectionHead(
      "Growth",
      "Net deposits, portfolio at cost, and income received across the selected accounts " +
        "and time window.",
    ) +
    '<div class="hero-row" id="growth-summary"></div>' +
    subhead("Portfolio at cost vs net deposits") +
    canvasBox("chart-trend") +
    subhead("By account, at cost") +
    canvasBox("chart-growth") +
    "</section>"
  );
}

function taxSection(): string {
  return (
    '<section class="section" id="section-tax">' +
    sectionHead(
      "Tax",
      "Interest, eligible dividends, foreign income, and realized gains for the selected " +
        "accounts, for the selected window's tax year.",
      "tax-section-title",
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

function projectionSection(): string {
  return (
    '<section class="section" id="section-projection">' +
    sectionHead(
      "Thirty Year Projection",
      "A forward projection of contributions, government grants, room remaining, and " +
        "projected value across the selected accounts, driven by the rate inputs below. " +
        "Registered accounts follow their CRA limits; the corporate account follows a " +
        "flat plan, since a corporation has no contribution room.",
      "projection-section-title",
    ) +
    '<div class="pillar-tax-rate">' +
    '<label for="proj-return">Return</label>' +
    '<input type="number" id="proj-return" step="0.1" min="0" max="20" value="8">' +
    '<label for="proj-index">Indexation</label>' +
    '<input type="number" id="proj-index" step="0.1" min="0" max="10" value="2">' +
    "</div>" +
    '<div id="proj-warning"></div>' +
    '<div class="hero-row" id="proj-summary"></div>' +
    subhead("Year by year") +
    '<div class="table-wrap" id="proj-table"></div>' +
    subhead("Contributions, grants, and growth") +
    canvasBox("chart-projection") +
    subhead("Projected value by account") +
    '<p class="section-note">Contribution room is assessed per person and per group, not per ' +
    "account, so a group's room is split across its accounts by their recent share of that " +
    "group's contributions. A line keeps its colour whatever else is selected. " +
    "The value axis is logarithmic, so steady growth reads as a straight line and " +
    "accounts of very different sizes stay comparable \u2014 but equal vertical " +
    "distances mean equal <em>ratios</em>, not equal dollars. A line that stops has " +
    "closed.</p>" +
    canvasBox("chart-projection-accounts") +
    '<div id="proj-caveats"></div>' +
    "</section>"
  );
}

function detailSection(): string {
  return (
    '<section class="section" id="section-detail">' +
    sectionHead("Detail", "Accounts and holdings within the current scope.") +
    '<details class="pillar-detail"><summary>Show tables</summary>' +
    subhead("Accounts") +
    '<p class="section-note">All figures at cost; the holdings table below breaks holdings out ' +
    "by security.</p>" +
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
    "<p><strong>Portfolio at cost</strong> is the adjusted cost base of positions still held " +
    "plus cash on hand: what was paid for them, reduced proportionally as they were sold, " +
    "plus uninvested cash. <strong>Registered contributions</strong> are deposits coded as " +
    "contributions, gross of recontributions, used only for CRA contribution room. " +
    "<strong>Net deposits</strong> is the true measure of money put in: it adds transfers in " +
    "and subtracts transfers out on top of registered contributions, so it also counts money " +
    "that arrived as a transfer rather than a coded contribution. It is the closest match to " +
    "the brokerage app's own net-deposits figure, though the statements cannot tell an " +
    "internal transfer between your own accounts from an external withdrawal, so the two need " +
    "not tie to the cent. <strong>Gain beyond deposits</strong> is portfolio at cost minus net " +
    "deposits: cost basis above what was put in, i.e. reinvested income and securities " +
    "transferred in at cost. It is a cost-basis figure, not a market-value gain.</p></section>"
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
    masthead(analytics.ledger.months) +
    filterShell() +
    contribSection() +
    rule() +
    growthSection() +
    rule() +
    taxSection() +
    rule() +
    projectionSection() +
    rule() +
    detailSection() +
    rule() +
    footnote();
  const payload = JSON.stringify({ ledger: analytics.ledger }).replace(/</g, "\\u003c");
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
