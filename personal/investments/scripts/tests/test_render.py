from investments.render import render_pages, svg_bar_chart


def _analytics():
    return {
        "contributions": {
            "by_account_year": [
                {
                    "account_id": "acct_a",
                    "kind": "TFSA",
                    "year": 2025,
                    "currency": "CAD",
                    "total": 750.0,
                }
            ],
            "by_registered_year": [{"group": "TFSA", "year": 2025, "total": 750.0}],
            "resp_grants": [],
            "limits": {"TFSA": {"2025": 7000.0}},
        },
        "cash_flow": [
            {
                "account_id": "acct_a",
                "month": "2025-03",
                "currency": "CAD",
                "inflow": 500.0,
                "outflow": -2.0,
                "net": 498.0,
            }
        ],
        "income": {
            "by_month": [{"month": "2025-03", "currency": "CAD", "total": 3.0}],
            "by_symbol": [{"symbol": "ZAG", "currency": "CAD", "total": 3.0}],
        },
        "holdings": [
            {
                "account_id": "acct_a",
                "symbol": "L",
                "quantity": 1.0,
                "total_buy_cost": 80.0,
                "currency": "CAD",
            }
        ],
        "balances": [
            {
                "account_id": "acct_a",
                "month": "2025-03",
                "balance": 498.0,
                "currency": "CAD",
                "approximate": True,
            }
        ],
    }


def _store():
    return {
        "meta": {
            "generated_at": "2026-07-13T00:00:00Z",
            "txn_count": 1,
            "file_count": 1,
            "source_range": {"start": "2025-03-01", "end": "2025-03-10"},
        },
        "accounts": [
            {
                "masked_id": "acct_a",
                "kind": "TFSA",
                "currency": "CAD",
                "first_activity": "2025-03-01",
                "last_activity": "2025-03-10",
                "txn_count": 1,
            }
        ],
        "transactions": [],
    }


def test_svg_bar_chart_is_svg():
    out = svg_bar_chart([("2025", 750.0), ("2026", 100.0)])
    assert out.startswith("<svg")
    assert out.rstrip().endswith("</svg>")
    assert "<rect" in out


def test_svg_bar_chart_empty_series():
    out = svg_bar_chart([])
    assert out.startswith("<svg")


def test_render_pages_returns_all_pages():
    pages = render_pages(_store(), _analytics())
    assert set(pages) == {
        "index.html",
        "growth.html",
        "contributions.html",
        "cash-flow.html",
        "income.html",
        "holdings.html",
    }


def test_pages_link_shared_css_and_are_html():
    pages = render_pages(_store(), _analytics())
    for html in pages.values():
        assert "<!DOCTYPE html>" in html
        assert "../../_assets/personal.css" in html


def test_contributions_page_shows_values():
    pages = render_pages(_store(), _analytics())
    assert "750" in pages["contributions.html"]
    assert "TFSA" in pages["contributions.html"]


def test_no_real_account_code_in_pages():
    pages = render_pages(_store(), _analytics())
    for html in pages.values():
        assert "acct_a" in html or "TFSA" in html
        assert "XX0TEST001CAD" not in html
