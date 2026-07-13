# Personal Investments Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ~183 Wealthsimple statement CSVs into one normalized, privacy-masked JSON datastore plus styled self-contained HTML analysis pages, driven by a reusable Python pipeline.

**Architecture:** A small Python package (`scripts/investments/`) with focused modules — parse, classify, mask, datastore, analytics, render — orchestrated by `scripts/build.py`. Each module is pure and independently tested. The build reads CSVs from an external source directory, writes `data/datastore.json` + `data/analytics.json`, and regenerates HTML into `notes/`.

**Tech Stack:** Python 3.13, `uv` venv, standard library only (`csv`, `json`, `hashlib`, `re`, `pathlib`, `datetime`, `collections`), `pytest`, `ruff`, `ty`. No runtime third-party dependencies.

## Global Constraints

- Python 3.13+, managed with `uv venv` / `uv run`. Standard library only for runtime code; `pytest`/`ruff`/`ty` are dev-only.
- Code limits: <=100 lines/function, cyclomatic complexity <=8, <=5 positional params, 100-char lines, absolute imports only, Google-style docstrings on non-trivial public APIs.
- `ruff check` and `ty check` must be clean; zero warnings.
- Real account codes (e.g. `WK1V04QK2CAD`) MUST NEVER be written to any file under `personal/investments/`. Masked ids only.
- Source CSV directory (constant): `~/Downloads/monthly-statements-2022-01-to-2026-07/`. Never committed.
- Parsing MUST use Python's `csv` module (descriptions contain embedded commas and newlines).
- Endeavor is journal-only: no orchestrator/board/loop wiring.
- Prose in markdown/README uses no hard-wrap and no `-` dash punctuation (vault rule).
- HTML: self-contained, inline SVG charts + vanilla JS, no external CDNs. One shared stylesheet at `personal/_assets/personal.css` referenced as `../../_assets/personal.css`.

## File Structure

```
personal/investments/
  README.md                          thin index
  log/2026-07-13.md                  session log
  scripts/
    pyproject.toml                   python project config (ruff, ty, pytest)
    build.py                         CLI orchestrator
    redactions.json                  name redaction list
    investments/
      __init__.py
      parse.py        discover CSVs, detect schema, parse rows
      classify.py     normalize type, extract symbol/qty/price/fx
      mask.py         stable masked ids, name redaction, account kind
      datastore.py    assemble accounts + transactions, dedup
      analytics.py    cash flow, contributions, income, holdings, balances
      render.py       HTML page rendering
    tests/
      conftest.py
      test_parse.py
      test_classify.py
      test_mask.py
      test_datastore.py
      test_analytics.py
      test_render.py
  data/
    datastore.json                   generated
    analytics.json                   generated
  notes/
    index.html  growth.html  contributions.html  cash-flow.html  income.html  holdings.html
personal/_assets/personal.css        shared stylesheet
```

---

### Task 1: Scaffold endeavor, Python project, and fixtures

**Files:**
- Create: `personal/investments/README.md`
- Create: `personal/investments/log/2026-07-13.md`
- Create: `personal/investments/scripts/pyproject.toml`
- Create: `personal/investments/scripts/redactions.json`
- Create: `personal/investments/scripts/investments/__init__.py`
- Create: `personal/investments/scripts/tests/conftest.py`
- Create: `personal/investments/.gitignore`

**Interfaces:**
- Produces: `sample_account_csv` and `sample_card_csv` pytest fixtures returning `Path` to small CSV files; `tmp_source_dir` fixture returning a directory containing both.

- [ ] **Step 1: Create the Python project config**

`personal/investments/scripts/pyproject.toml`:

```toml
[project]
name = "investments-analyzer"
version = "0.1.0"
requires-python = ">=3.13"

[dependency-groups]
dev = ["pytest>=8", "ruff>=0.6", "ty>=0.0.1a1"]

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM", "C90"]

[tool.ruff.lint.mccabe]
max-complexity = 8

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Create the package init and gitignore**

`personal/investments/scripts/investments/__init__.py`:

```python
"""Reusable pipeline that turns Wealthsimple statement CSVs into a masked datastore."""
```

`personal/investments/.gitignore`:

```
scripts/.venv/
scripts/**/__pycache__/
scripts/.pytest_cache/
scripts/.ruff_cache/
```

- [ ] **Step 3: Create the redactions list**

`personal/investments/scripts/redactions.json`:

```json
{
  "names": ["Umar farooq Aslam", "Umar Farooq Aslam", "Umar", "Maham"],
  "account_label_people": {"Umar": "Person A", "Maham": "Person B"}
}
```

- [ ] **Step 4: Create test fixtures**

`personal/investments/scripts/tests/conftest.py`:

```python
"""Shared pytest fixtures providing small representative CSV samples."""

from pathlib import Path

import pytest

ACCOUNT_CSV = (
    '"date","transaction","description","amount","balance","currency"\n'
    '"2026-06-03","BUY","L - Loblaw Cos. Ltd.: Bought 1.0000 shares at $61.49 '
    'per share (executed at 2026-06-02)","-61.49","932.23","CAD"\n'
    '"2026-06-05","CONT","Contribution (executed at 2026-06-05)","500.0","1432.23","CAD"\n'
    '"2026-06-05","E_TRFIN","Interac e-Transfer® Received from Umar farooq '
    'Aslam","660.0","2092.23","CAD"\n'
    '"2026-06-02","DIV","ZAG - BMO Aggregate Bond Index ETF: Cash dividend '
    'distribution, received on 2026-06-02","1.04","19.72","CAD"\n'
)

CARD_CSV = (
    '"transaction_date","post_date","type","details","amount","currency"\n'
    '"2026-05-23","2026-05-25","Purchase","SHOPPERS DRUG MART #07","37.4","CAD"\n'
    '"2026-05-25","2026-05-25","Payment","From chequing account","-14.91","CAD"\n'
)


