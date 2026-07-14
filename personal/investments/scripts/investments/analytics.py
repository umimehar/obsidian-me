"""Compute cash-flow, contributions, income, holdings, and balance aggregations."""

from __future__ import annotations

from collections import defaultdict

_REGISTERED_GROUP = {
    "TFSA": "TFSA",
    "ManagedTFSA": "TFSA",
    "FHSA": "FHSA",
    "RRSP": "RRSP",
    "RESP": "RESP",
}
_INCOME_TYPES = {"DIV", "STKDIV", "INT"}

# Wealthsimple reuses the "currency" column to carry the security symbol on
# stock-dividend rows (whose amount is 0 and whose balance is a unit count, not
# cash). Only these are real settlement currencies; anything else is skipped
# from currency-keyed aggregations so tickers never appear as a "currency".
_CASH_CURRENCIES = {"CAD", "USD"}

# Annual context figures. RESP is the CESG-matched annual amount (grant maxes at
# 20% of $2,500), not the $50,000 lifetime contribution limit.
CONTRIBUTION_LIMITS: dict[str, dict[str, float]] = {
    "TFSA": {"2022": 6000.0, "2023": 6500.0, "2024": 7000.0, "2025": 7000.0, "2026": 7000.0},
    "FHSA": {"2023": 8000.0, "2024": 8000.0, "2025": 8000.0, "2026": 8000.0},
    "RRSP": {"2022": 29210.0, "2023": 30780.0, "2024": 31560.0, "2025": 32490.0, "2026": 33810.0},
    "RESP": {"2022": 2500.0, "2023": 2500.0, "2024": 2500.0, "2025": 2500.0, "2026": 2500.0},
}


def _year(date: str) -> int:
    return int(date[:4])


def _month(date: str) -> str:
    return date[:7]


def _kinds(store: dict) -> dict[str, str]:
    return {a["masked_id"]: a["kind"] for a in store["accounts"]}


def _contributions(store: dict, kinds: dict[str, str]) -> dict:
    """Aggregate CONTRIB rows per account-year and per registered group-year, plus RESP grants."""
    per_acct: dict[tuple[str, int, str], float] = defaultdict(float)
    per_group: dict[tuple[str, int], float] = defaultdict(float)
    grants: dict[int, float] = defaultdict(float)
    for txn in store["transactions"]:
        if txn["currency"] not in _CASH_CURRENCIES:
            continue
        year = _year(txn["date"])
        if txn["type"] == "CONTRIB":
            acct, currency = txn["account_id"], txn["currency"]
            per_acct[(acct, year, currency)] += txn["amount"]
            group = _REGISTERED_GROUP.get(kinds.get(acct, ""))
            if group and currency == "CAD":
                per_group[(group, year)] += txn["amount"]
        elif txn["type"] == "GRANT":
            grants[year] += txn["amount"]
    return {
        "by_account_year": [
            {
                "account_id": a,
                "kind": kinds.get(a, "Other"),
                "year": y,
                "currency": c,
                "total": round(v, 2),
            }
            for (a, y, c), v in sorted(per_acct.items())
        ],
        "by_registered_year": [
            {"group": g, "year": y, "total": round(v, 2)} for (g, y), v in sorted(per_group.items())
        ],
        "resp_grants": [{"year": y, "total": round(v, 2)} for y, v in sorted(grants.items())],
        "limits": CONTRIBUTION_LIMITS,
    }


