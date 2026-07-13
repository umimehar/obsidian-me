"""Render the masked datastore and analytics into self-contained offline HTML.

"The Ledger": a classical broadsheet dashboard adapted from the imported Claude
Design "classical" system. index.html is the full dashboard (masthead, hero
figures, contributions chart, accounts and contribution room, allocation donut,
twelve-month contributions, holdings). The other pages are interactive
deep-dives. Every page is one offline document: self-hosted fonts, inline SVG,
inline vanilla JavaScript, no network at view time.

The statements record contributions, income, cash balances and cost basis, not
live market value; figures are labelled accordingly and never imply a market
quote.
"""

import math
from collections import defaultdict
from html import escape as _std_escape
from json import dumps as _json_dumps
from pathlib import Path

CSS_HREF = "../../_assets/personal.css"

NAV = (
    ("index.html", "The Ledger"),
    ("growth.html", "Balances"),
    ("contributions.html", "Contributions"),
    ("cash-flow.html", "Cash flow"),
    ("income.html", "Income"),
    ("holdings.html", "Holdings"),
)

CAVEAT = (
    "These statements record contributions, income, cash balances and cost "
    "basis. Live market value is not tracked, so figures are stated at cost or "
    "as cash on hand, never as a market quote."
)

_REGISTERED = {
    "TFSA": "TFSA",
    "ManagedTFSA": "TFSA",
    "FHSA": "FHSA",
    "RRSP": "RRSP",
    "RESP": "RESP",
}
_GROUP_ORDER = ["TFSA", "FHSA", "RRSP", "RESP", "Non-registered"]
_ALLOC_COLORS = [
    "var(--color-accent-700)",
    "var(--color-accent-500)",
    "var(--color-accent)",
    "var(--color-neutral-500)",
    "var(--color-neutral-300)",
]
_LIMIT_TYPES = ("TFSA", "FHSA", "RRSP", "RESP")

_EXPLORER_JS = (Path(__file__).parent / "explorer.js").read_text(encoding="utf-8")
_LEDGER_JS = (Path(__file__).parent / "ledger.js").read_text(encoding="utf-8")


def _html_escape(text: object) -> str:
    """Escape any user-derived value for safe inclusion in HTML text or attributes."""
    return _std_escape(str(text), quote=True)


def _money(value: float) -> str:
    """Format a whole-dollar amount with a thousands separator and no cents."""
    return f"{'-' if value < 0 else ''}${abs(round(value)):,}"


def _compact(value: float) -> str:
    """Format an amount compactly ($1.2M, $45K) for tight display."""
    n, sign = abs(value), "-" if value < 0 else ""
    if n >= 1_000_000:
        return f"{sign}${n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{sign}${n / 1_000:.0f}K"
    return f"{sign}${n:.0f}"


def _group_of(kind: str) -> str:
    """Map an account kind to its dashboard group."""
    return _REGISTERED.get(kind, "Non-registered")


def _latest_cad_balance(analytics: dict) -> dict[str, float]:
    """Latest month-end CAD cash balance per account."""
    latest: dict[str, tuple[str, float]] = {}
    for b in analytics["balances"]:
        if b["currency"] != "CAD":
            continue
        prev = latest.get(b["account_id"])
        if prev is None or b["month"] > prev[0]:
            latest[b["account_id"]] = (b["month"], b["balance"])
    return {acct: bal for acct, (_, bal) in latest.items()}


def _income_by_year(analytics: dict) -> dict[int, float]:
    """Total CAD dividend and interest income per calendar year."""
    out: dict[int, float] = defaultdict(float)
    for r in analytics["income"]["by_month"]:
        if r["currency"] == "CAD":
            out[int(r["month"][:4])] += r["total"]
    return out


def _contrib_by_group(analytics: dict) -> tuple[dict[str, float], dict[tuple[str, int], float]]:
    """CAD contributions per group (all time) and per (group, year)."""
    total: dict[str, float] = defaultdict(float)
    per_year: dict[tuple[str, int], float] = defaultdict(float)
    for r in analytics["contributions"]["by_account_year"]:
        if r["currency"] != "CAD":
            continue
        g = _group_of(r["kind"])
        total[g] += r["total"]
        per_year[(g, r["year"])] += r["total"]
    return total, per_year


