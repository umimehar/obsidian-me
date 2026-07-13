"""Render the masked datastore and analytics into self-contained offline HTML pages.

Every page is a full document that links the shared stylesheet, ships an inline
light/dark toggle, and draws its charts as inline SVG with CSS custom-property
fills so they adapt to the active theme. No templating engine, no external
resources, no network access at view time.
"""

from html import escape as _std_escape

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
  });
})();
</script>"""


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


def _page(title: str, active: str, body: str, footer: str = "") -> str:
    """Wrap a body string in the full offline document shell."""
    return (
        "<!DOCTYPE html>\n"
        '<html lang="en" data-theme="light">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{_html_escape(title)} - Investments</title>\n"
        f'<link rel="stylesheet" href="{CSS_HREF}">\n</head>\n<body>\n'
        f'{_topbar(title, active)}<main class="page">{body}{footer}</main>\n'
        f"{_THEME_SCRIPT}\n</body>\n</html>\n"
    )


def render_index(store: dict, analytics: dict) -> str:
    """Overview: datastore meta, headline KPIs, and links into the other pages."""
    meta = store["meta"]
    rng = meta["source_range"]
    total_contrib = sum(r["total"] for r in analytics["contributions"]["by_registered_year"])
    total_income = sum(r["total"] for r in analytics["income"]["by_month"])
    kpis = _kpi_row(
        [
            ("Total contributions", _money(total_contrib)),
            ("Total income", _money(total_income)),
            ("Holdings", str(len(analytics["holdings"]))),
        ]
    )
    meta_tbl = _table(
        ["Metric", "Value"],
        [
            ["Generated", meta["generated_at"]],
            ["Date range", f"{rng['start']} to {rng['end']}"],
            ["Transactions", meta["txn_count"]],
            ["Accounts", len(store["accounts"])],
            ["Source files", meta.get("file_count", "")],
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
        + _section("Datastore", meta_tbl, _caveat())
        + _section("Accounts", accounts_tbl)
        + _section("Explore", _quick_links())
    )


def render_growth(store: dict, analytics: dict) -> str:
    """Portfolio balance over time, aggregated per month across accounts."""
    balances = analytics["balances"]
    by_month: dict[str, float] = {}
    for bal in balances:
        by_month[bal["month"]] = by_month.get(bal["month"], 0.0) + bal["balance"]
    chart = svg_bar_chart([(m, by_month[m]) for m in sorted(by_month)])
    rows = [
        [
            bal["account_id"],
            bal["month"],
            _money(bal["balance"], bal["currency"]),
            "approximate" if bal["approximate"] else "exact",
        ]
        for bal in balances
    ]
    tbl = _table(["Account", "Month", "Balance", "Basis"], rows)
    return _section("Portfolio balance by month", chart) + _section(
        "Monthly balances", tbl, _caveat()
    )


def render_contributions(store: dict, analytics: dict) -> str:
    """Registered contributions by year, per-account detail, room, and RESP grants."""
    c = analytics["contributions"]
    chart = svg_bar_chart(
        [(f"{r['group']} {r['year']}", r["total"]) for r in c["by_registered_year"]]
    )
    detail = _table(
        ["Account", "Kind", "Year", "Contributed"],
        [
            [r["account_id"], r["kind"], r["year"], _money(r["total"], r["currency"])]
            for r in c["by_account_year"]
        ],
    )
    blocks = [
        _section("Registered contributions by year", chart),
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
    """Net cash movement per month plus the exact inflow/outflow ledger."""
    flows = analytics["cash_flow"]
    by_month: dict[str, float] = {}
    for flow in flows:
        by_month[flow["month"]] = by_month.get(flow["month"], 0.0) + flow["net"]
    chart = svg_bar_chart([(m, by_month[m]) for m in sorted(by_month)])
    rows = [
        [
            flow["account_id"],
            flow["month"],
            _money(flow["inflow"], flow["currency"]),
            _money(flow["outflow"], flow["currency"]),
            _money(flow["net"], flow["currency"]),
        ]
        for flow in flows
    ]
    tbl = _table(["Account", "Month", "Inflow", "Outflow", "Net"], rows)
    return _section("Net cash flow by month", chart) + _section("Cash movements", tbl, _caveat())


def render_income(store: dict, analytics: dict) -> str:
    """Dividend and interest income, by month and by paying symbol."""
    inc = analytics["income"]
    chart = svg_bar_chart([(r["month"], r["total"]) for r in inc["by_month"]])
    by_month = _table(
        ["Month", "Income"],
        [[r["month"], _money(r["total"], r["currency"])] for r in inc["by_month"]],
    )
    by_symbol = _table(
        ["Symbol", "Income"],
        [[r["symbol"], _money(r["total"], r["currency"])] for r in inc["by_symbol"]],
    )
    return (
        _section("Income by month", chart)
        + _section("By month", by_month)
        + _section("By symbol", by_symbol)
    )


def render_holdings(store: dict, analytics: dict) -> str:
    """Current positions with recorded cost base (market value not implied)."""
    holdings = analytics["holdings"]
    chart = svg_bar_chart([(h["symbol"], h["total_buy_cost"]) for h in holdings])
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
    return _section("Cost base by holding", chart) + _section("Positions", tbl, _caveat())


def render_pages(store: dict, analytics: dict) -> dict[str, str]:
    """Render every analysis page as a full HTML document keyed by filename."""
    foot = _scope(store)
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