def _cash_flow(store: dict, kinds: dict[str, str]) -> list[dict]:
    """Sum inflows and outflows per account-month-currency, excluding zero-amount noise.

    Credit card accounts use inverted signs (purchase positive, payment negative), so
    their real cash movement shows up as the chequing-side payment instead; the card
    account itself is excluded entirely to avoid counting purchases as inflow.
    """
    flow: dict[tuple[str, str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
    for txn in store["transactions"]:
        if txn["type"] in {"LENDING", "REORG"} or txn["amount"] == 0:
            continue
        if txn["currency"] not in _CASH_CURRENCIES:
            continue
        if kinds.get(txn["account_id"]) == "CreditCard":
            continue
        bucket = flow[(txn["account_id"], _month(txn["date"]), txn["currency"])]
        if txn["amount"] >= 0:
            bucket[0] += txn["amount"]
        else:
            bucket[1] += txn["amount"]
    return [
        {
            "account_id": a,
            "month": m,
            "currency": c,
            "inflow": round(inflow, 2),
            "outflow": round(outflow, 2),
            "net": round(inflow + outflow, 2),
        }
        for (a, m, c), (inflow, outflow) in sorted(flow.items())
    ]


def _income(store: dict) -> dict:
    """Aggregate income by month and by symbol, keyed by currency so totals never mix."""
    by_month: dict[tuple[str, str], float] = defaultdict(float)
    by_symbol: dict[tuple[str, str], float] = defaultdict(float)
    for txn in store["transactions"]:
        if txn["type"] not in _INCOME_TYPES or txn["amount"] <= 0:
            continue
        if txn["currency"] not in _CASH_CURRENCIES:
            continue
        currency = txn["currency"]
        by_month[(_month(txn["date"]), currency)] += txn["amount"]
        by_symbol[(txn["symbol"] or "(cash)", currency)] += txn["amount"]
    return {
        "by_month": [
            {"month": m, "currency": c, "total": round(v, 2)}
            for (m, c), v in sorted(by_month.items())
        ],
        "by_symbol": [
            {"symbol": s, "currency": c, "total": round(v, 2)}
            for (s, c), v in sorted(by_symbol.items(), key=lambda kv: -kv[1])
        ],
    }


def _holdings(store: dict) -> list[dict]:
    """Derive net quantity and buy-side outlay per account-symbol (not adjusted cost base)."""
    qty: dict[tuple[str, str], float] = defaultdict(float)
    cost: dict[tuple[str, str], float] = defaultdict(float)
    currencies: dict[tuple[str, str], str] = {}
    for txn in store["transactions"]:
        symbol = txn["symbol"]
        if not symbol or txn["quantity"] is None:
            continue
        key = (txn["account_id"], symbol)
        currencies.setdefault(key, txn["currency"])
        if txn["type"] in {"BUY", "STKDIV"}:
            qty[key] += txn["quantity"]
            cost[key] += -txn["amount"] if txn["amount"] < 0 else 0.0
        elif txn["type"] == "SELL":
            qty[key] -= txn["quantity"]
    return [
        {
            "account_id": a,
            "symbol": s,
            "quantity": round(qty[(a, s)], 6),
            "total_buy_cost": round(cost[(a, s)], 2),
            "currency": currencies[(a, s)],
        }
        for (a, s) in sorted(qty)
        if round(qty[(a, s)], 6) != 0
    ]


def _balances(store: dict) -> list[dict]:
    """Take the last known balance per account-month; approximate for investment accounts."""
    kinds = _kinds(store)
    exact_kinds = {"Chequing", "Savings", "USD"}
    last: dict[tuple[str, str], tuple[str, float, str]] = {}
    for txn in store["transactions"]:
        if txn["balance"] is None or txn["currency"] not in _CASH_CURRENCIES:
            continue
        key = (txn["account_id"], _month(txn["date"]))
        prev = last.get(key)
        if prev is None or txn["date"] >= prev[0]:
            last[key] = (txn["date"], txn["balance"], txn["currency"])
    return [
        {
            "account_id": a,
            "month": m,
            "balance": round(bal, 2),
            "currency": cur,
            "approximate": kinds.get(a, "") not in exact_kinds,
        }
        for (a, m), (_, bal, cur) in sorted(last.items())
    ]


def _monthly_series(store: dict, kinds: dict[str, str]) -> list[dict]:
    """One compact record per account-month-currency for client-side interactive views.

    Carries the four headline metrics (income, contrib, net cash flow, month-end
    balance) so the pages can re-aggregate by year or month and filter by account
    without re-reading the raw transactions. Credit card accounts are excluded from
    net cash flow for the same reason as _cash_flow.
    """
    acc: dict[tuple[str, str, str], dict[str, float]] = defaultdict(
        lambda: {"income": 0.0, "contrib": 0.0, "net": 0.0}
    )
    bal: dict[tuple[str, str, str], tuple[str, float]] = {}
    for txn in store["transactions"]:
        if txn["currency"] not in _CASH_CURRENCIES:
            continue
        key = (txn["account_id"], _month(txn["date"]), txn["currency"])
        rec = acc[key]
        ttype, amount = txn["type"], txn["amount"]
        if ttype in _INCOME_TYPES and amount > 0:
            rec["income"] += amount
        if ttype == "CONTRIB":
            rec["contrib"] += amount
        if ttype not in {"LENDING", "REORG"} and amount != 0 and kinds.get(key[0]) != "CreditCard":
            rec["net"] += amount
        if txn["balance"] is not None:
            prev = bal.get(key)
            if prev is None or txn["date"] >= prev[0]:
                bal[key] = (txn["date"], txn["balance"])
    return [
        {
            "account_id": a,
            "kind": kinds.get(a, "Other"),
            "currency": c,
            "month": m,
            "income": round(v["income"], 2),
            "contrib": round(v["contrib"], 2),
            "net": round(v["net"], 2),
            "balance": round(bal[(a, m, c)][1], 2) if (a, m, c) in bal else None,
        }
        for (a, m, c), v in sorted(acc.items())
    ]


def _acb_monthly(store: dict) -> dict[tuple[str, str], float]:
    """Running adjusted cost base of held CAD positions per account at each month end."""
    by_acct: dict[str, list[dict]] = defaultdict(list)
    for txn in store["transactions"]:
        if txn["symbol"] and txn["quantity"] is not None and txn["currency"] == "CAD":
            by_acct[txn["account_id"]].append(txn)
    out: dict[tuple[str, str], float] = {}
    for account_id, txns in by_acct.items():
        pos: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])  # symbol -> [qty, cost]
        for txn in sorted(txns, key=lambda t: t["date"]):
            p = pos[txn["symbol"]]
            if txn["type"] in {"BUY", "STKDIV"}:
                p[0] += txn["quantity"]
                p[1] += -txn["amount"] if txn["amount"] < 0 else 0.0
            elif txn["type"] == "SELL" and p[0] > 0:
                avg = p[1] / p[0]
                p[1] -= avg * min(txn["quantity"], p[0])
                p[0] -= txn["quantity"]
            out[(account_id, _month(txn["date"]))] = sum(
                max(c, 0.0) for q, c in pos.values() if q > 1e-9
            )
    return out


