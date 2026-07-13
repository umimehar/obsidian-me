"""Render the masked datastore and analytics into self-contained offline HTML pages.

Every page is a full document that links the shared stylesheet and ships inline
vanilla JavaScript: a theme toggle plus an interactive "explorer" that reads an
embedded JSON series and lets the reader switch Year/Month, filter accounts, and
scrub an animated chart. Server-rendered tables carry the same figures so the
pages still work with JavaScript disabled. No templating engine, no external
resources, no network access at view time.
"""

from collections import defaultdict
from html import escape as _std_escape
from json import dumps as _json_dumps
from pathlib import Path

CSS_HREF = "../../_assets/personal.css"

NAV = (
    ("index.html", "Overview"),
    ("growth.html", "Growth"),
    ("contributions.html", "Contributions"),
    ("cash-flow.html", "Cash flow"),
    ("income.html", "Income"),
    ("holdings.html", "Holdings"),
)

CAVEAT = (
    "Cash balances are exact. Investment market values are approximate, "
    "estimated from recorded buy cost rather than live market quotes."
)

_THEME_SCRIPT = """<script>
(function () {
  var root = document.documentElement;
  var key = "invest-theme";
  var saved = localStorage.getItem(key);
  if (saved) { root.setAttribute("data-theme", saved); }
  var btn = document.getElementById("theme-toggle");
  if (!btn) { return; }
  btn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem(key, next);
    window.dispatchEvent(new Event("themechange"));
  });
})();
</script>"""

_EXPLORER_JS = (Path(__file__).parent / "explorer.js").read_text(encoding="utf-8")
_EXPLORER_SCRIPT = f"<script>{_EXPLORER_JS}</script>"


def _html_escape(text: object) -> str:
    """Escape any user-derived value for safe inclusion in HTML text or attributes."""
    return _std_escape(str(text), quote=True)


def _money(value: float, currency: str = "") -> str:
    """Format a numeric amount as a signed currency string."""
    sign = "-" if value < 0 else ""
    suffix = f" {currency}" if currency else ""
    return f"{sign}${abs(value):,.2f}{suffix}"