def _cumulative_contrib_series(analytics: dict) -> list[dict]:
    """Running CAD contribution total by month, for the dashboard chart."""
    per_month: dict[str, float] = defaultdict(float)
    for s in analytics.get("monthly_series", []):
        if s["currency"] == "CAD" and s["contrib"]:
            per_month[s["month"]] += s["contrib"]
    running = 0.0
    out = []
    for month in sorted(per_month):
        running += per_month[month]
        out.append({"m": month, "v": round(running, 2)})
    return out


def _contrib_12mo(analytics: dict) -> list[dict]:
    """Monthly CAD contributions over the trailing twelve months of data."""
    per_month: dict[str, float] = defaultdict(float)
    for s in analytics.get("monthly_series", []):
        if s["currency"] == "CAD":
            per_month[s["month"]] += s["contrib"]
    months = sorted(per_month)[-12:]
    peak = max((per_month[m] for m in months), default=0.0) or 1.0
    return [
        {"m": m[5:], "pct": round(per_month[m] / peak * 100, 1), "val": per_month[m]}
        for m in months
    ]


def _account_label(account: dict) -> str:
    """Short label for an account: kind plus a masked id tail."""
    return f"{account['kind']} · {account['masked_id'][5:11]}"


def _build_groups(store: dict, analytics: dict) -> list[dict]:
    """Assemble the accounts-and-contribution-room groups with real figures."""
    balances = _latest_cad_balance(analytics)
    _, contrib_year = _contrib_by_group(analytics)
    limits = analytics["contributions"]["limits"]
    years = [int(r["month"][:4]) for r in analytics["income"]["by_month"]] or [0]
    cur_year = max(years) if years else 0
    buckets: dict[str, list[dict]] = defaultdict(list)
    for a in store["accounts"]:
        if a["currency"] != "CAD":
            continue
        buckets[_group_of(a["kind"])].append(a)
    groups = []
    for g in _GROUP_ORDER:
        accts = buckets.get(g, [])
        if not accts:
            continue
        bal = sum(balances.get(a["masked_id"], 0.0) for a in accts)
        limit = limits.get(g, {}).get(str(cur_year)) if g in _LIMIT_TYPES else None
        used = contrib_year.get((g, cur_year), 0.0)
        groups.append(
            {
                "type": g,
                "count": len(accts),
                "balance": bal,
                "limit": limit,
                "used": used,
                "year": cur_year,
                "accounts": [
                    {
                        "name": _account_label(a),
                        "inst": a["currency"],
                        "balance": balances.get(a["masked_id"], 0.0),
                    }
                    for a in accts
                ],
            }
        )
    return groups


def _svg_donut(slices: list[dict]) -> str:
    """Return donut arc paths for allocation slices with pct and color."""
    r, cx, cy, tau, ang = 42, 60, 60, math.tau, -math.pi / 2
    parts = [
        '<circle cx="60" cy="60" r="42" fill="none" '
        'stroke="var(--color-neutral-200)" stroke-width="13"></circle>'
    ]
    for s in slices:
        frac = s["pct"] / 100
        a1 = ang + frac * tau
        x0, y0 = cx + r * math.cos(ang), cy + r * math.sin(ang)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        large = 1 if frac > 0.5 else 0
        if frac > 0.0001:
            parts.append(
                f'<path d="M {x0:.2f} {y0:.2f} A {r} {r} 0 {large} 1 {x1:.2f} {y1:.2f}" '
                f'fill="none" stroke="{s["color"]}" stroke-width="13"></path>'
            )
        ang = a1
    return (
        '<svg viewBox="0 0 120 120" width="164" height="164" role="img" '
        f'aria-label="Contribution allocation">{"".join(parts)}</svg>'
    )


def _masthead(active: str) -> str:
    """Newspaper masthead, dateline, and section nav shared by every page."""
    nav = "".join(
        f'<a href="{href}" class="nav-link{" active" if href == active else ""}">'
        f"{_html_escape(label)}</a>"
        for href, label in NAV
    )
    return (
        '<header class="masthead">'
        '<div class="masthead-kicker">Personal Finance · Household Edition</div>'
        '<h1 class="masthead-title">The Ledger</h1></header>'
        '<div class="dateline"><span>Private Records</span>'
        '<span class="reviewed">Portfolio report</span>'
        "<span>Stated at cost</span></div>"
        f'<nav class="nav" aria-label="Sections">{nav}</nav>'
    )


