"""Discover statement CSVs, detect their schema, and parse rows verbatim."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

SCHEMA_ACCOUNT = "account"
SCHEMA_CARD = "card"

_ACCOUNT_HEADER = ["date", "transaction", "description", "amount", "balance", "currency"]
_CARD_HEADER = ["transaction_date", "post_date", "type", "details", "amount", "currency"]


@dataclass(frozen=True)
class RawRow:
    """A single parsed CSV row tagged with its source file and schema."""

    source_file: str
    schema: str
    fields: dict[str, str]


def detect_schema(header: list[str]) -> str:
    """Return the schema constant for a CSV header, or raise on an unknown header."""
    normalized = [h.strip().lower() for h in header]
    if normalized == _ACCOUNT_HEADER:
        return SCHEMA_ACCOUNT
    if normalized == _CARD_HEADER:
        return SCHEMA_CARD
    raise ValueError(f"Unrecognized CSV header: {header}")


def parse_csv(path: Path) -> list[RawRow]:
    """Parse one CSV into RawRow records using the csv module for quoted fields."""
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            return []
        schema = detect_schema(header)
        keys = [h.strip().lower() for h in header]
        rows: list[RawRow] = []
        for record in reader:
            if not any(cell.strip() for cell in record):
                continue
            fields = dict(zip(keys, record, strict=False))
            rows.append(RawRow(source_file=path.name, schema=schema, fields=fields))
        return rows


def discover_csvs(source_dir: Path) -> list[Path]:
    """Return sorted .csv files in source_dir, excluding dotfiles."""
    return sorted(p for p in source_dir.glob("*.csv") if not p.name.startswith("."))
