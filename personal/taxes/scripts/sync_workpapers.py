"""Copy ~/Documents/Taxes/_claude_workspace into workpapers/ and mask identifiers on the way in.

Usage: uv run --with openpyxl python scripts/sync_workpapers.py [--dry-run]

Masking: card numbers (Luhn-valid 15-16 digit runs, also inside longer bank references) keep
their last four; BMO account numbers (#########-###) keep their last four; SIN-shaped numbers
(###-###-### or ### ### ###) become ****. Text files are rewritten; .xlsx cells are rewritten
with openpyxl. Caches, pickles and OS files are skipped.
"""

import argparse
import re
import shutil
import sys
from pathlib import Path

SOURCE = Path.home() / "Documents/Taxes/_claude_workspace"
TARGET = Path(__file__).resolve().parents[1] / "workpapers"
SKIP_DIRS = {".ruff_cache", ".impeccable", "__pycache__"}
SKIP_FILES = {".DS_Store", "MOVED.md"}
SKIP_SUFFIXES = {".pkl", ".pyc"}
TEXT_SUFFIXES = {".md", ".csv", ".json", ".html", ".py", ".txt"}
# Changed in the vault after the move (paths repointed, parser no longer hardcodes the account).
VAULT_OWNED = {
    "2026/Corporate/scripts/parse_bmo_debit_statements.py",
    "2026/Corporate/scripts/receipts/build_saira_package.py",
    "2026/Corporate/scripts/receipts/match_2026.py",
    "2026/Corporate/scripts/receipts/organize_receipts.py",
    "2026/Corporate/scripts/receipts/write_indexes.py",
    "2026/Corporate/payroll/scripts/calc_2026.py",
}

ACCOUNT = re.compile(r"#?\b0?\d{7,8}-(\d{3})\b")
SIN = re.compile(r"\b\d{3}[- ]\d{3}[- ]\d{3}\b")
DIGIT_RUN = re.compile(r"\d{13,}")
CARD_WITH_PREFIX = re.compile(r"(?<!\d)\d{4,6}[*X]{4,8}(\d{4})(?!\d)")


def luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2 == 1:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
    return total % 10 == 0


def mask_cards(run: str) -> str:
    """Masks a card number found anywhere inside a digit run, keeping its last four."""
    for width in (16, 15):
        for start in range(len(run) - width + 1):
            cand = run[start : start + width]
            if cand[0] in "3456" and luhn_ok(cand):
                return run[:start] + "****" + cand[-4:] + run[start + width :]
    return run


def mask(text: str) -> str:
    text = DIGIT_RUN.sub(lambda m: mask_cards(m.group(0)), text)
    text = CARD_WITH_PREFIX.sub(lambda m: "****" + m.group(1), text)
    text = ACCOUNT.sub(lambda m: "****" + (m.group(0).replace("-", "")[-4:]), text)
    return SIN.sub("****", text)


def mask_xlsx(path: Path) -> int:
    import openpyxl

    wb = openpyxl.load_workbook(path)
    changed = 0
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, str):
                    new = mask(cell.value)
                    if new != cell.value:
                        cell.value = new
                        changed += 1
    if changed:
        wb.save(path)
    return changed


def wanted(rel: Path) -> bool:
    return not (
        set(rel.parts) & SKIP_DIRS
        or rel.name in SKIP_FILES
        or rel.suffix in SKIP_SUFFIXES
        or rel.as_posix() in VAULT_OWNED
    )


def sync(dry_run: bool) -> None:
    if not SOURCE.is_dir():
        sys.exit(f"source missing: {SOURCE}")
    copied = masked = 0
    for src in sorted(SOURCE.rglob("*")):
        rel = src.relative_to(SOURCE)
        if not src.is_file() or not wanted(rel):
            continue
        dst = TARGET / rel
        copied += 1
        if dry_run:
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        if dst.suffix in TEXT_SUFFIXES:
            before = dst.read_text(encoding="utf-8", errors="surrogateescape")
            after = mask(before)
            if after != before:
                dst.write_text(after, encoding="utf-8", errors="surrogateescape")
                masked += 1
        elif dst.suffix == ".xlsx":
            masked += mask_xlsx(dst) > 0
    print(f"{'would copy' if dry_run else 'copied'} {copied} files, masked {masked}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true")
    sync(parser.parse_args().dry_run)
