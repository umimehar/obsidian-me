from pathlib import Path

from investments.datastore import build_datastore
from investments.mask import Redactions

RED = Redactions(names=["Test Person Name"], account_label_people={})


def test_build_datastore_shape(tmp_source_dir: Path):
    store = build_datastore(tmp_source_dir, RED)
    assert set(store) == {"meta", "accounts", "transactions"}
    assert store["meta"]["file_count"] == 2
    assert store["meta"]["txn_count"] == len(store["transactions"])


def test_no_real_codes_in_datastore(tmp_source_dir: Path):
    store = build_datastore(tmp_source_dir, RED)
    blob = str(store)
    assert "XX0TEST001CAD" not in blob
    assert all(a["masked_id"].startswith("acct_") for a in store["accounts"])


def test_names_are_redacted(tmp_source_dir: Path):
    store = build_datastore(tmp_source_dir, RED)
    blob = str(store)
    assert "Test Person Name" not in blob


def test_contrib_and_types_present(tmp_source_dir: Path):
    store = build_datastore(tmp_source_dir, RED)
    types = {t["type"] for t in store["transactions"]}
    assert "CONTRIB" in types
    assert "BUY" in types


def test_identical_rows_are_all_kept(tmp_path: Path):
    content = (
        '"date","transaction","description","amount","balance","currency"\n'
        '"2026-06-01","NRT","Non-resident tax (executed at 2026-06-01)","-0.01","2.0","CAD"\n'
        '"2026-06-01","NRT","Non-resident tax (executed at 2026-06-01)","-0.01","1.99","CAD"\n'
        '"2026-06-01","NRT","Non-resident tax (executed at 2026-06-01)","-0.01","1.98","CAD"\n'
    )
    (tmp_path / "A-2026-06-01-transactions-XX0TEST700CAD.csv").write_text(content)
    store = build_datastore(tmp_path, RED)
    assert store["meta"]["txn_count"] == 3


def test_end_to_end_build_writes_outputs(tmp_source_dir, tmp_path, monkeypatch):
    import json

    import build

    out_root = tmp_path / "endeavor"
    (out_root / "data").mkdir(parents=True)
    (out_root / "notes").mkdir(parents=True)
    monkeypatch.setattr(build, "ENDEAVOR_ROOT", out_root)
    # Use the committed example list (redactions.json is gitignored and may be absent in CI).
    monkeypatch.setattr(build, "REDACTIONS_PATH", build.SCRIPTS_DIR / "redactions.example.json")
    rc = build.main(source_dir=tmp_source_dir)
    assert rc == 0
    store = json.loads((out_root / "data" / "datastore.json").read_text())
    assert store["meta"]["txn_count"] > 0
    assert (out_root / "notes" / "index.html").exists()
    blob = (out_root / "data" / "datastore.json").read_text()
    assert "XX0TEST001CAD" not in blob