def _scope(store: dict) -> str:
    """Footer caption naming the masked accounts every page draws from."""
    tags = ", ".join(
        f"{_html_escape(a['masked_id'])} ({_html_escape(a['kind'])}, {_html_escape(a['currency'])})"
        for a in store["accounts"]
    )
    return f'<footer class="scope">Drawn from: {tags or "no accounts"}</footer>'


def _page(title: str, active: str, body: str, foot: str = "") -> str:
    """Wrap a body in the full offline document shell."""
    return (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{_html_escape(title)} — The Ledger</title>\n"
        f'<link rel="stylesheet" href="{CSS_HREF}">\n</head>\n<body>\n'
        f'{_masthead(active)}<main class="page">{body}</main>{foot}\n</body>\n</html>\n'
    )


def _hint(text: str) -> str:
    """A small info marker that reveals an explanation on hover."""
    return (
        f'<span class="hint" tabindex="0" role="note" aria-label="{_html_escape(text)}">i'
        f'<span class="hint-bubble">{_html_escape(text)}</span></span>'
    )


def _hero(model: dict) -> str:
    """The masthead hero: lead figure plus three supporting metrics."""
    m = model
    contrib_pct = round(m["contrib_used"] / m["room"] * 100) if m["room"] else 0
    div_up = m["div_year"] >= m["div_prev"]
    div_delta = (
        f"{'▲' if div_up else '▼'} {_money(abs(m['div_year'] - m['div_prev']))} vs {m['year'] - 1}"
    )
    return (
        '<section class="hero cl-rise">'
        '<div><div class="hero-lead-label">Contributed to date</div>'
        f'<div class="hero-lead-value">{_money(m["contrib_total"])}</div>'
        '<p class="hero-lead-note">Total deposits across TFSA, RRSP, FHSA, RESP and '
        "non-registered accounts. These statements record contributions and cash, not "
        "live market value.</p></div>"
        '<div class="hero-metric"><div class="hero-metric-label">Income to date'
        f"{_hint('Dividends, interest and distributions received in cash, all years, CAD.')}"
        f'</div><div class="hero-metric-value">{_money(m["income_total"])}</div>'
        f'<div class="hero-metric-sub pos">from dividends &amp; interest</div></div>'
        f'<div class="hero-metric"><div class="hero-metric-label">Contributed {m["year"]}</div>'
        f'<div class="hero-metric-value">{_money(m["contrib_used"])}</div>'
        f'<div class="meter"><span style="width:{min(contrib_pct, 100)}%"></span></div>'
        f'<div class="hero-metric-foot">{contrib_pct}% of {_money(m["room"])} '
        "annual room</div></div>"
        f'<div class="hero-metric"><div class="hero-metric-label">Dividends {m["year"]}</div>'
        f'<div class="hero-metric-value">{_money(m["div_year"])}</div>'
        f'<div class="hero-metric-sub {"pos" if div_up else "neg"}">{div_delta}</div></div>'
        "</section>"
    )


def _chart_section(model: dict) -> str:
    """Interactive cumulative-contributions chart driven by ledger.js."""
    return (
        '<section class="section"><div class="section-head">'
        '<div><h2 class="section-title">Cumulative contributions</h2>'
        '<p class="section-note">Running total of deposits over time. Not market value.</p>'
        '</div><div class="seg" id="ld-tf" role="group" aria-label="Timeframe">'
        '<button type="button" class="seg-btn" data-tf="12">1Y</button>'
        '<button type="button" class="seg-btn" data-tf="60">5Y</button>'
        '<button type="button" class="seg-btn on" data-tf="0">All</button></div></div>'
        '<div class="chartbox" id="ld-chart"><div class="ex-tip" id="ld-tip"></div>'
        '<div class="chart-ymax" id="ld-ymax"></div><div class="chart-ymin" id="ld-ymin"></div>'
        "</div></section>"
    )


