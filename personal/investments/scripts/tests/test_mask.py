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
    a = mask_account_code("XX0TEST001CAD")
    b = mask_account_code("XX0TEST001CAD")
    assert a == b
    assert a.startswith("acct_")
    assert mask_account_code("XX0TEST001CAD") != mask_account_code("XX0TEST002CAD")


def test_account_code_from_filename():
    name = "Managed (TFSA)-2026-06-01-monthly-statement-transactions-XX0TEST001CAD.csv"
    assert account_code_from_filename(name) == "XX0TEST001CAD"


def test_account_code_from_card_filename():
    name = (
        "Wealthsimple-credit-card-2026-06-01-credit-card-statement-transactions-"
        "ca-credit-card-exusOFBgLg.csv"
    )
    assert account_code_from_filename(name) == "card"


def test_detect_kind_variants():
    assert detect_kind("Home-2026-06-01-...-XXHOME001CAD.csv") == "FHSA"
    assert detect_kind("Managed (TFSA)-...-XXMGD0001CAD.csv") == "ManagedTFSA"
    assert detect_kind("TFSA-...-XXTFSA001CAD.csv") == "TFSA"
    assert detect_kind("Person’s-RRSP-...-XXRRSP001CAD.csv") == "RRSP"
    assert detect_kind("Family-RESP-...-XXRESP001CAD.csv") == "RESP"
    assert detect_kind("Crypto-...-XXCRYP001CAD.csv") == "Crypto"
    assert detect_kind("Wealthsimple-credit-card-...-exusOFBgLg.csv") == "CreditCard"


def test_redact_removes_names(tmp_path: Path):
    red = Redactions(names=["Test Person Name", "Second"], account_label_people={})
    text = "Received from Test Person Name and Second"
    assert "Test Person" not in redact(text, red)
    assert "Second" not in redact(text, red)


def test_load_redactions(tmp_path: Path):
    path = tmp_path / "redactions.json"
    path.write_text('{"names": ["First"], "account_label_people": {"First": "Person A"}}')
    red = load_redactions(path)
    assert red.names == ["First"]
    assert red.account_label_people == {"First": "Person A"}
