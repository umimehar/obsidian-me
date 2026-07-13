"""Shared pytest fixtures providing small representative CSV samples."""

from pathlib import Path

import pytest

ACCOUNT_CSV = (
    '"date","transaction","description","amount","balance","currency"\n'
    '"2026-06-03","BUY","L - Loblaw Cos. Ltd.: Bought 1.0000 shares at $61.49 '
    'per share (executed at 2026-06-02)","-61.49","932.23","CAD"\n'
    '"2026-06-04","BUY","VFV - Vanguard S&P 500: Bought 0.5000 shares '
    '(executed at 2026-06-03)","-40.0","892.23","CAD"\n'
    '"2026-06-05","CONT","Contribution (executed at 2026-06-05)","500.0","1392.23","CAD"\n'
    '"2026-06-05","E_TRFIN","Interac e-Transfer® Received from Test Person '
    'Name","660.0","2052.23","CAD"\n'
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
    path = tmp_path / "Managed (TFSA)-2026-06-01-monthly-statement-transactions-XX0TEST001CAD.csv"
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