def _holdings_acb(store: dict) -> list[dict]:
    """Current CAD positions with adjusted cost base per account and symbol."""
    pos: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
    key_order = sorted(
        (
            t
            for t in store["transactions"]
            if t["symbol"] and t["quantity"] is not None and t["currency"] == "CAD"
        ),
        key=lambda t: t["date"],
    )
    for txn in key_order:
        key = (txn["account_id"], txn["symbol"])
        p = pos[key]
        if txn["type"] in {"BUY", "STKDIV"}:
            p[0] += txn["quantity"]
            p[1] += -txn["amount"] if txn["amount"] < 0 else 0.0
        elif txn["type"] == "SELL" and p[0] > 0:
            avg = p[1] / p[0]
            p[1] -= avg * min(txn["quantity"], p[0])
            p[0] -= txn["quantity"]
    return [
        {"account_id": a, "symbol": s, "qty": round(q, 6), "acb": round(max(c, 0.0), 2)}
        for (a, s), (q, c) in sorted(pos.items())
        if q > 1e-9
    ]


def _ledger_flow(txn: dict, kinds: dict[str, str], r: dict[str, float]) -> None:
    """Fold one CAD transaction into a per-account-month flow record."""
    ttype, amount = txn["type"], txn["amount"]
    if ttype in _INCOME_TYPES and amount > 0:
        r["income"] += amount
    if ttype == "CONTRIB":
        r["contrib"] += amount
    is_flow = ttype not in {"LENDING", "REORG"} and amount != 0
    if is_flow and kinds.get(txn["account_id"]) != "CreditCard":
        if amount >= 0:
            r["inflow"] += amount
        else:
            r["outflow"] += amount


def _ledger(store: dict, kinds: dict[str, str]) -> dict:
    """One compact per-account-month dataset the filter-driven page recomputes from."""
    acb = _acb_monthly(store)
    rec: dict[tuple[str, str], dict[str, float]] = defaultdict(
        lambda: {"contrib": 0.0, "income": 0.0, "inflow": 0.0, "outflow": 0.0}
    )
    cash: dict[tuple[str, str], tuple[str, float]] = {}
    for txn in store["transactions"]:
        if txn["currency"] != "CAD":
            continue
        key = (txn["account_id"], _month(txn["date"]))
        _ledger_flow(txn, kinds, rec[key])
        if txn["balance"] is not None:
            prev = cash.get(key)
            if prev is None or txn["date"] >= prev[0]:
                cash[key] = (txn["date"], txn["balance"])
    months = sorted({m for _, m in rec} | {m for _, m in cash} | {m for _, m in acb})
    series = []
    for (account_id, month), r in sorted(rec.items()):
        series.append(
            {
                "account_id": account_id,
                "month": month,
                "contrib": round(r["contrib"], 2),
                "income": round(r["income"], 2),
                "inflow": round(r["inflow"], 2),
                "outflow": round(r["outflow"], 2),
                "cash": round(cash[(account_id, month)][1], 2)
                if (account_id, month) in cash
                else None,
                "acb": round(acb[(account_id, month)], 2) if (account_id, month) in acb else None,
            }
        )
    return {
        "accounts": [
            {
                "id": a["masked_id"],
                "kind": a["kind"],
                "name": a.get("name", a["kind"]),
                "short_id": a.get("short_id", a["masked_id"][5:9]),
                "currency": a["currency"],
            }
            for a in store["accounts"]
        ],
        "months": months,
        "series": series,
        "holdings": _holdings_acb(store),
        "limits": CONTRIBUTION_LIMITS,
    }


def compute_analytics(store: dict) -> dict:
    """Compute all analytic aggregations from a datastore dict."""
    kinds = _kinds(store)
    return {
        "contributions": _contributions(store, kinds),
        "cash_flow": _cash_flow(store, kinds),
        "income": _income(store),
        "holdings": _holdings(store),
        "balances": _balances(store),
        "monthly_series": _monthly_series(store, kinds),
        "ledger": _ledger(store, kinds),
    }