def _accounts_section(model: dict) -> str:
    """Accounts grouped by type with a contribution-room meter each."""
    cards = []
    for g in model["groups"]:
        rows = "".join(
            f'<div class="acct-row"><span>{_html_escape(a["name"])} '
            f'<span class="inst">· {_html_escape(a["inst"])}</span></span>'
            f'<span class="val">{_money(a["balance"])}</span></div>'
            for a in g["accounts"]
        )
        if g["limit"]:
            pct = min(100, round(g["used"] / g["limit"] * 100))
            room = (
                f'<div><div class="room-meter"><span style="width:{pct}%"></span></div>'
                '<div class="room-legend">'
                f'<span class="left">{_money(g["used"])} used · {pct}%</span>'
                f"<span>{_money(g['limit'] - g['used'])} room left</span></div></div>"
            )
        else:
            room = '<div class="acct-noroom">Non-registered — no contribution limit</div>'
        cards.append(
            '<div class="card"><div class="acct-head"><div>'
            f'<div class="acct-type">{_html_escape(g["type"])}</div>'
            f'<div class="acct-count">{g["count"]} account{"s" if g["count"] != 1 else ""}</div>'
            f'</div><div class="acct-bal">{_money(g["balance"])}</div></div>'
            f'{room}<div class="acct-rows">{rows}</div></div>'
        )
    return (
        '<section class="section"><div class="section-head"><div>'
        '<h2 class="section-title">Accounts &amp; contribution room</h2>'
        '<p class="section-note">Cash on hand by account; registered room shown for '
        f"{model['year']}.</p></div></div>"
        f'<div class="acct-list">{"".join(cards)}</div></section>'
    )


def _allocation_section(model: dict) -> str:
    """Donut of contributions by group with a legend."""
    legend = "".join(
        f'<div class="alloc-item"><span class="swatch" style="background:{s["color"]}"></span>'
        f'<span class="name">{_html_escape(s["label"])}</span>'
        f'<span class="pct num">{s["pct"]}%</span></div>'
        for s in model["alloc"]
    )
    return (
        '<section class="section"><div class="section-head"><div>'
        '<h2 class="section-title">Contribution allocation</h2>'
        '<p class="section-note">Share of lifetime contributions by account type.</p>'
        '</div></div><div class="alloc"><div class="donut-wrap">'
        f'{_svg_donut(model["alloc"])}<div class="donut-center">'
        f'<div class="big num">{_compact(model["contrib_total"])}</div>'
        '<div class="lbl">contributed</div></div></div>'
        f'<div class="alloc-legend">{legend}</div></div></section>'
    )


def _contrib_bars_section(model: dict) -> str:
    """Twelve-month contributions bar strip."""
    bars = "".join(
        f'<div class="contrib-bar"><div class="bar" style="height:{b["pct"]}%"></div>'
        f'<span class="m">{_html_escape(b["m"])}</span></div>'
        for b in model["contrib12"]
    )
    return (
        '<section class="section"><div class="section-head"><div>'
        '<h2 class="section-title">Contributions · 12 months</h2></div></div>'
        f'<div class="contrib-bars">{bars}</div></section>'
    )


def _holdings_section(model: dict) -> str:
    """Holdings table at cost basis with an account filter (top positions)."""
    top = model["holdings"][:30]
    kinds = sorted({h["kind"] for h in top})
    seg = '<button type="button" class="seg-btn on" data-hk="all">All</button>' + "".join(
        f'<button type="button" class="seg-btn" data-hk="{_html_escape(k)}">'
        f"{_html_escape(k)}</button>"
        for k in kinds
    )
    rows = "".join(
        f'<tr data-hk="{_html_escape(h["kind"])}">'
        f"<td><strong>{_html_escape(h['symbol'])}</strong></td>"
        f"<td>{_html_escape(h['kind'])}</td>"
        f'<td class="num">{h["shares"]}</td>'
        f'<td class="num">{_money(h["cost"])}</td>'
        f'<td class="num">{h["weight"]}%</td></tr>'
        for h in top
    )
    more = len(model["holdings"]) - len(top)
    more_note = (
        f'<span>Top {len(top)} of {len(model["holdings"])} positions · '
        '<a href="holdings.html">see all</a></span>'
        if more > 0
        else ""
    )
    return (
        '<section class="section"><div class="section-head">'
        '<h2 class="section-title">Holdings at cost</h2>'
        '<div class="seg" id="ld-hk" role="group" aria-label="Account">' + seg + "</div></div>"
        '<div class="table-wrap"><table class="table"><thead><tr>'
        '<th>Security</th><th>Account</th><th class="num">Shares</th>'
        '<th class="num">Buy cost</th><th class="num">Weight</th></tr></thead>'
        f'<tbody id="ld-holdings">{rows}</tbody></table></div>'
        f'<div class="table-foot">{more_note}<span>Total buy cost '
        f'<strong>{_money(model["cost_total"])}</strong></span></div>'
        f'<p class="caveat">{_html_escape(CAVEAT)}</p></section>'
    )