def svg_bar_chart(series: list[tuple[str, float]], width: int = 640, height: int = 240) -> str:
    """Return an inline SVG bar chart; empty series yields a framed 'no data' chart."""
    pad_l, pad_r, pad_t, pad_b = 14, 14, 16, 30
    plot_w, plot_h = width - pad_l - pad_r, height - pad_t - pad_b
    baseline = pad_t + plot_h
    open_tag = (
        f'<svg viewBox="0 0 {width} {height}" width="100%" height="{height}" '
        f'role="img" class="chart" preserveAspectRatio="xMidYMid meet" '
        f'xmlns="http://www.w3.org/2000/svg">'
    )
    if not series:
        return (
            f'{open_tag}<rect x="0.5" y="0.5" width="{width - 1}" height="{height - 1}" '
            f'rx="16" fill="none" stroke="var(--chart-grid)"/>'
            f'<text x="{width / 2}" y="{height / 2}" text-anchor="middle" '
            f'dominant-baseline="middle" class="chart-empty">no data</text></svg>'
        )
    max_v = max((max(v, 0.0) for _, v in series), default=0.0) or 1.0
    band = plot_w / len(series)
    bar_w = max(band - 12, 4)
    parts = [
        open_tag,
        f'<line x1="{pad_l}" y1="{baseline}" x2="{pad_l + plot_w}" y2="{baseline}" '
        f'stroke="var(--chart-axis)" stroke-width="1"/>',
    ]
    for i, (label, value) in enumerate(series):
        bar_h = max(value, 0.0) / max_v * plot_h
        x = pad_l + i * band + (band - bar_w) / 2
        y = baseline - bar_h
        cx = x + bar_w / 2
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{bar_h:.1f}" '
            f'rx="4" fill="var(--chart-1)"><title>{_html_escape(label)}: '
            f"{_html_escape(f'{value:,.2f}')}</title></rect>"
        )
        parts.append(
            f'<text x="{cx:.1f}" y="{baseline + 18:.1f}" text-anchor="middle" '
            f'class="chart-label">{_html_escape(label)}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


def _table(headers: list[str], rows: list[list[object]]) -> str:
    """Build a semantic table from headers and rows of cell values."""
    head = "".join(f"<th>{_html_escape(h)}</th>" for h in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{_html_escape(c)}</td>" for c in row) + "</tr>" for row in rows
    )
    return (
        f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead>'
        f"<tbody>{body}</tbody></table></div>"
    )


def _kpi_row(items: list[tuple[str, str]]) -> str:
    """Build a row of headline metric tiles."""
    cells = "".join(
        f'<div class="kpi"><span class="kpi-label">{_html_escape(label)}</span>'
        f'<span class="kpi-value">{_html_escape(value)}</span></div>'
        for label, value in items
    )
    return f'<div class="kpi-row">{cells}</div>'


def _caveat() -> str:
    return f'<p class="caveat">{_html_escape(CAVEAT)}</p>'


def _section(title: str, *blocks: str) -> str:
    inner = "".join(blocks)
    return (
        '<section class="section"><div class="card"><div class="card-inner">'
        f'<h2 class="section-title">{_html_escape(title)}</h2>{inner}'
        "</div></div></section>"
    )


def _account_label(account: dict) -> str:
    """Short human label for an account chip: kind plus a masked id tail."""
    return f"{account['kind']} · {account['masked_id'][5:11]}"


def _explorer(
    title: str, metric: str, agg: str, ctype: str, color: str, accounts: list[dict]
) -> str:
    """Interactive controls plus mount points; JavaScript fills the chart and KPIs."""
    chips = '<button type="button" class="chip on" data-id="all">All accounts</button>' + "".join(
        f'<button type="button" class="chip" data-id="{_html_escape(a["masked_id"])}">'
        f"{_html_escape(_account_label(a))}</button>"
        for a in accounts
    )
    controls = (
        '<div class="ex-controls">'
        '<div class="seg ex-seg" role="group" aria-label="Period">'
        '<button type="button" class="seg-btn on" data-period="year">Year</button>'
        '<button type="button" class="seg-btn" data-period="month">Month</button></div>'
        '<div class="seg ex-cur" role="group" aria-label="Currency"></div>'
        "</div>"
        f'<div class="chips ex-chips" role="group" aria-label="Accounts">{chips}</div>'
    )
    return (
        f'<section class="section explorer" data-metric="{metric}" data-agg="{agg}" '
        f'data-type="{ctype}" data-color="{color}"><div class="card"><div class="card-inner">'
        f'<h2 class="section-title">{_html_escape(title)}</h2>{controls}'
        '<div class="ex-kpis kpi-row"></div>'
        '<div class="ex-chart"><div class="ex-tip"></div>'
        '<noscript><p class="caveat">Enable JavaScript for the interactive chart; '
        "the tables below carry the same figures.</p></noscript></div>"
        "</div></div></section>"
    )


def _quick_links() -> str:
    links = "".join(
        f'<a class="quick-link" href="{href}">{_html_escape(label)}'
        '<span class="quick-arrow" aria-hidden="true">&#8599;</span></a>'
        for href, label in NAV[1:]
    )
    return f'<div class="quick-links">{links}</div>'


def _nav(active: str) -> str:
    items = "".join(
        f'<a href="{href}" class="nav-link'
        f'{" active" if href == active else ""}">{_html_escape(label)}</a>'
        for href, label in NAV
    )
    return f'<nav class="nav" aria-label="Sections">{items}</nav>'


def _topbar(title: str, active: str) -> str:
    return (
        '<header class="topbar"><div class="brand">'
        '<span class="eyebrow">Private Wealth</span>'
        f'<p class="brand-title">{_html_escape(title)}</p></div>'
        '<button type="button" class="theme-toggle" id="theme-toggle" '
        'aria-label="Toggle light and dark mode"><span class="theme-dot" '
        'aria-hidden="true"></span>Theme</button></header>'
        f"{_nav(active)}"
    )


def _scope(store: dict) -> str:
    """Footer caption naming the masked accounts every page draws from."""
    tags = ", ".join(
        f"{_html_escape(a['masked_id'])} ({_html_escape(a['kind'])}, {_html_escape(a['currency'])})"
        for a in store["accounts"]
    )
    return f'<footer class="scope">Scope: {tags or "no accounts"}</footer>'


def _series_json(store: dict, analytics: dict) -> str:
    """Embed the compact monthly series and account list for the interactive layer."""
    payload = {
        "accounts": [
            {"account_id": a["masked_id"], "kind": a["kind"], "currency": a["currency"]}
            for a in store["accounts"]
        ],
        "series": analytics.get("monthly_series", []),
    }
    return f'<script type="application/json" id="ex-data">{_json_dumps(payload)}</script>'


def _page(title: str, active: str, body: str, footer: str = "") -> str:
    """Wrap a body string in the full offline document shell."""
    return (
        "<!DOCTYPE html>\n"
        '<html lang="en" data-theme="dark">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{_html_escape(title)} - Investments</title>\n"
        f'<link rel="stylesheet" href="{CSS_HREF}">\n</head>\n<body>\n'
        f'{_topbar(title, active)}<main class="page">{body}{footer}</main>\n'
        f"{_THEME_SCRIPT}\n</body>\n</html>\n"
    )


def _totals_by_currency(rows: list[dict], value_key: str) -> dict[str, float]:
    """Sum value_key per currency, keeping currencies separate."""
    totals: dict[str, float] = defaultdict(float)
    for row in rows:
        totals[row["currency"]] += row[value_key]
    return dict(totals)


def _currency_kpis(label: str, totals: dict[str, float]) -> list[tuple[str, str]]:
    """One KPI per currency, or a single unlabelled KPI when only one is present."""
    if len(totals) <= 1:
        return [(label, _money(next(iter(totals.values()), 0.0)))]
    return [(f"{label} ({cur})", _money(total)) for cur, total in sorted(totals.items())]


def render_index(store: dict, analytics: dict) -> str:
    """Overview: headline KPIs across every account, an interactive summary, and links."""
    meta = store["meta"]
    rng = meta["source_range"]
    contrib_totals = _totals_by_currency(analytics["contributions"]["by_account_year"], "total")
    income_totals = _totals_by_currency(analytics["income"]["by_month"], "total")
    kpis = _kpi_row(
        _currency_kpis("Total contributions", contrib_totals)
        + _currency_kpis("Total income", income_totals)
        + [("Holdings", str(len(analytics["holdings"]))), ("Accounts", str(len(store["accounts"])))]
    )
    meta_tbl = _table(
        ["Metric", "Value"],
        [
            ["Date range", f"{rng['start']} to {rng['end']}"],
            ["Transactions", meta["txn_count"]],
            ["Source files", meta.get("file_count", "")],
            ["Generated", meta["generated_at"]],
        ],
    )
    accounts_tbl = _table(
        ["Account", "Kind", "Currency", "First activity", "Last activity", "Transactions"],
        [
            [
                a["masked_id"],
                a["kind"],
                a["currency"],
                a["first_activity"],
                a["last_activity"],
                a["txn_count"],
            ]
            for a in store["accounts"]
        ],
    )
    return (
        _section("At a glance", kpis)
        + _explorer("Cash balance", "balance", "last", "area", "balance", store["accounts"])
        + _section("Datastore", meta_tbl, _caveat())
        + _section("Accounts", accounts_tbl)
        + _section("Explore", _quick_links())
    )


def render_growth(store: dict, analytics: dict) -> str:
    """Interactive portfolio balance plus the exact monthly balance ledger."""
    balances = analytics["balances"]
    explorer = _explorer("Cash balance", "balance", "last", "area", "balance", store["accounts"])
    rows = [
        [
            b["account_id"],
            b["month"],
            _money(b["balance"], b["currency"]),
            "approximate" if b["approximate"] else "exact",
        ]
        for b in balances
    ]
    tbl = _table(["Account", "Month", "Balance", "Basis"], rows)
    return explorer + _section("Monthly balances", tbl, _caveat())


def render_contributions(store: dict, analytics: dict) -> str:
    """Interactive contributions plus registered rollups, room, and RESP grants."""
    c = analytics["contributions"]
    explorer = _explorer("Contributions", "contrib", "sum", "bar", "contrib", store["accounts"])
    detail = _table(
        ["Account", "Kind", "Year", "Contributed"],
        [
            [r["account_id"], r["kind"], r["year"], _money(r["total"], r["currency"])]
            for r in c["by_account_year"]
        ],
    )
    registered = _table(
        ["Group", "Year", "Contributed"],
        [[r["group"], r["year"], _money(r["total"])] for r in c["by_registered_year"]],
    )
    blocks = [
        explorer,
        _section("Registered accounts by year", registered),
        _section("Contributions by account", detail),
    ]
    limit_rows = [
        [kind, year, _money(limit)]
        for kind, years in c["limits"].items()
        for year, limit in years.items()
    ]
    if limit_rows:
        blocks.append(_section("Contribution room", _table(["Kind", "Year", "Limit"], limit_rows)))
    if c["resp_grants"]:
        grant_rows = [[g["year"], _money(g["total"])] for g in c["resp_grants"]]
        blocks.append(_section("RESP grants", _table(["Year", "Grant"], grant_rows)))
    return "".join(blocks)


def render_cash_flow(store: dict, analytics: dict) -> str:
    """Interactive net cash flow plus the exact inflow/outflow ledger."""
    flows = analytics["cash_flow"]
    explorer = _explorer("Net cash flow", "net", "sum", "bar", "net", store["accounts"])
    rows = [
        [
            f["account_id"],
            f["month"],
            _money(f["inflow"], f["currency"]),
            _money(f["outflow"], f["currency"]),
            _money(f["net"], f["currency"]),
        ]
        for f in flows
    ]
    tbl = _table(["Account", "Month", "Inflow", "Outflow", "Net"], rows)
    return explorer + _section("Cash movements", tbl, _caveat())


def render_income(store: dict, analytics: dict) -> str:
    """Interactive income by period plus by-month and by-symbol ledgers."""
    inc = analytics["income"]
    explorer = _explorer("Investment income", "income", "sum", "bar", "income", store["accounts"])
    by_month = _table(
        ["Month", "Income"],
        [[r["month"], _money(r["total"], r["currency"])] for r in inc["by_month"]],
    )
    by_symbol = _table(
        ["Symbol", "Income"],
        [[r["symbol"], _money(r["total"], r["currency"])] for r in inc["by_symbol"]],
    )
    return explorer + _section("By month", by_month) + _section("By symbol", by_symbol)


def render_holdings(store: dict, analytics: dict) -> str:
    """Current positions with recorded cost base (market value not implied)."""
    holdings = analytics["holdings"]
    totals = _totals_by_currency(holdings, "total_buy_cost")
    kpis = _kpi_row(_currency_kpis("Total buy cost", totals) + [("Positions", str(len(holdings)))])
    top = sorted(holdings, key=lambda h: -h["total_buy_cost"])[:14]
    chart = svg_bar_chart([(h["symbol"], h["total_buy_cost"]) for h in top])
    rows = [
        [
            h["account_id"],
            h["symbol"],
            f"{h['quantity']:g}",
            _money(h["total_buy_cost"], h["currency"]),
        ]
        for h in holdings
    ]
    tbl = _table(["Account", "Symbol", "Quantity", "Buy cost"], rows)
    return (
        _section("At a glance", kpis)
        + _section("Cost base by holding (top positions)", chart)
        + _section("Positions", tbl, _caveat())
    )


def render_pages(store: dict, analytics: dict) -> dict[str, str]:
    """Render every analysis page as a full HTML document keyed by filename."""
    data = _series_json(store, analytics)
    foot = _scope(store) + data + _EXPLORER_SCRIPT
    return {
        "index.html": _page("Overview", "index.html", render_index(store, analytics), foot),
        "growth.html": _page("Growth", "growth.html", render_growth(store, analytics), foot),
        "contributions.html": _page(
            "Contributions", "contributions.html", render_contributions(store, analytics), foot
        ),
        "cash-flow.html": _page(
            "Cash flow", "cash-flow.html", render_cash_flow(store, analytics), foot
        ),
        "income.html": _page("Income", "income.html", render_income(store, analytics), foot),
        "holdings.html": _page(
            "Holdings", "holdings.html", render_holdings(store, analytics), foot
        ),
    }
