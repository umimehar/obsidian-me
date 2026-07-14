"""Mask real account codes, redact personal names, and detect account kinds."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

_CODE_RE = re.compile(r"-([A-Za-z0-9]+)\.csv$")
_KIND_RULES: list[tuple[str, str]] = [
    ("credit-card", "CreditCard"),
    ("managed (tfsa)", "ManagedTFSA"),
    ("direct indexing", "DirectIndexing"),
    ("family-resp", "RESP"),
    ("resp", "RESP"),
    ("rrsp", "RRSP"),
    ("home", "FHSA"),
    ("fhsa", "FHSA"),
    ("tfsa", "TFSA"),
    ("non-registered", "NonRegistered"),
    ("chequing", "Chequing"),
    ("savings", "Savings"),
    ("us dollars", "USD"),
    ("us_dollars", "USD"),
    ("crypto", "Crypto"),
]


@dataclass(frozen=True)
class Redactions:
    """Configured personal-name redaction data."""

    names: list[str]
    account_label_people: dict[str, str]


def mask_account_code(real_code: str) -> str:
    """Return a stable masked id for a real account code; never store the real code."""
    digest = hashlib.sha256(real_code.encode("utf-8")).hexdigest()
    return f"acct_{digest[:8]}"


def account_code_from_filename(name: str) -> str:
    """Return the trailing real account code, or 'card' for credit-card files."""
    if "credit-card" in name:
        return "card"
    match = _CODE_RE.search(name)
    if not match:
        raise ValueError(f"No account code found in filename: {name}")
    return match.group(1)


def short_account_id(real_code: str) -> str:
    """Return a short 4-hex disambiguator for a real code; the real code is never stored."""
    return hashlib.sha256(real_code.encode("utf-8")).hexdigest()[:4]


_STMT_RE = re.compile(r"-\d{4}-\d{2}-\d{2}-monthly-statement.*$")


def account_name_from_filename(name: str) -> str:
    """Return the human account label from a filename (the part before the date)."""
    if "credit-card" in name:
        return "Card"
    stem = _STMT_RE.sub("", name)
    stem = re.sub(r"^[^\w(]+", "", stem).strip()
    return stem or "Account"


def detect_kind(filename: str) -> str:
    """Detect the account kind from a filename using ordered keyword rules."""
    lowered = filename.lower()
    for needle, kind in _KIND_RULES:
        if needle in lowered:
            return kind
    if lowered.startswith("pe-"):
        return "PE"
    return "Other"


def load_redactions(path: Path) -> Redactions:
    """Load the redaction config from JSON."""
    data = json.loads(path.read_text(encoding="utf-8"))
    return Redactions(
        names=list(data.get("names", [])),
        account_label_people=dict(data.get("account_label_people", {})),
    )


def redact(text: str, red: Redactions) -> str:
    """Replace configured personal names in text with a redaction marker."""
    result = text
    for name in sorted(red.names, key=len, reverse=True):
        result = re.sub(re.escape(name), "[redacted]", result, flags=re.IGNORECASE)
    return result
