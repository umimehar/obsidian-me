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


def test_classify_gold_ounces_extracts_qty_and_price():
    row = _account_row(
        "BUY",
        "GOLD - Physically backed gold: Bought 0.2273 ounces at $6942.54 per ounce "
        "(executed at 2026-05-01)",
        "-1578.00",
    )
    out = classify(row)
    assert out.symbol == "GOLD"
    assert out.quantity == 0.2273
    assert out.unit_price == 6942.54


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


def test_classify_buy_without_price_derives_unit_price():
    row = _account_row(
        "BUY",
        "VFV - Vanguard S&P 500: Bought 0.5000 shares (executed at 2026-06-03)",
        "-40.0",
    )
    out = classify(row)
    assert out.symbol == "VFV"
    assert out.quantity == 0.5
    assert out.unit_price == 80.0


def test_normalize_unknown_code_is_other():
    assert normalize_type("MYSTERY", 1.0, SCHEMA_ACCOUNT) == "OTHER"


def test_card_refund_is_card_refund():
    from investments.parse import RawRow

    row = RawRow(
        source_file="c.csv",
        schema=SCHEMA_CARD,
        fields={
            "transaction_date": "2026-05-01",
            "post_date": "2026-05-02",
            "type": "Refund settled",
            "details": "AMZN",
            "amount": "-9.99",
            "currency": "CAD",
        },
    )
    assert classify(row).type == "CARD_REFUND"