def _dashboard_model(store: dict, analytics: dict) -> dict:
    """Derive every real figure the dashboard needs from the datastore analytics."""
    contrib_total_by_group, _ = _contrib_by_group(analytics)
    contrib_total = sum(contrib_total_by_group.values())
    income_year = _income_by_year(analytics)
    year = max(income_year) if income_year else 0
    groups = _build_groups(store, analytics)
    limits = analytics["contributions"]["limits"]
    room = sum(limits.get(t, {}).get(str(year), 0.0) for t in _LIMIT_TYPES)
    contrib_used = sum(g["used"] for g in groups)
    alloc = [
        {
            "label": g,
            "pct": round(v / contrib_total * 100) if contrib_total else 0,
            "color": _ALLOC_COLORS[i % len(_ALLOC_COLORS)],
        }
        for i, (g, v) in enumerate(sorted(contrib_total_by_group.items(), key=lambda kv: -kv[1]))
    ]
    kinds = {a["masked_id"]: a["kind"] for a in store["accounts"]}
    cost_total = sum(h["total_buy_cost"] for h in analytics["holdings"] if h["currency"] == "CAD")
    holdings = sorted(
        (
            {
                "symbol": h["symbol"],
                "kind": kinds.get(h["account_id"], "Other"),
                "shares": f"{h['quantity']:g}",
                "cost": h["total_buy_cost"],
                "weight": round(h["total_buy_cost"] / cost_total * 100) if cost_total else 0,
            }
            for h in analytics["holdings"]
            if h["currency"] == "CAD"
        ),
        key=lambda h: -h["cost"],
    )
    return {
        "year": year,
        "contrib_total": contrib_total,
        "income_total": sum(income_year.values()),
        "contrib_used": contrib_used,
        "room": room,
        "div_year": income_year.get(year, 0.0),
        "div_prev": income_year.get(year - 1, 0.0),
        "groups": groups,
        "alloc": alloc,
        "contrib12": _contrib_12mo(analytics),
        "holdings": holdings,
        "cost_total": cost_total,
        "chart": _cumulative_contrib_series(analytics),
    }


def render_index(store: dict, analytics: dict) -> str:
    """The Ledger dashboard: hero figures, chart, accounts, allocation, holdings."""
    model = _dashboard_model(store, analytics)
    data = _json_dumps({"chart": model["chart"]})
    body = (
        _hero(model)
        + '<div class="hr mt-rule"></div>'
        + _chart_section(model)
        + '<div class="hr mt-rule"></div>'
        + _accounts_section(model)
        + '<div class="hr mt-rule"></div>'
        + '<div class="dash-cols">'
        + _allocation_section(model)
        + _contrib_bars_section(model)
        + "</div>"
        + '<div class="hr mt-rule"></div>'
        + _holdings_section(model)
    )
    foot = (
        _scope(store)
        + f'<script type="application/json" id="ledger-data">{data}</script>'
        + f"<script>{_LEDGER_JS}</script>"
    )
    return _page("The Ledger", "index.html", body, foot)


# --- Interactive deep-dive sub-pages ---------------------------------------


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
            f'rx="4" fill="none" stroke="var(--chart-grid)"/>'
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
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{bar_h:.1f}" '
            f'rx="2" fill="var(--color-accent)"><title>{_html_escape(label)}: '
            f"{_html_escape(f'{value:,.2f}')}</title></rect>"
        )
        parts.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{baseline + 18:.1f}" text-anchor="middle" '
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
        f'<div class="table-wrap"><table class="table"><thead><tr>{head}</tr></thead>'
        f"<tbody>{body}</tbody></table></div>"
    )