@pytest.fixture
def sample_account_csv(tmp_path: Path) -> Path:
    """Write a Managed (TFSA) style statement and return its path."""
    path = tmp_path / "Managed (TFSA)-2026-06-01-monthly-statement-transactions-WK1V04QK2CAD.csv"
    path.write_text(ACCOUNT_CSV, encoding="utf-8")
    return path


@pytest.fixture
def sample_card_csv(tmp_path: Path) -> Path:
    """Write a credit-card style statement and return its path."""
    name = (
        "Wealthsimple-credit-card-2026-06-01-credit-card-statement-transactions-"
        "ca-credit-card-exusOFBgLg.csv"
    )
    path = tmp_path / name
    path.write_text(CARD_CSV, encoding="utf-8")
    return path


@pytest.fixture
def tmp_source_dir(sample_account_csv: Path, sample_card_csv: Path) -> Path:
    """Return the directory holding both sample CSVs."""
    return sample_account_csv.parent
```

- [ ] **Step 5: Create thin README and log**

`personal/investments/README.md`:

```markdown
---
title: Investments
tags: [personal/investments]
created: 2026-07-13
updated: 2026-07-13
status: active
type: personal
personal: investments
---

# Investments

Personal finance and investments second brain built from Wealthsimple monthly statements. A reusable pipeline masks the raw exports into a normalized datastore and renders analysis pages.

## Pages

- [Overview](notes/index.html)
- [Growth](notes/growth.html)
- [Contributions](notes/contributions.html)
- [Cash flow](notes/cash-flow.html)
- [Income](notes/income.html)
- [Holdings](notes/holdings.html)

## Rebuild

Drop new statement CSVs into the source directory, then from `scripts/`:

    uv run python build.py

Regenerates `data/datastore.json`, `data/analytics.json`, and the pages. Real account numbers are never stored; masked ids only.
```

`personal/investments/log/2026-07-13.md`:

```markdown
---
title: 2026-07-13 Investments
tags: [personal/investments, log]
created: 2026-07-13
updated: 2026-07-13
status: active
type: log
personal: investments
---

# 2026-07-13

Scaffolded the investments endeavor and the CSV to JSON to HTML pipeline.
```

- [ ] **Step 6: Initialize the venv and verify tooling**

Run:

```bash
cd personal/investments/scripts && uv venv && uv sync --group dev && uv run pytest -q
```

Expected: venv created; `pytest` collects 0 tests and exits 0 (no test files yet).

- [ ] **Step 7: Commit**

```bash
git add personal/investments/.gitignore personal/investments/README.md personal/investments/log personal/investments/scripts/pyproject.toml personal/investments/scripts/redactions.json personal/investments/scripts/investments/__init__.py personal/investments/scripts/tests/conftest.py
git commit -m "feat: scaffold investments endeavor and pipeline project"
```

---

### Task 2: CSV discovery, schema detection, and parsing

**Files:**
- Create: `personal/investments/scripts/investments/parse.py`
- Test: `personal/investments/scripts/tests/test_parse.py`

**Interfaces:**
- Produces:
  - `SCHEMA_ACCOUNT = "account"`, `SCHEMA_CARD = "card"` (str constants)
  - `detect_schema(header: list[str]) -> str`
  - `RawRow` dataclass: `{ source_file: str, schema: str, fields: dict[str, str] }`
  - `parse_csv(path: Path) -> list[RawRow]`
  - `discover_csvs(source_dir: Path) -> list[Path]` (sorted, excludes dotfiles)

- [ ] **Step 1: Write the failing test**

`personal/investments/scripts/tests/test_parse.py`:

```python
from pathlib import Path

from investments.parse import (
    SCHEMA_ACCOUNT,
    SCHEMA_CARD,
    detect_schema,
    discover_csvs,
    parse_csv,
)


def test_detect_schema_account():
    header = ["date", "transaction", "description", "amount", "balance", "currency"]
    assert detect_schema(header) == SCHEMA_ACCOUNT


def test_detect_schema_card():
    header = ["transaction_date", "post_date", "type", "details", "amount", "currency"]
    assert detect_schema(header) == SCHEMA_CARD


def test_detect_schema_unknown_raises():
    import pytest

    with pytest.raises(ValueError, match="Unrecognized"):
        detect_schema(["foo", "bar"])


def test_parse_account_csv(sample_account_csv: Path):
    rows = parse_csv(sample_account_csv)
    assert len(rows) == 4
    assert rows[0].schema == SCHEMA_ACCOUNT
    assert rows[0].fields["transaction"] == "BUY"
    assert rows[0].source_file == sample_account_csv.name


def test_parse_card_csv(sample_card_csv: Path):
    rows = parse_csv(sample_card_csv)
    assert len(rows) == 2
    assert rows[0].schema == SCHEMA_CARD
    assert rows[0].fields["type"] == "Purchase"


def test_parse_handles_multiline_description(tmp_path: Path):
    content = (
        '"date","transaction","description","amount","balance","currency"\n'
        '"2026-06-02","DIV","Line one,\nline two with comma, still one field",'
        '"1.0","2.0","CAD"\n'
    )
    path = tmp_path / "X-2026-06-01-monthly-statement-transactions-WK0000000CAD.csv"
    path.write_text(content, encoding="utf-8")
    rows = parse_csv(path)
    assert len(rows) == 1
    assert "line two with comma" in rows[0].fields["description"]


