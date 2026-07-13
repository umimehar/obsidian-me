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
    assert len(rows) == 5
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
    path = tmp_path / "X-2026-06-01-monthly-statement-transactions-XX0TEST900CAD.csv"
    path.write_text(content, encoding="utf-8")
    rows = parse_csv(path)
    assert len(rows) == 1
    assert "line two with comma" in rows[0].fields["description"]


def test_discover_csvs_sorted_no_dotfiles(tmp_source_dir: Path):
    (tmp_source_dir / ".DS_Store").write_text("x")
    found = discover_csvs(tmp_source_dir)
    assert all(p.suffix == ".csv" for p in found)
    assert found == sorted(found)
