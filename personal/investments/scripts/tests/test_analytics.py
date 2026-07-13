from investments.analytics import compute_analytics


def _store(transactions, accounts=None):
    accounts = accounts or [
        {"masked_id": "acct_a", "kind": "TFSA", "currency": "CAD"},
        {"masked_id": "acct_b", "kind": "RESP", "currency": "CAD"},
    ]
    return {"meta": {}, "accounts": accounts, "transactions": transactions}


def _txn(account_id, date, ttype, amount, **kw):
    base = {
        "account_id": account_id,
        "date": date,
        "type": ttype,
        "amount": amount,
        "symbol": kw.get("symbol"),
        "quantity": kw.get("quantity"),
        "unit_price": kw.get("unit_price"),
        "balance": kw.get("balance"),
        "currency": kw.get("currency", "CAD"),
    }
    return base


def test_contributions_by_account_year():
    txns = [
        _txn("acct_a", "2025-03-01", "CONTRIB", 500.0),
        _txn("acct_a", "2025-06-01", "CONTRIB", 250.0),
        _txn("acct_a", "2026-01-01", "CONTRIB", 100.0),
    ]
    out = compute_analytics(_store(txns))
    rows = {(r["year"], r["total"]) for r in out["contributions"]["by_account_year"]}
    assert (2025, 750.0) in rows
    assert (2026, 100.0) in rows


def test_contributions_registered_rollup():
    txns = [_txn("acct_a", "2025-03-01", "CONTRIB", 500.0)]
    out = compute_analytics(_store(txns))
    rollup = {
        (r["group"], r["year"]): r["total"] for r in out["contributions"]["by_registered_year"]
    }
    assert rollup[("TFSA", 2025)] == 500.0


def test_resp_grants_tracked_separately():
    txns = [_txn("acct_b", "2025-05-01", "GRANT", 100.0)]
    out = compute_analytics(_store(txns))
    grants = {r["year"]: r["total"] for r in out["contributions"]["resp_grants"]}
    assert grants[2025] == 100.0


def test_income_by_symbol_and_month():
    txns = [
        _txn("acct_a", "2025-03-01", "DIV", 1.0, symbol="ZAG"),
        _txn("acct_a", "2025-03-15", "DIV", 2.0, symbol="ZAG"),
        _txn("acct_a", "2025-04-01", "INT", 0.5, symbol=None),
    ]
    out = compute_analytics(_store(txns))
    by_symbol = {r["symbol"]: r["total"] for r in out["income"]["by_symbol"]}
    by_month = {(r["month"], r["currency"]): r["total"] for r in out["income"]["by_month"]}
    assert by_symbol["ZAG"] == 3.0
    assert by_month[("2025-03", "CAD")] == 3.0


def test_income_does_not_mix_currencies():
    txns = [
        _txn("acct_a", "2025-03-01", "DIV", 1.0, symbol="ZAG", currency="CAD"),
        _txn("acct_a", "2025-03-02", "DIV", 2.0, symbol="WEC", currency="USD"),
    ]
    out = compute_analytics(_store(txns))
    by_month = {(r["month"], r["currency"]): r["total"] for r in out["income"]["by_month"]}
    assert by_month[("2025-03", "CAD")] == 1.0
    assert by_month[("2025-03", "USD")] == 2.0


def test_holdings_net_quantity_and_total_buy_cost():
    txns = [
        _txn("acct_a", "2025-03-01", "BUY", -60.0, symbol="L", quantity=1.0, unit_price=60.0),
        _txn("acct_a", "2025-04-01", "BUY", -20.0, symbol="L", quantity=0.5, unit_price=40.0),
        _txn("acct_a", "2025-05-01", "SELL", 30.0, symbol="L", quantity=0.5, unit_price=60.0),
    ]
    out = compute_analytics(_store(txns))
    holding = next(h for h in out["holdings"] if h["symbol"] == "L")
    assert holding["quantity"] == 1.0
    assert holding["total_buy_cost"] == 80.0


def test_cash_flow_inflow_outflow():
    txns = [
        _txn("acct_a", "2025-03-01", "CONTRIB", 500.0),
        _txn("acct_a", "2025-03-10", "FEE", -2.0),
    ]
    out = compute_analytics(_store(txns))
    row = next(r for r in out["cash_flow"] if r["month"] == "2025-03")
    assert row["inflow"] == 500.0
    assert row["outflow"] == -2.0
    assert row["net"] == 498.0


def test_cash_flow_excludes_credit_card_account():
    accounts = [
        {"masked_id": "acct_a", "kind": "TFSA", "currency": "CAD"},
        {"masked_id": "acct_card", "kind": "CreditCard", "currency": "CAD"},
    ]
    txns = [
        _txn("acct_card", "2025-03-05", "CARD_PURCHASE", 37.4),
        _txn("acct_card", "2025-03-06", "CARD_PAYMENT", -14.91),
    ]
    out = compute_analytics(_store(txns, accounts=accounts))
    card_rows = [r for r in out["cash_flow"] if r["account_id"] == "acct_card"]
    assert card_rows == []
    assert not any(r["inflow"] == 37.4 for r in out["cash_flow"])


def test_monthly_series_rolls_metrics_per_account_month():
    txns = [
        _txn("acct_a", "2025-03-01", "CONTRIB", 500.0, balance=500.0),
        _txn("acct_a", "2025-03-15", "DIV", 3.0, symbol="ZAG", balance=503.0),
        _txn("acct_a", "2025-04-01", "DIV", 2.0, symbol="ZAG", balance=505.0),
    ]
    series = compute_analytics(_store(txns))["monthly_series"]
    march = next(r for r in series if r["account_id"] == "acct_a" and r["month"] == "2025-03")
    assert march["contrib"] == 500.0
    assert march["income"] == 3.0
    assert march["net"] == 503.0
    assert march["balance"] == 503.0
    assert march["currency"] == "CAD"


def test_monthly_series_excludes_credit_card_from_net():
    accounts = [{"masked_id": "acct_card", "kind": "CreditCard", "currency": "CAD"}]
    txns = [_txn("acct_card", "2025-03-05", "CARD_PURCHASE", 37.4)]
    series = compute_analytics(_store(txns, accounts=accounts))["monthly_series"]
    assert all(r["net"] == 0.0 for r in series)
