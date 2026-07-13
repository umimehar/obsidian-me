"""Assemble parsed, classified, masked rows into a deduplicated datastore dict."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from investments.classify import classify
from investments.mask import (
    Redactions,
    account_code_from_filename,
    detect_kind,
    mask_account_code,
    redact,
)
from investments.parse import SCHEMA_CARD, RawRow, discover_csvs, parse_csv

SCHEMA_VERSION = 1


def _to_float(value: str) -> float | None:
    """Parse a numeric string to float, or None when blank/invalid."""
    text = (value or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _row_to_txn(row: RawRow, account_id: str, red: Redactions) -> dict:
    """Build a JSON-ready transaction dict from a RawRow."""
    is_card = row.schema == SCHEMA_CARD
    date = row.fields["transaction_date"] if is_card else row.fields["date"]
    post_date = row.fields.get("post_date") if is_card else None
    raw_type = row.fields["type"] if is_card else row.fields["transaction"]
    description = row.fields["details"] if is_card else row.fields["description"]
    extracted = classify(row)
    return {
        "account_id": account_id,
        "date": date,
        "post_date": post_date,
        "type": extracted.type,
        "raw_type": raw_type,
        "symbol": extracted.symbol,
        "quantity": extracted.quantity,
        "unit_price": extracted.unit_price,
        "fx_rate": extracted.fx_rate,
        "amount": _to_float(row.fields["amount"]) or 0.0,
        "balance": _to_float(row.fields.get("balance", "")),
        "currency": row.fields.get("currency", ""),
        "description_redacted": redact(description, red),
    }


_KNOWN_OTHER = {"ROC"}


def _collect_warnings(transactions: list[dict]) -> dict:
    """Report raw transaction codes that fell through to OTHER, for triage."""
    unmapped = Counter(
        t["raw_type"]
        for t in transactions
        if t["type"] == "OTHER" and t["raw_type"].strip().upper() not in _KNOWN_OTHER
    )
    return {"unmapped_types": dict(unmapped)}


def build_datastore(source_dir: Path, redactions: Redactions) -> dict:
    """Build the full masked datastore dict from a directory of statement CSVs.

    Every parsed data row is kept; statements do not overlap, so no
    deduplication is applied (see the task note).
    """
    files = discover_csvs(source_dir)
    accounts: dict[str, dict] = {}
    transactions: list[dict] = []
    for path in files:
        account_id = mask_account_code(account_code_from_filename(path.name))
        kind = detect_kind(path.name)
        for row in parse_csv(path):
            txn = _row_to_txn(row, account_id, redactions)
            transactions.append(txn)
            _touch_account(accounts, account_id, kind, txn)
    return {
        "meta": {
            "generated_at": datetime.now(UTC).isoformat(),
            "schema_version": SCHEMA_VERSION,
            "file_count": len(files),
            "txn_count": len(transactions),
            "source_range": _range(transactions),
            "warnings": _collect_warnings(transactions),
        },
        "accounts": sorted(accounts.values(), key=lambda a: a["kind"]),
        "transactions": transactions,
    }


def _touch_account(accounts: dict[str, dict], account_id: str, kind: str, txn: dict) -> None:
    """Create or update the account summary for a transaction."""
    acct = accounts.setdefault(
        account_id,
        {
            "masked_id": account_id,
            "kind": kind,
            "currency": txn["currency"],
            "first_activity": txn["date"],
            "last_activity": txn["date"],
            "txn_count": 0,
        },
    )
    acct["txn_count"] += 1
    acct["first_activity"] = min(acct["first_activity"], txn["date"])
    acct["last_activity"] = max(acct["last_activity"], txn["date"])


def _range(transactions: list[dict]) -> dict:
    """Return the min/max transaction date across the datastore."""
    dates = [t["date"] for t in transactions if t["date"]]
    return {"start": min(dates), "end": max(dates)} if dates else {"start": None, "end": None}