def _section(title: str, *blocks: str, note: str = "") -> str:
    """A plain classical section: heading, optional note, then content."""
    note_html = f'<p class="section-note">{_html_escape(note)}</p>' if note else ""
    return (
        f'<section class="section"><div class="section-head"><div>'
        f'<h2 class="section-title">{_html_escape(title)}</h2>{note_html}</div></div>'
        f"{''.join(blocks)}</section>"
    )


_METRIC_EXPLAIN = {
    "balance": (
        "Cash balance",
        "Month-end cash held across the selected accounts. Exact for cash accounts; "
        "approximate for investment accounts (statements record cash, not market value).",
    ),
    "contrib": (
        "Contributions",
        "Deposits coded as contributions. Internal transfers between your own accounts "
        "are not counted, so registered room usage is not overstated.",
    ),
    "income": ("Income", "Dividends, interest, and distributions received in cash."),
    "net": (
        "Net cash flow",
        "Money in minus money out for the period. Card purchases and payments, plus "
        "zero-amount securities-lending entries, are excluded.",
    ),
}


def _explorer(
    title: str, metric: str, agg: str, ctype: str, color: str, accounts: list[dict]
) -> str:
    """Interactive controls plus mount points; explorer.js fills the chart and figures."""
    label, explain = _METRIC_EXPLAIN.get(metric, (title, ""))
    chips = '<button type="button" class="chip on" data-id="all">All accounts</button>' + "".join(
        f'<button type="button" class="chip" data-id="{_html_escape(a["masked_id"])}">'
        f"{_html_escape(_account_label(a))}</button>"
        for a in accounts
    )
    controls = (
        '<div class="ex-controls"><div class="seg ex-seg" role="group" aria-label="Period">'
        '<button type="button" class="seg-btn on" data-period="year">Year</button>'
        '<button type="button" class="seg-btn" data-period="month">Month</button></div>'
        '<div class="seg ex-cur" role="group" aria-label="Currency"></div></div>'
        f'<div class="chips ex-chips" role="group" aria-label="Accounts">{chips}</div>'
    )
    return (
        f'<section class="section explorer" data-metric="{metric}" data-agg="{agg}" '
        f'data-type="{ctype}" data-color="{color}" data-label="{_html_escape(label)}" '
        f'data-explain="{_html_escape(explain)}"><div class="section-head"><div>'
        f'<h2 class="section-title">{_html_escape(title)}</h2>'
        f'<p class="section-note">{_html_escape(explain)}</p></div></div>{controls}'
        '<div class="ex-kpis"></div><div class="ex-chart"><div class="ex-tip"></div></div>'
        "</section>"
    )


def render_growth(store: dict, analytics: dict) -> str:
    """Interactive cash balance plus the exact monthly balance ledger."""
    balances = analytics["balances"]
    explorer = _explorer("Cash balance", "balance", "last", "area", "balance", store["accounts"])
    rows = [
        [
            b["account_id"],
            b["month"],
            _money(b["balance"]) + f" {b['currency']}",
            "approximate" if b["approximate"] else "exact",
        ]
        for b in balances
    ]
    return (
        explorer
        + '<div class="hr mt-rule"></div>'
        + _section("Monthly balances", _table(["Account", "Month", "Balance", "Basis"], rows))
    )


def render_contributions(store: dict, analytics: dict) -> str:
    """Interactive contributions plus registered rollups, room, and RESP grants."""
    c = analytics["contributions"]
    explorer = _explorer("Contributions", "contrib", "sum", "bar", "contrib", store["accounts"])
    detail = _table(
        ["Account", "Kind", "Year", "Contributed"],
        [
            [r["account_id"], r["kind"], r["year"], _money(r["total"]) + f" {r['currency']}"]
            for r in c["by_account_year"]
        ],
    )
    registered = _table(
        ["Group", "Year", "Contributed"],
        [[r["group"], r["year"], _money(r["total"])] for r in c["by_registered_year"]],
    )
    blocks = [
        explorer,
        '<div class="hr mt-rule"></div>',
        _section("Registered accounts by year", registered),
        _section("Contributions by account", detail),
    ]
    limit_rows = [[k, y, _money(v)] for k, ys in c["limits"].items() for y, v in ys.items()]
    if limit_rows:
        blocks.append(
            _section("Annual contribution room", _table(["Kind", "Year", "Limit"], limit_rows))
        )
    if c["resp_grants"]:
        blocks.append(
            _section(
                "RESP grants",
                _table(
                    ["Year", "Grant"], [[g["year"], _money(g["total"])] for g in c["resp_grants"]]
                ),
            )
        )
    return "".join(blocks)


