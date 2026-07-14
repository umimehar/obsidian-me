"""Render the masked datastore and analytics into one self-contained offline page.

"The Ledger": a classical broadsheet dashboard adapted from the imported Claude
Design "classical" system. A single filter-driven page: a global filter bar
(accounts grouped by kind, plus a date range) drives every headline figure and
chart. Fonts are self-hosted, all figures and charts are recomputed client-side
by ledger.js from one embedded dataset, no network at view time.

The statements record contributions, income, cash balances and cost basis, not
live market value; every figure is stated at cost or as cash on hand and never
implies a market quote.
"""

import re
from html import escape as _std_escape
from json import dumps as _json_dumps
from pathlib import Path

CSS_HREF = "../../_assets/personal.css"

_KIND_ORDER = [
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
]

STANDING_NOTE = (
    "Compiled from monthly statements, which record what was paid, not what "
    "holdings are worth. Figures are stated at cost; the brokerage app shows "
    "market value, so its totals will differ, usually upward."
)

_LEDGER_JS = (Path(__file__).parent / "ledger.js").read_text(encoding="utf-8")


def _html_escape(text: object) -> str:
    """Escape any user-derived value for safe inclusion in HTML text or attributes."""
    return _std_escape(str(text), quote=True)


def _slug(text: str) -> str:
    """Lowercase hyphenated slug for an account id fragment."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _account_id_label(a: dict) -> str:
    """The requested kind-account-name plus short id machine label."""
    return f"{_slug(a['kind'])}-{_slug(a['name'])}·{a['short_id']}"


def _kind_sort(kind: str) -> int:
    return _KIND_ORDER.index(kind) if kind in _KIND_ORDER else len(_KIND_ORDER)


def _filter_bar(accounts: list[dict]) -> str:
    """Global filter bar: account chips grouped by kind, and a date-range control."""
    ordered = sorted(accounts, key=lambda a: (_kind_sort(a["kind"]), a["name"]))
    groups: dict[str, list[dict]] = {}
    for a in ordered:
        groups.setdefault(a["kind"], []).append(a)
    chip_groups = []
    for kind, accts in groups.items():
        chips = "".join(
            f'<button type="button" class="chip acct" data-acct="{_html_escape(a["masked_id"])}" '
            f'data-kind="{_html_escape(kind)}" title="{_html_escape(_account_id_label(a))}">'
            f'{_html_escape(a["name"])} <span class="chip-id">{_html_escape(a["short_id"])}'
            "</span></button>"
            for a in accts
        )
        chip_groups.append(
            '<div class="kind-group">'
            f'<button type="button" class="chip kind-toggle" data-kind="{_html_escape(kind)}">'
            f'<span class="badge">{_html_escape(kind)}</span></button>{chips}</div>'
        )
    return (
        '<div class="filterbar" id="filterbar"><div class="fb-accounts">'
        '<button type="button" class="chip on" data-all>All accounts</button>'
        f"{''.join(chip_groups)}</div>"
        '<div class="fb-side"><div class="seg fb-dates" role="group" aria-label="Date range">'
        '<button type="button" class="seg-btn" data-range="ytd">YTD</button>'
        '<button type="button" class="seg-btn" data-range="1y">1Y</button>'
        '<button type="button" class="seg-btn" data-range="3y">3Y</button>'
        '<button type="button" class="seg-btn on" data-range="all">All</button></div>'
        '<div class="fb-scope" id="fb-scope"></div></div></div>'
    )


def _masthead() -> str:
    """Newspaper masthead with the standing editorial note about the data source."""
    return (
        '<header class="masthead">'
        '<div class="masthead-kicker">Personal Finance · Household Edition</div>'
        '<h1 class="masthead-title">The Ledger</h1></header>'
        '<div class="dateline"><span>Private Records</span>'
        '<span class="reviewed" id="asof">Portfolio report</span>'
        "<span>Stated at cost</span></div>"
        f'<p class="standing-note">{_html_escape(STANDING_NOTE)}</p>'
    )


def _chart_section(title: str, note: str, chart_id: str, extra: str = "") -> str:
    """A section with a heading, note, and an interactive chart mount point."""
    return (
        f'<section class="section"><div class="section-head"><div>'
        f'<h2 class="section-title">{_html_escape(title)}</h2>'
        f'<p class="section-note">{_html_escape(note)}</p></div>{extra}</div>'
        f'<div class="chartbox" id="{chart_id}"><div class="ex-tip" id="{chart_id}-tip"></div>'
        f'<div class="chart-ymax" id="{chart_id}-ymax"></div>'
        f'<div class="chart-ymin" id="{chart_id}-ymin"></div></div>'
        f'<div class="chart-legend" id="{chart_id}-legend"></div></section>'
    )


def _footnote() -> str:
    """The classical about-these-figures footnote at the page foot."""
    return (
        '<section class="section footnote" id="about"><div class="section-head"><div>'
        '<h2 class="section-title">About these figures</h2></div></div>'
        "<p>These figures are compiled from monthly account statements. The statements record "
        "cash movements (deposits, withdrawals, transfers), contributions, dividends and "
        "interest received, and each buy or sell with its price at the time of trade. They do "
        "not carry current market prices, so a holding's present market value and any "
        "unrealised gain cannot be shown.</p>"
        "<p><strong>Invested at cost</strong> is the adjusted cost base of positions still held: "
        "what was paid for them, reduced proportionally as they were sold. "
        "<strong>Contributions</strong> are deposits coded as contributions, gross of "
        "recontributions. <strong>Cash on hand</strong> is uninvested cash. "
        "<strong>Growth beyond contributions</strong> is the cost base above contributions, i.e. "
        "capital that arrived as transfers in or reinvested income.</p></section>"
    )


def render_index(store: dict, analytics: dict) -> str:
    """The single filter-driven Ledger page (all figures computed by ledger.js)."""
    body = (
        _masthead()
        + _filter_bar(store["accounts"])
        + '<div class="hero-row" id="headline"></div>'
        + '<div class="waterfall" id="waterfall"></div>'
        + '<div class="hr mt-rule"></div>'
        + _chart_section(
            "Capital deployed over time",
            "Cumulative cost base of holdings plus cash. The thin line is cumulative "
            "contributions; the gap above it is transfers in and reinvested income.",
            "cap",
        )
        + '<div class="hr mt-rule"></div>'
        + _chart_section("Income received", "Dividends and interest by period.", "inc")
        + '<div class="hr mt-rule"></div>'
        + _chart_section(
            "Cash flow", "Money in above the line, money out below; net marked per period.", "cf"
        )
        + '<div class="hr mt-rule"></div>'
        + '<section class="section"><div class="section-head"><div>'
        '<h2 class="section-title">Contributions &amp; room</h2>'
        '<p class="section-note">Contributed against annual room, per registered type.</p>'
        '</div></div><div id="room"></div></section>'
        + '<div class="hr mt-rule"></div>'
        + '<section class="section"><div class="section-head"><div>'
        '<h2 class="section-title">Accounts</h2>'
        '<p class="section-note">Grouped by type; figures within the current filter.</p>'
        '</div></div><div class="table-wrap" id="acct-table"></div></section>'
        + '<div class="hr mt-rule"></div>'
        + '<section class="section"><div class="section-head"><div>'
        '<h2 class="section-title">Holdings at cost</h2>'
        '<p class="section-note">Adjusted cost base, not market value. Direct Indexing '
        "is collapsed to one row.</p></div></div>"
        '<div class="table-wrap" id="hold-table"></div></section>'
        + '<div class="hr mt-rule"></div>'
        + _footnote()
    )
    payload = {"ledger": analytics["ledger"]}
    foot = (
        f'<script type="application/json" id="ledger-data">{_json_dumps(payload)}</script>'
        f"<script>{_LEDGER_JS}</script>"
    )
    return _page("The Ledger", body, foot)


def _page(title: str, body: str, foot: str = "") -> str:
    """Wrap a body in the full offline document shell."""
    return (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{_html_escape(title)} — The Ledger</title>\n"
        f'<link rel="stylesheet" href="{CSS_HREF}">\n</head>\n<body>\n'
        f'<main class="page">{body}</main>{foot}\n</body>\n</html>\n'
    )


def render_pages(store: dict, analytics: dict) -> dict[str, str]:
    """Render the single Ledger page keyed by filename."""
    return {"index.html": render_index(store, analytics)}
