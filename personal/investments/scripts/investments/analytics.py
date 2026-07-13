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


def _cash_flow(store: dict) -> list[dict]:
    """Sum inflows and outflows per account-month-currency, excluding zero-amount noise."""
    flow: dict[tuple[str, str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
    for txn in store["transactions"]:
        if txn["type"] in {"LENDING", "REORG"} or txn["amount"] == 0:
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
        if txn["balance"] is None:
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


def compute_analytics(store: dict) -> dict:
    """Compute all analytic aggregations from a datastore dict."""
    kinds = _kinds(store)
    return {
        "contributions": _contributions(store, kinds),
        "cash_flow": _cash_flow(store),
        "income": _income(store),
        "holdings": _holdings(store),
        "balances": _balances(store),
    }