def test_discover_csvs_sorted_no_dotfiles(tmp_source_dir: Path):
    (tmp_source_dir / ".DS_Store").write_text("x")
    found = discover_csvs(tmp_source_dir)
    assert all(p.suffix == ".csv" for p in found)
    assert found == sorted(found)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd personal/investments/scripts && uv run pytest tests/test_parse.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'investments.parse'`.

- [ ] **Step 3: Write minimal implementation**

`personal/investments/scripts/investments/parse.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd personal/investments/scripts && uv run pytest tests/test_parse.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add personal/investments/scripts/investments/parse.py personal/investments/scripts/tests/test_parse.py
git commit -m "feat: add CSV discovery, schema detection, and parsing"
```

---

### Task 3: Transaction classification and field extraction

**Files:**
- Create: `personal/investments/scripts/investments/classify.py`
- Test: `personal/investments/scripts/tests/test_classify.py`

**Interfaces:**
- Consumes: `investments.parse.RawRow`, `SCHEMA_ACCOUNT`, `SCHEMA_CARD`.
- Produces:
  - `Extracted` dataclass: `{ type: str, symbol: str | None, quantity: float | None, unit_price: float | None, fx_rate: float | None }`
  - `normalize_type(raw_type: str, amount: float, schema: str) -> str`
  - `extract_fields(description: str) -> Extracted` (type field left empty; caller sets it) — actually returns symbol/qty/price/fx only via `extract_details(description) -> dict`
  - `classify(row: RawRow) -> Extracted`

- [ ] **Step 1: Write the failing test**

`personal/investments/scripts/tests/test_classify.py`:

```python
from investments.classify import classify, normalize_type
from investments.parse import SCHEMA_ACCOUNT, SCHEMA_CARD, RawRow


def _account_row(transaction: str, description: str, amount: str) -> RawRow:
    return RawRow(
        source_file="f.csv",
        schema=SCHEMA_ACCOUNT,
        fields={
            "date": "2026-06-01",
            "transaction": transaction,
            "description": description,
            "amount": amount,
            "balance": "0",
            "currency": "CAD",
        },
    )


def test_normalize_maps_fplint_to_int():
    assert normalize_type("FPLINT", 1.0, SCHEMA_ACCOUNT) == "INT"


def test_normalize_maps_cont_to_contrib():
    assert normalize_type("CONT", 1.0, SCHEMA_ACCOUNT) == "CONTRIB"


def test_normalize_eft_uses_sign():
    assert normalize_type("EFT", 5.0, SCHEMA_ACCOUNT) == "TRANSFER_IN"
    assert normalize_type("EFT", -5.0, SCHEMA_ACCOUNT) == "TRANSFER_OUT"


def test_normalize_card_purchase_and_payment():
    assert normalize_type("Purchase", 10.0, SCHEMA_CARD) == "CARD_PURCHASE"
    assert normalize_type("Payment", -10.0, SCHEMA_CARD) == "CARD_PAYMENT"


def test_classify_buy_extracts_symbol_qty_price():
    row = _account_row(
        "BUY",
        "L - Loblaw Cos. Ltd.: Bought 1.0000 shares at $61.49 per share (executed at 2026-06-02)",
        "-61.49",
    )
    out = classify(row)
    assert out.type == "BUY"
    assert out.symbol == "L"
    assert out.quantity == 1.0
    assert out.unit_price == 61.49


def test_classify_div_extracts_symbol_only():
    row = _account_row("DIV", "ZAG - BMO Aggregate Bond Index ETF: Cash dividend", "1.04")
    out = classify(row)
    assert out.type == "DIV"
    assert out.symbol == "ZAG"
    assert out.quantity is None


def test_classify_crypto_buy_extracts_symbol_and_fx():
    row = _account_row(
        "BUY",
        "Purchase of 0.0028564000 BTC (executed at 2026-06-05), FX Rate: 1.3903",
        "-247.53",
    )
    out = classify(row)
    assert out.symbol == "BTC"
    assert out.quantity == 0.0028564
    assert out.fx_rate == 1.3903


def test_classify_stkdiv_extracts_qty_and_price():
    row = _account_row(
        "STKDIV",
        "FDXF - Fedex: Stock dividend distribution of 0.0314 units, valued at $7.1300",
        "0.0",
    )
    out = classify(row)
    assert out.quantity == 0.0314
    assert out.unit_price == 7.13
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd personal/investments/scripts && uv run pytest tests/test_classify.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'investments.classify'`.

- [ ] **Step 3: Write minimal implementation**

`personal/investments/scripts/investments/classify.py`:

```python
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
    "SPEND": "CARD_PURCHASE",
}

_SIGN_BASED = {"EFT"}
_CARD_MAP = {"purchase": "CARD_PURCHASE", "payment": "CARD_PAYMENT"}

_SYMBOL_RE = re.compile(r"^([A-Z0-9][A-Z0-9.]*)\s+-\s+")
_SHARES_RE = re.compile(r"(?:Bought|Sold)\s+([\d.]+)\s+shares?\s+at\s+\$([\d.]+)")
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


def normalize_type(raw_type: str, amount: float, schema: str) -> str:
    """Map a raw transaction code to a normalized type, using sign where ambiguous."""
    if schema == SCHEMA_CARD:
        return _CARD_MAP.get(raw_type.strip().lower(), "REWARD")
    code = raw_type.strip().upper()
    if code in _SIGN_BASED:
        return "TRANSFER_IN" if amount >= 0 else "TRANSFER_OUT"
    return _TYPE_MAP.get(code, "OTHER")


def _extract_details(description: str) -> tuple[str | None, float | None, float | None, float | None]:
    """Return (symbol, quantity, unit_price, fx_rate) parsed from a description."""
    symbol: str | None = None
    quantity: float | None = None
    unit_price: float | None = None
    if match := _SYMBOL_RE.search(description):
        symbol = match.group(1)
    if match := _SHARES_RE.search(description):
        quantity, unit_price = float(match.group(1)), float(match.group(2))
    elif match := _STKDIV_RE.search(description):
        quantity, unit_price = float(match.group(1)), float(match.group(2))
    elif match := _CRYPTO_RE.search(description):
        quantity, symbol = float(match.group(1)), match.group(2)
    fx = float(m.group(1)) if (m := _FX_RE.search(description)) else None
    return symbol, quantity, unit_price, fx


