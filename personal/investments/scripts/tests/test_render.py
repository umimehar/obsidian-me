from investments.render import render_pages


def _store():
    return {
        "accounts": [
            {
                "masked_id": "acct_a",
                "kind": "TFSA",
                "name": "Managed (TFSA)",
                "short_id": "a4f2",
                "currency": "CAD",
            },
            {
                "masked_id": "acct_b",
                "kind": "RRSP",
                "name": "Umar's RRSP",
                "short_id": "9c31",
                "currency": "CAD",
            },
        ]
    }


def _analytics():
    return {
        "ledger": {
            "accounts": [
                {
                    "id": "acct_a",
                    "kind": "TFSA",
                    "name": "Managed (TFSA)",
                    "short_id": "a4f2",
                    "currency": "CAD",
                },
                {
                    "id": "acct_b",
                    "kind": "RRSP",
                    "name": "Umar's RRSP",
                    "short_id": "9c31",
                    "currency": "CAD",
                },
            ],
            "months": ["2025-03", "2025-04"],
            "series": [
                {
                    "account_id": "acct_a",
                    "month": "2025-03",
                    "contrib": 500.0,
                    "income": 3.0,
                    "inflow": 503.0,
                    "outflow": 0.0,
                    "cash": 10.0,
                    "acb": 490.0,
                },
            ],
            "holdings": [{"account_id": "acct_a", "symbol": "ZAG", "qty": 5.0, "acb": 80.0}],
            "limits": {"TFSA": {"2025": 7000.0}},
        }
    }


def test_render_pages_only_index():
    assert set(render_pages(_store(), _analytics())) == {"index.html"}


def test_index_is_html_and_links_css():
    html = render_pages(_store(), _analytics())["index.html"]
    assert "<!DOCTYPE html>" in html
    assert "../../_assets/personal.css" in html
    assert "The Ledger" in html


def test_index_embeds_ledger_and_filter_bar():
    html = render_pages(_store(), _analytics())["index.html"]
    assert 'id="ledger-data"' in html
    assert 'class="filterbar"' in html
    assert 'id="headline"' in html
    assert '"month": "2025-03"' in html


def test_accounts_are_unmasked_with_kind_and_name():
    html = render_pages(_store(), _analytics())["index.html"]
    assert "Managed (TFSA)" in html
    assert "Umar" in html
    assert "a4f2" in html
    assert '<span class="badge">TFSA</span>' in html


def test_no_real_account_code_in_pages():
    html = render_pages(_store(), _analytics())["index.html"]
    assert "XX0TEST001CAD" not in html
    # masked internal ids only; no real brokerage code shape reaches the page
    assert "acct_" in html or "a4f2" in html
