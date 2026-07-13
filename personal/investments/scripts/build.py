"""CLI orchestrator: build the masked datastore, analytics, and HTML pages."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from investments.analytics import compute_analytics
from investments.datastore import build_datastore
from investments.mask import load_redactions
from investments.parse import discover_csvs, parse_csv
from investments.render import render_pages

SCRIPTS_DIR = Path(__file__).resolve().parent
ENDEAVOR_ROOT = SCRIPTS_DIR.parent
REDACTIONS_PATH = SCRIPTS_DIR / "redactions.json"
DEFAULT_SOURCE = Path.home() / "Downloads" / "monthly-statements-2022-01-to-2026-07"


def _reconcile(source: Path, txn_count: int) -> tuple[int, bool]:
    """Independently count parsed data rows and confirm none were dropped."""
    parsed = sum(len(parse_csv(p)) for p in discover_csvs(source))
    return parsed, parsed == txn_count


def main(source_dir: Path | None = None) -> int:
    """Build the datastore, analytics, and pages; return a process exit code."""
    source = source_dir or DEFAULT_SOURCE
    if not source.is_dir():
        print(f"Source directory not found: {source}", file=sys.stderr)
        return 1
    if not REDACTIONS_PATH.is_file():
        print(
            f"Missing {REDACTIONS_PATH.name}. Copy redactions.example.json to "
            "redactions.json and fill in the real names to scrub.",
            file=sys.stderr,
        )
        return 1
    redactions = load_redactions(REDACTIONS_PATH)
    store = build_datastore(source, redactions)
    analytics = compute_analytics(store)
    data_dir = ENDEAVOR_ROOT / "data"
    notes_dir = ENDEAVOR_ROOT / "notes"
    data_dir.mkdir(parents=True, exist_ok=True)
    notes_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "datastore.json").write_text(json.dumps(store, indent=2), encoding="utf-8")
    (data_dir / "analytics.json").write_text(json.dumps(analytics, indent=2), encoding="utf-8")
    for name, html in render_pages(store, analytics).items():
        (notes_dir / name).write_text(html, encoding="utf-8")
    parsed, ok = _reconcile(source, store["meta"]["txn_count"])
    print(
        f"Built {store['meta']['txn_count']} transactions across "
        f"{len(store['accounts'])} accounts from {store['meta']['file_count']} files."
    )
    print(
        f"Reconciliation: parsed {parsed} rows, stored {store['meta']['txn_count']} "
        f"({'OK' if ok else 'MISMATCH'})."
    )
    warnings = store["meta"]["warnings"]["unmapped_types"]
    if warnings:
        print(f"Warning: unmapped transaction codes seen: {warnings}", file=sys.stderr)
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