def classify(row: RawRow) -> Extracted:
    """Classify a RawRow into a normalized type plus extracted holding fields."""
    if row.schema == SCHEMA_CARD:
        raw_type, description = row.fields["type"], row.fields["details"]
    else:
        raw_type, description = row.fields["transaction"], row.fields["description"]
    amount = float(row.fields["amount"] or 0)
    ttype = normalize_type(raw_type, amount, row.schema)
    symbol, quantity, unit_price, fx_rate = _extract_details(description)
    return Extracted(
        type=ttype, symbol=symbol, quantity=quantity, unit_price=unit_price, fx_rate=fx_rate
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd personal/investments/scripts && uv run pytest tests/test_classify.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add personal/investments/scripts/investments/classify.py personal/investments/scripts/tests/test_classify.py
git commit -m "feat: add transaction classification and field extraction"
```

---

### Task 4: Masking, redaction, and account-kind detection

**Files:**
- Create: `personal/investments/scripts/investments/mask.py`
- Test: `personal/investments/scripts/tests/test_mask.py`

**Interfaces:**
- Produces:
  - `mask_account_code(real_code: str) -> str` returns `acct_` + first 8 hex of sha256, stable per code.
  - `account_code_from_filename(name: str) -> str` returns the trailing code before `.csv`, or `card` for credit-card files.
  - `detect_kind(filename: str) -> str` returns a kind from { TFSA, FHSA, RRSP, RESP, ManagedTFSA, DirectIndexing, NonRegistered, Chequing, Savings, USD, Crypto, PE, CreditCard, Other }.
  - `load_redactions(path: Path) -> Redactions` and `redact(text: str, red: Redactions) -> str`.
  - `Redactions` dataclass: `{ names: list[str], account_label_people: dict[str, str] }`.

- [ ] **Step 1: Write the failing test**

`personal/investments/scripts/tests/test_mask.py`:

```python
from pathlib import Path

from investments.mask import (
    Redactions,
    account_code_from_filename,
    detect_kind,
    load_redactions,
    mask_account_code,
    redact,
)


def test_mask_is_stable_and_prefixed():
    a = mask_account_code("WK1V04QK2CAD")
    b = mask_account_code("WK1V04QK2CAD")
    assert a == b
    assert a.startswith("acct_")
    assert mask_account_code("WK1V04QK2CAD") != mask_account_code("HQ51705K2CAD")


def test_account_code_from_filename():
    name = "Managed (TFSA)-2026-06-01-monthly-statement-transactions-WK1V04QK2CAD.csv"
    assert account_code_from_filename(name) == "WK1V04QK2CAD"


def test_account_code_from_card_filename():
    name = "Wealthsimple-credit-card-2026-06-01-credit-card-statement-transactions-ca-credit-card-exusOFBgLg.csv"
    assert account_code_from_filename(name) == "card"


def test_detect_kind_variants():
    assert detect_kind("Home-2026-06-01-...-HQ75YWF61CAD.csv") == "FHSA"
    assert detect_kind("Managed (TFSA)-...-WK1V04QK2CAD.csv") == "ManagedTFSA"
    assert detect_kind("TFSA-...-HQ51705K2CAD.csv") == "TFSA"
    assert detect_kind("Umar’s-RRSP-...-HQ8PX8W46CAD.csv") == "RRSP"
    assert detect_kind("Family-RESP-...-HQ9MF9DQ2CAD.csv") == "RESP"
    assert detect_kind("Crypto-...-HQBVPFH15CAD.csv") == "Crypto"
    assert detect_kind("Wealthsimple-credit-card-...-exusOFBgLg.csv") == "CreditCard"


def test_redact_removes_names(tmp_path: Path):
    red = Redactions(names=["Umar farooq Aslam", "Maham"], account_label_people={})
    text = "Received from Umar farooq Aslam and Maham"
    assert "Umar" not in redact(text, red)
    assert "Maham" not in redact(text, red)


def test_load_redactions(tmp_path: Path):
    path = tmp_path / "redactions.json"
    path.write_text('{"names": ["Umar"], "account_label_people": {"Umar": "Person A"}}')
    red = load_redactions(path)
    assert red.names == ["Umar"]
    assert red.account_label_people == {"Umar": "Person A"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd personal/investments/scripts && uv run pytest tests/test_mask.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'investments.mask'`.

- [ ] **Step 3: Write minimal implementation**

`personal/investments/scripts/investments/mask.py`:

```python
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
    ("—pe", "PE"),
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


def detect_kind(filename: str) -> str:
    """Detect the account kind from a filename using ordered keyword rules."""
    lowered = filename.lower()
    for needle, kind in _KIND_RULES:
        if needle in lowered:
            return kind
    if re.match(r"^pe-", lowered):
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
```

Note the PE rule uses an em-dash key that will not match; the `re.match(r"^pe-", ...)` fallback covers the `PE-...` filenames. Keep both; the regex is the effective one.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd personal/investments/scripts && uv run pytest tests/test_mask.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add personal/investments/scripts/investments/mask.py personal/investments/scripts/tests/test_mask.py
git commit -m "feat: add account masking, name redaction, and kind detection"
```

---

### Task 5: Datastore assembly and deduplication

**Files:**
- Create: `personal/investments/scripts/investments/datastore.py`
- Test: `personal/investments/scripts/tests/test_datastore.py`

**Interfaces:**
- Consumes: `parse.RawRow`, `parse.discover_csvs`, `parse.parse_csv`, `classify.classify`, `mask.*`.
- Produces:
  - `Transaction` TypedDict and `Account` TypedDict (JSON-ready dicts).
  - `build_datastore(source_dir: Path, redactions: Redactions) -> dict` with keys `meta`, `accounts`, `transactions`.
  - `dedup_key(txn: dict) -> tuple` used internally; exposed for testing.

- [ ] **Step 1: Write the failing test**

`personal/investments/scripts/tests/test_datastore.py`:

```python
from pathlib import Path

from investments.datastore import build_datastore
from investments.mask import Redactions

RED = Redactions(names=["Umar farooq Aslam"], account_label_people={})


def test_build_datastore_shape(tmp_source_dir: Path):
    store = build_datastore(tmp_source_dir, RED)
    assert set(store) == {"meta", "accounts", "transactions"}
    assert store["meta"]["file_count"] == 2
    assert store["meta"]["txn_count"] == len(store["transactions"])


def test_no_real_codes_in_datastore(tmp_source_dir: Path):
    store = build_datastore(tmp_source_dir, RED)
    blob = str(store)
    assert "WK1V04QK2CAD" not in blob
    assert all(a["masked_id"].startswith("acct_") for a in store["accounts"])


def test_names_are_redacted(tmp_source_dir: Path):
    store = build_datastore(tmp_source_dir, RED)
    blob = str(store)
    assert "Umar farooq Aslam" not in blob


def test_contrib_and_types_present(tmp_source_dir: Path):
    store = build_datastore(tmp_source_dir, RED)
    types = {t["type"] for t in store["transactions"]}
    assert "CONTRIB" in types
    assert "BUY" in types


def test_dedup_collapses_identical_rows(tmp_path: Path):
    content = (
        '"date","transaction","description","amount","balance","currency"\n'
        '"2026-06-01","DIV","ZAG - x","1.0","2.0","CAD"\n'
    )
    (tmp_path / "A-2026-06-01-transactions-WK0000001CAD.csv").write_text(content)
    (tmp_path / "A-2026-07-01-transactions-WK0000001CAD.csv").write_text(content)
    store = build_datastore(tmp_path, RED)
    assert store["meta"]["txn_count"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd personal/investments/scripts && uv run pytest tests/test_datastore.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'investments.datastore'`.

- [ ] **Step 3: Write minimal implementation**

`personal/investments/scripts/investments/datastore.py`:

```python
"""Assemble parsed, classified, masked rows into a deduplicated datastore dict."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from investments.classify import classify
from investments.mask import (
    Redactions,
    account_code_from_filename,
    detect_kind,
    mask_account_code,
    redact,
)
from investments.parse import SCHEMA_CARD, discover_csvs, parse_csv

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


def _row_to_txn(row: Any, account_id: str, red: Redactions) -> dict:
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


def _dedup_key(txn: dict) -> tuple:
    """Return a stable identity key so overlapping monthly files do not double-count."""
    return (
        txn["account_id"],
        txn["date"],
        txn["raw_type"],
        txn["amount"],
        txn["description_redacted"],
    )


def build_datastore(source_dir: Path, redactions: Redactions) -> dict:
    """Build the full masked datastore dict from a directory of statement CSVs."""
    files = discover_csvs(source_dir)
    accounts: dict[str, dict] = {}
    seen: set[tuple] = set()
    transactions: list[dict] = []
    for path in files:
        real_code = account_code_from_filename(path.name)
        account_id = mask_account_code(real_code)
        kind = detect_kind(path.name)
        for row in parse_csv(path):
            txn = _row_to_txn(row, account_id, redactions)
            key = _dedup_key(txn)
            if key in seen:
                continue
            seen.add(key)
            transactions.append(txn)
            _touch_account(accounts, account_id, kind, txn)
    return {
        "meta": {
            "generated_at": datetime.now(UTC).isoformat(),
            "schema_version": SCHEMA_VERSION,
            "file_count": len(files),
            "txn_count": len(transactions),
            "source_range": _range(transactions),
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd personal/investments/scripts && uv run pytest tests/test_datastore.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add personal/investments/scripts/investments/datastore.py personal/investments/scripts/tests/test_datastore.py
git commit -m "feat: assemble deduplicated masked datastore"
```

---

### Task 6: Analytics computation

**Files:**
- Create: `personal/investments/scripts/investments/analytics.py`
- Test: `personal/investments/scripts/tests/test_analytics.py`

**Interfaces:**
- Consumes: a datastore dict (`build_datastore` output).
- Produces: `compute_analytics(store: dict) -> dict` with keys:
  - `contributions`: `{ by_account_year: list[{account_id, kind, year, total}], by_registered_year: list[{group, year, total}], resp_grants: list[{year, total}], limits: dict[str, dict[str, float]] }`
  - `cash_flow`: `list[{account_id, month, inflow, outflow, net}]`
  - `income`: `{ by_month: list[{month, total}], by_symbol: list[{symbol, total}] }`
  - `holdings`: `list[{account_id, symbol, quantity, cost_basis}]`
  - `balances`: `list[{account_id, month, balance, approximate: bool}]`
- Registered group map: ManagedTFSA and TFSA -> "TFSA"; FHSA -> "FHSA"; RRSP -> "RRSP"; RESP -> "RESP".
- Annual limits constant `CONTRIBUTION_LIMITS` (labelled context only).

- [ ] **Step 1: Write the failing test**

`personal/investments/scripts/tests/test_analytics.py`:

```python
from investments.analytics import compute_analytics


def _store(transactions, accounts=None):
    accounts = accounts or [
        {"masked_id": "acct_a", "kind": "TFSA", "currency": "CAD"},
        {"masked_id": "acct_b", "kind": "RESP", "currency": "CAD"},
    ]
    return {"meta": {}, "accounts": accounts, "transactions": transactions}


def _txn(account_id, date, ttype, amount, **kw):
    base = {
        "account_id": account_id, "date": date, "type": ttype, "amount": amount,
        "symbol": kw.get("symbol"), "quantity": kw.get("quantity"),
        "unit_price": kw.get("unit_price"), "balance": kw.get("balance"),
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
    rollup = {(r["group"], r["year"]): r["total"] for r in out["contributions"]["by_registered_year"]}
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
    by_month = {r["month"]: r["total"] for r in out["income"]["by_month"]}
    assert by_symbol["ZAG"] == 3.0
    assert by_month["2025-03"] == 3.0


def test_holdings_net_quantity_and_cost_basis():
    txns = [
        _txn("acct_a", "2025-03-01", "BUY", -60.0, symbol="L", quantity=1.0, unit_price=60.0),
        _txn("acct_a", "2025-04-01", "BUY", -20.0, symbol="L", quantity=0.5, unit_price=40.0),
        _txn("acct_a", "2025-05-01", "SELL", 30.0, symbol="L", quantity=0.5, unit_price=60.0),
    ]
    out = compute_analytics(_store(txns))
    holding = next(h for h in out["holdings"] if h["symbol"] == "L")
    assert holding["quantity"] == 1.0
    assert holding["cost_basis"] == 80.0


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd personal/investments/scripts && uv run pytest tests/test_analytics.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'investments.analytics'`.

- [ ] **Step 3: Write minimal implementation**

`personal/investments/scripts/investments/analytics.py`:

```python
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

CONTRIBUTION_LIMITS: dict[str, dict[str, float]] = {
    "TFSA": {"2025": 7000.0, "2026": 7000.0},
    "FHSA": {"2025": 8000.0, "2026": 8000.0},
    "RRSP": {"2025": 32490.0, "2026": 33810.0},
    "RESP": {"2025": 2500.0, "2026": 2500.0},
}


def _year(date: str) -> int:
    return int(date[:4])


def _month(date: str) -> str:
    return date[:7]


def _kinds(store: dict) -> dict[str, str]:
    return {a["masked_id"]: a["kind"] for a in store["accounts"]}


def _contributions(store: dict, kinds: dict[str, str]) -> dict:
    """Aggregate CONTRIB rows per account-year and per registered group-year, plus RESP grants."""
    per_acct: dict[tuple[str, int], float] = defaultdict(float)
    per_group: dict[tuple[str, int], float] = defaultdict(float)
    grants: dict[int, float] = defaultdict(float)
    for txn in store["transactions"]:
        year = _year(txn["date"])
        if txn["type"] == "CONTRIB":
            acct = txn["account_id"]
            per_acct[(acct, year)] += txn["amount"]
            group = _REGISTERED_GROUP.get(kinds.get(acct, ""))
            if group:
                per_group[(group, year)] += txn["amount"]
        elif txn["type"] == "GRANT":
            grants[year] += txn["amount"]
    return {
        "by_account_year": [
            {"account_id": a, "kind": kinds.get(a, "Other"), "year": y, "total": round(v, 2)}
            for (a, y), v in sorted(per_acct.items())
        ],
        "by_registered_year": [
            {"group": g, "year": y, "total": round(v, 2)}
            for (g, y), v in sorted(per_group.items())
        ],
        "resp_grants": [{"year": y, "total": round(v, 2)} for y, v in sorted(grants.items())],
        "limits": CONTRIBUTION_LIMITS,
    }


def _cash_flow(store: dict) -> list[dict]:
    """Sum inflows and outflows per account-month, excluding zero-amount lending noise."""
    flow: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
    for txn in store["transactions"]:
        if txn["type"] in {"LENDING", "REORG"} or txn["amount"] == 0:
            continue
        bucket = flow[(txn["account_id"], _month(txn["date"]))]
        if txn["amount"] >= 0:
            bucket[0] += txn["amount"]
        else:
            bucket[1] += txn["amount"]
    return [
        {
            "account_id": a,
            "month": m,
            "inflow": round(inflow, 2),
            "outflow": round(outflow, 2),
            "net": round(inflow + outflow, 2),
        }
        for (a, m), (inflow, outflow) in sorted(flow.items())
    ]


def _income(store: dict) -> dict:
    """Aggregate dividend/interest/distribution income by month and by symbol."""
    by_month: dict[str, float] = defaultdict(float)
    by_symbol: dict[str, float] = defaultdict(float)
    for txn in store["transactions"]:
        if txn["type"] not in _INCOME_TYPES or txn["amount"] <= 0:
            continue
        by_month[_month(txn["date"])] += txn["amount"]
        by_symbol[txn["symbol"] or "(cash)"] += txn["amount"]
    return {
        "by_month": [{"month": m, "total": round(v, 2)} for m, v in sorted(by_month.items())],
        "by_symbol": [
            {"symbol": s, "total": round(v, 2)}
            for s, v in sorted(by_symbol.items(), key=lambda kv: -kv[1])
        ],
    }


def _holdings(store: dict) -> list[dict]:
    """Derive net quantity and buy-side cost basis per account-symbol."""
    qty: dict[tuple[str, str], float] = defaultdict(float)
    cost: dict[tuple[str, str], float] = defaultdict(float)
    for txn in store["transactions"]:
        symbol = txn["symbol"]
        if not symbol or txn["quantity"] is None:
            continue
        key = (txn["account_id"], symbol)
        if txn["type"] in {"BUY", "STKDIV"}:
            qty[key] += txn["quantity"]
            cost[key] += -txn["amount"] if txn["amount"] < 0 else 0.0
        elif txn["type"] == "SELL":
            qty[key] -= txn["quantity"]
    return [
        {"account_id": a, "symbol": s, "quantity": round(qty[(a, s)], 6), "cost_basis": round(cost[(a, s)], 2)}
        for (a, s) in sorted(qty)
        if round(qty[(a, s)], 6) != 0
    ]


def _balances(store: dict) -> list[dict]:
    """Take the last known balance per account-month; approximate for investment accounts."""
    kinds = _kinds(store)
    exact_kinds = {"Chequing", "Savings", "USD"}
    last: dict[tuple[str, str], tuple[str, float]] = {}
    for txn in store["transactions"]:
        if txn["balance"] is None:
            continue
        key = (txn["account_id"], _month(txn["date"]))
        prev = last.get(key)
        if prev is None or txn["date"] >= prev[0]:
            last[key] = (txn["date"], txn["balance"])
    return [
        {
            "account_id": a,
            "month": m,
            "balance": round(bal, 2),
            "approximate": kinds.get(a, "") not in exact_kinds,
        }
        for (a, m), (_, bal) in sorted(last.items())
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd personal/investments/scripts && uv run pytest tests/test_analytics.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add personal/investments/scripts/investments/analytics.py personal/investments/scripts/tests/test_analytics.py
git commit -m "feat: compute cash-flow, contributions, income, holdings analytics"
```

---

### Task 7: HTML rendering and shared stylesheet

**REQUIRED SUB-SKILL for this task:** invoke `high-end-visual-design` before writing the CSS and page markup. This is the one design skill for this project (do not also use design-taste-frontend or impeccable). Charts follow the `dataviz` skill for palette and accessibility. Render inline SVG + vanilla JS, no external CDNs.

**Files:**
- Create: `personal/investments/scripts/investments/render.py`
- Create: `personal/_assets/personal.css`
- Test: `personal/investments/scripts/tests/test_render.py`

**Interfaces:**
- Consumes: datastore dict and analytics dict.
- Produces:
  - `svg_bar_chart(series: list[tuple[str, float]], width: int = 640, height: int = 240) -> str` returns an `<svg>...</svg>` string.
  - `render_pages(store: dict, analytics: dict) -> dict[str, str]` returns filename -> full HTML string for each of: `index.html`, `growth.html`, `contributions.html`, `cash-flow.html`, `income.html`, `holdings.html`.
  - Each page links `../../_assets/personal.css` and includes a light/dark toggle.

- [ ] **Step 1: Write the failing test**

`personal/investments/scripts/tests/test_render.py`:

```python
from investments.render import render_pages, svg_bar_chart


def _analytics():
    return {
        "contributions": {
            "by_account_year": [{"account_id": "acct_a", "kind": "TFSA", "year": 2025, "total": 750.0}],
            "by_registered_year": [{"group": "TFSA", "year": 2025, "total": 750.0}],
            "resp_grants": [], "limits": {"TFSA": {"2025": 7000.0}},
        },
        "cash_flow": [{"account_id": "acct_a", "month": "2025-03", "inflow": 500.0, "outflow": -2.0, "net": 498.0}],
        "income": {"by_month": [{"month": "2025-03", "total": 3.0}], "by_symbol": [{"symbol": "ZAG", "total": 3.0}]},
        "holdings": [{"account_id": "acct_a", "symbol": "L", "quantity": 1.0, "cost_basis": 80.0}],
        "balances": [{"account_id": "acct_a", "month": "2025-03", "balance": 498.0, "approximate": True}],
    }


def _store():
    return {
        "meta": {"generated_at": "2026-07-13T00:00:00Z", "txn_count": 1, "file_count": 1,
                 "source_range": {"start": "2025-03-01", "end": "2025-03-10"}},
        "accounts": [{"masked_id": "acct_a", "kind": "TFSA", "currency": "CAD",
                      "first_activity": "2025-03-01", "last_activity": "2025-03-10", "txn_count": 1}],
        "transactions": [],
    }


def test_svg_bar_chart_is_svg():
    out = svg_bar_chart([("2025", 750.0), ("2026", 100.0)])
    assert out.startswith("<svg")
    assert out.rstrip().endswith("</svg>")
    assert "<rect" in out


def test_svg_bar_chart_empty_series():
    out = svg_bar_chart([])
    assert out.startswith("<svg")


def test_render_pages_returns_all_pages():
    pages = render_pages(_store(), _analytics())
    assert set(pages) == {
        "index.html", "growth.html", "contributions.html",
        "cash-flow.html", "income.html", "holdings.html",
    }


def test_pages_link_shared_css_and_are_html():
    pages = render_pages(_store(), _analytics())
    for html in pages.values():
        assert "<!DOCTYPE html>" in html
        assert "../../_assets/personal.css" in html


def test_contributions_page_shows_values():
    pages = render_pages(_store(), _analytics())
    assert "750" in pages["contributions.html"]
    assert "TFSA" in pages["contributions.html"]


def test_no_real_account_code_in_pages():
    pages = render_pages(_store(), _analytics())
    for html in pages.values():
        assert "WK1V04QK2CAD" not in html
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd personal/investments/scripts && uv run pytest tests/test_render.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'investments.render'`.

- [ ] **Step 3: Write minimal implementation**

Invoke `high-end-visual-design` first, then author `personal/_assets/personal.css` (premium dashboard tokens: type scale, spacing, card structure, light/dark variables) and `personal/investments/scripts/investments/render.py`.

`render.py` responsibilities (keep each function <=100 lines, complexity <=8):
- `_html_escape(text: str) -> str`.
- `svg_bar_chart(series, width=640, height=240)`: scale bars to max value, emit `<rect>` per item, `<text>` labels, handle empty series (return an empty framed `<svg>` with a "no data" `<text>`). Use CSS custom-property fills (e.g. `fill="var(--chart-1)"`) so dark mode works.
- `_page(title, body)`: wraps a body string in the full document shell with `<!DOCTYPE html>`, `<link rel="stylesheet" href="../../_assets/personal.css">`, a header with the title and a light/dark toggle button, and a small inline `<script>` that toggles a `data-theme` attribute on `<html>` and persists it to `localStorage`. No external resources.
- `_table(headers, rows)`: build a semantic `<table>`.
- One `render_*` function per page building its body from the analytics dict, then `render_pages` returns `{filename: _page(title, body)}`.
- The overview (`index.html`) shows meta (generated_at, date range, txn/account counts), a KPI row (total contributions, total income, holdings count), and links to the other pages. Every page states the exact-vs-approximate caveat where balances/market value appear.

Write real, complete code for all of the above (no placeholders). Reference the passing tests for required substrings.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd personal/investments/scripts && uv run pytest tests/test_render.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add personal/investments/scripts/investments/render.py personal/_assets/personal.css personal/investments/scripts/tests/test_render.py
git commit -m "feat: render premium HTML analysis pages with inline SVG charts"
```

---

### Task 8: CLI orchestrator, real-data run, and verification

**Files:**
- Create: `personal/investments/scripts/build.py`
- Modify: `personal/investments/log/2026-07-13.md`
- Modify: `hot.md`
- Test: extend `personal/investments/scripts/tests/test_datastore.py` with an end-to-end write test.

**Interfaces:**
- Consumes: all modules.
- Produces: `main(source_dir: Path | None = None) -> int` and a `__main__` guard. Writes `data/datastore.json`, `data/analytics.json`, and the six HTML pages.

- [ ] **Step 1: Write the failing end-to-end test**

Append to `personal/investments/scripts/tests/test_datastore.py`:

```python
def test_end_to_end_build_writes_outputs(tmp_source_dir, tmp_path, monkeypatch):
    import json

    import build

    out_root = tmp_path / "endeavor"
    (out_root / "data").mkdir(parents=True)
    (out_root / "notes").mkdir(parents=True)
    monkeypatch.setattr(build, "ENDEAVOR_ROOT", out_root)
    monkeypatch.setattr(build, "REDACTIONS_PATH", build.SCRIPTS_DIR / "redactions.json")
    rc = build.main(source_dir=tmp_source_dir)
    assert rc == 0
    store = json.loads((out_root / "data" / "datastore.json").read_text())
    assert store["meta"]["txn_count"] > 0
    assert (out_root / "notes" / "index.html").exists()
    blob = (out_root / "data" / "datastore.json").read_text()
    assert "WK1V04QK2CAD" not in blob
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd personal/investments/scripts && uv run pytest tests/test_datastore.py::test_end_to_end_build_writes_outputs -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'build'`.

- [ ] **Step 3: Write the orchestrator**

`personal/investments/scripts/build.py`:

```python
"""CLI orchestrator: build the masked datastore, analytics, and HTML pages."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from investments.analytics import compute_analytics
from investments.datastore import build_datastore
from investments.mask import load_redactions
from investments.render import render_pages

SCRIPTS_DIR = Path(__file__).resolve().parent
ENDEAVOR_ROOT = SCRIPTS_DIR.parent
REDACTIONS_PATH = SCRIPTS_DIR / "redactions.json"
DEFAULT_SOURCE = Path.home() / "Downloads" / "monthly-statements-2022-01-to-2026-07"


def main(source_dir: Path | None = None) -> int:
    """Build the datastore, analytics, and pages; return a process exit code."""
    source = source_dir or DEFAULT_SOURCE
    if not source.is_dir():
        print(f"Source directory not found: {source}", file=sys.stderr)
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
    print(
        f"Built {store['meta']['txn_count']} transactions across "
        f"{len(store['accounts'])} accounts from {store['meta']['file_count']} files."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the end-to-end test**

Run: `cd personal/investments/scripts && uv run pytest tests/test_datastore.py::test_end_to_end_build_writes_outputs -v`
Expected: PASS.

- [ ] **Step 5: Run the full suite, lint, and type check**

Run:

```bash
cd personal/investments/scripts && uv run pytest -q && uv run ruff check && uv run ty check
```

Expected: all tests pass; ruff and ty report no issues.

- [ ] **Step 6: Run against the real statements**

Run:

```bash
cd personal/investments/scripts && uv run python build.py
```

Expected: prints a build summary with a transaction count in the thousands and ~20 accounts.

- [ ] **Step 7: Verify no real account codes leaked and reconcile counts**

Run:

```bash
grep -REo 'WK[0-9A-Z]{9}|HQ[0-9A-Z]{9}|WZ[0-9A-Z]{9}' personal/investments/ || echo "CLEAN: no real codes"
python3 -c "import json,pathlib; d=json.loads(pathlib.Path('personal/investments/data/datastore.json').read_text()); print('txns:', d['meta']['txn_count'], 'accounts:', len(d['accounts']))"
```

Expected: `CLEAN: no real codes`; a sensible txn/account count. Open `personal/investments/notes/index.html` in a browser and confirm the pages and charts render with a working light/dark toggle.

- [ ] **Step 8: Update the log and hot.md, then commit**

Update `personal/investments/log/2026-07-13.md` with the final build summary (counts, pages produced) and add an entry to `hot.md` pointing at the investments endeavor.

```bash
git add personal/investments/data personal/investments/notes personal/investments/scripts/build.py personal/investments/scripts/tests/test_datastore.py personal/investments/log/2026-07-13.md hot.md
git commit -m "feat: build investments datastore, analytics, and pages from statements"
```

---

## Self-Review

**Spec coverage:**
- Normalized masked datastore -> Tasks 4, 5. Two schemas -> Task 2. Field extraction (symbol/qty/price/fx) -> Task 3. Privacy (stable masked ids, redaction, no real codes) -> Tasks 4, 5, 8 verification. Contributions per year/account + registered rollups + RESP grants + limits -> Task 6. Cash flow, income, holdings, balances (exact vs approximate) -> Task 6. HTML pages, premium design, inline SVG, shared CSS, light/dark -> Task 7. Reusable idempotent pipeline -> Tasks 5, 8. FHSA mapping for Home -> Task 4. Verification (reconciliation, no-real-code grep) -> Task 8. All covered.

**Placeholder scan:** Task 7 Step 3 intentionally delegates final CSS/markup authoring to the `high-end-visual-design` skill rather than inlining a full stylesheet, but specifies every function, its signature, required substrings, and behavior, and is bounded by concrete tests. All other steps contain complete runnable code.

**Type consistency:** `RawRow`, `Extracted`, `Redactions`, and the datastore/analytics dict shapes are used consistently across tasks. `build_datastore(source_dir, redactions)`, `compute_analytics(store)`, `render_pages(store, analytics)`, and `svg_bar_chart(series, ...)` signatures match every call site. Registered group map (ManagedTFSA+TFSA -> TFSA) is consistent between spec and Task 6.