def render_cash_flow(store: dict, analytics: dict) -> str:
    """Interactive net cash flow plus the exact inflow/outflow ledger."""
    flows = analytics["cash_flow"]
    explorer = _explorer("Net cash flow", "net", "sum", "bar", "net", store["accounts"])
    rows = [
        [
            f["account_id"],
            f["month"],
            _money(f["inflow"]) + f" {f['currency']}",
            _money(f["outflow"]),
            _money(f["net"]),
        ]
        for f in flows
    ]
    return (
        explorer
        + '<div class="hr mt-rule"></div>'
        + _section("Cash movements", _table(["Account", "Month", "Inflow", "Outflow", "Net"], rows))
    )


def render_income(store: dict, analytics: dict) -> str:
    """Interactive income by period plus by-month and by-symbol ledgers."""
    inc = analytics["income"]
    explorer = _explorer("Investment income", "income", "sum", "bar", "income", store["accounts"])
    by_month = _table(
        ["Month", "Income"],
        [[r["month"], _money(r["total"]) + f" {r['currency']}"] for r in inc["by_month"]],
    )
    by_symbol = _table(
        ["Symbol", "Income"],
        [[r["symbol"], _money(r["total"]) + f" {r['currency']}"] for r in inc["by_symbol"]],
    )
    return (
        explorer
        + '<div class="hr mt-rule"></div>'
        + _section("By month", by_month)
        + _section("By paying security", by_symbol)
    )


def render_holdings(store: dict, analytics: dict) -> str:
    """Holdings at cost with a top-positions chart."""
    holdings = analytics["holdings"]
    cost_total = sum(h["total_buy_cost"] for h in holdings) or 1.0
    top = sorted(holdings, key=lambda h: -h["total_buy_cost"])[:14]
    chart = svg_bar_chart([(h["symbol"], h["total_buy_cost"]) for h in top])
    rows = [
        [
            h["account_id"],
            h["symbol"],
            f"{h['quantity']:g}",
            _money(h["total_buy_cost"]) + f" {h['currency']}",
            f"{round(h['total_buy_cost'] / cost_total * 100)}%",
        ]
        for h in sorted(holdings, key=lambda h: -h["total_buy_cost"])
    ]
    tbl = _table(["Account", "Symbol", "Shares", "Buy cost", "Weight"], rows)
    return (
        _section("Cost base by holding", chart, note="Top positions by recorded buy cost.")
        + _section("Positions", tbl)
        + f'<p class="caveat">{_html_escape(CAVEAT)}</p>'
    )


def render_pages(store: dict, analytics: dict) -> dict[str, str]:
    """Render every page as a full offline HTML document keyed by filename."""
    data = _json_dumps(
        {
            "accounts": [
                {"account_id": a["masked_id"], "kind": a["kind"], "currency": a["currency"]}
                for a in store["accounts"]
            ],
            "series": analytics.get("monthly_series", []),
        }
    )
    sub_foot = (
        _scope(store)
        + f'<script type="application/json" id="ex-data">{data}</script>'
        + f"<script>{_EXPLORER_JS}</script>"
    )

    def sub(title: str, active: str, body: str) -> str:
        return _page(title, active, body, sub_foot)

    return {
        "index.html": render_index(store, analytics),
        "growth.html": sub("Balances", "growth.html", render_growth(store, analytics)),
        "contributions.html": sub(
            "Contributions", "contributions.html", render_contributions(store, analytics)
        ),
        "cash-flow.html": sub("Cash flow", "cash-flow.html", render_cash_flow(store, analytics)),
        "income.html": sub("Income", "income.html", render_income(store, analytics)),
        "holdings.html": sub("Holdings", "holdings.html", render_holdings(store, analytics)),
    }
