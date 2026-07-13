"""Normalize raw transaction codes and extract structured fields from descriptions."""

from __future__ import annotations

import re
from dataclasses import dataclass

from investments.parse import SCHEMA_CARD, RawRow

_TYPE_MAP: dict[str, str] = {
    "BUY": "BUY",
    "SELL": "SELL",
    "DIV": "DIV",
    "STKDIV": "STKDIV",
    "INT": "INT",
    "FPLINT": "INT",
    "FEE": "FEE",
    "NRT": "TAX",
    "CONT": "CONTRIB",
    "GRANT": "GRANT",
    "TRFIN": "TRANSFER_IN",
    "TRFINTF": "TRANSFER_IN",
    "E_TRFIN": "TRANSFER_IN",
    "AFT_IN": "TRANSFER_IN",
    "TRFOUT": "TRANSFER_OUT",
    "TRFOUTTF": "TRANSFER_OUT",
    "E_TRFOUT": "TRANSFER_OUT",
    "FXCONVERSION": "FX",
    "LOAN": "LENDING",
    "RECALL": "LENDING",
    "STKREORG": "REORG",
    "CASHBACK": "REWARD",
    "REIMB": "REWARD",
    "REFER": "REWARD",
    "GIVEAWAY": "REWARD",
    "AFFILIATE": "REWARD",
    "SPEND": "CARD_PURCHASE",
    "DEP": "TRANSFER_IN",
    "P2P_SENT": "TRANSFER_OUT",
    "ROC": "OTHER",
}

_SIGN_BASED = {"EFT"}

_SYMBOL_RE = re.compile(r"^([A-Z0-9][A-Z0-9./]*)\s+-\s+")
_SHARES_RE = re.compile(
    r"(?:Bought|Sold)\s+([\d.]+)\s+(?:shares?|ounces?|units?|coins?)"
    r"(?:\s+at\s+\$([\d.]+)\s+per\s+\w+)?"
)
_CRYPTO_RE = re.compile(r"(?:Purchase|Sale) of ([\d.]+)\s+([A-Z]{2,10})\b")
_STKDIV_RE = re.compile(r"distribution of ([\d.]+)\s+units.*?valued at \$([\d.]+)")
_FX_RE = re.compile(r"FX Rate:\s*([\d.]+)")


@dataclass(frozen=True)
class Extracted:
    """Structured fields derived from a raw transaction row."""

    type: str
    symbol: str | None
    quantity: float | None
    unit_price: float | None
    fx_rate: float | None


def _card_type(raw_type: str) -> str:
    """Map a credit-card transaction label to a normalized type."""
    lowered = raw_type.strip().lower()
    if lowered.startswith("purchase"):
        return "CARD_PURCHASE"
    if lowered.startswith("payment"):
        return "CARD_PAYMENT"
    if lowered.startswith("refund"):
        return "CARD_REFUND"
    return "REWARD"


def normalize_type(raw_type: str, amount: float, schema: str) -> str:
    """Map a raw transaction code to a normalized type, using sign where ambiguous."""
    if schema == SCHEMA_CARD:
        return _card_type(raw_type)
    code = raw_type.strip().upper()
    if code in _SIGN_BASED:
        return "TRANSFER_IN" if amount >= 0 else "TRANSFER_OUT"
    return _TYPE_MAP.get(code, "OTHER")


def _extract_details(
    description: str,
) -> tuple[str | None, float | None, float | None, float | None]:
    """Return (symbol, quantity, unit_price, fx_rate) parsed from a description."""
    symbol: str | None = None
    quantity: float | None = None
    unit_price: float | None = None
    if match := _SYMBOL_RE.search(description):
        symbol = match.group(1)
    if match := _SHARES_RE.search(description):
        quantity = float(match.group(1))
        unit_price = float(match.group(2)) if match.group(2) else None
    elif match := _STKDIV_RE.search(description):
        quantity, unit_price = float(match.group(1)), float(match.group(2))
    elif match := _CRYPTO_RE.search(description):
        quantity, symbol = float(match.group(1)), match.group(2)
    fx = float(m.group(1)) if (m := _FX_RE.search(description)) else None
    return symbol, quantity, unit_price, fx


def _derive_unit_price(
    quantity: float | None, unit_price: float | None, amount: float, fx_rate: float | None
) -> float | None:
    """Derive a per-unit price from amount/quantity when the description omits it.

    Only applied to same-currency rows (no FX conversion) since a converted
    amount and a native-currency price cannot be divided directly.
    """
    if unit_price is not None or quantity in (None, 0) or fx_rate is not None or amount == 0:
        return unit_price
    return round(abs(amount) / quantity, 4)


def classify(row: RawRow) -> Extracted:
    """Classify a RawRow into a normalized type plus extracted holding fields."""
    if row.schema == SCHEMA_CARD:
        raw_type, description = row.fields["type"], row.fields["details"]
    else:
        raw_type, description = row.fields["transaction"], row.fields["description"]
    amount = float(row.fields["amount"] or 0)
    ttype = normalize_type(raw_type, amount, row.schema)
    symbol, quantity, unit_price, fx_rate = _extract_details(description)
    unit_price = _derive_unit_price(quantity, unit_price, amount, fx_rate)
    return Extracted(
        type=ttype, symbol=symbol, quantity=quantity, unit_price=unit_price, fx_rate=fx_rate
    )
