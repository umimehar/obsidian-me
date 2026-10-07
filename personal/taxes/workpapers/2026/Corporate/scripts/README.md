# Scripts — 2026 Corporate

Ten scripts. All are standalone; no shared imports.

## 1. `parse_bmo_debit_statements.py`

Turns BMO chequing statement PDFs into a CSV.

```bash
python3 parse_bmo_debit_statements.py \
  "../../../../2026/Corporate/Debit Account/Statements" \
  -y 2026 -o ../parsed_data/debit_2026_parsed.csv
```

Direction (debit vs credit) is derived from the running balance, not column
position — BMO's two-column layout does not survive PDF text extraction, but the
balance column always does. Each statement self-checks: parsed debit and credit
totals must equal the statement's own summary block. Exit code 1 means at least
one statement failed that check.

The `-y` flag is required because BMO's filenames carry no year.

## 1b. `parse_bmo_cc_statements.py`

Parses the corporate Mastercard statements and classifies every line for
deductibility and input tax credits.

```bash
python3 parse_bmo_cc_statements.py "../../../../2026/Corporate/Credit Card" \
  -y 2026 -o ../parsed_data/cc_2026_categorised.csv
```

Two layout traps it handles: the transaction and posting date columns run
together in extracted text ("Dec. 25Dec. 29"), and the annual fee is reported
under "Fees" rather than "Purchases and other charges". Each statement
self-checks three ways, including that the closing balance rolls.

Classification lives in the `RULES` list — ordered, first match wins, catch-all
sweeps restaurants into meals at 50%. Lines a merchant pattern can't place go in
`OVERRIDES`, keyed on (date, amount): the two Mercedes lease signing payments.
`LEASE_CAP` (44.93%) is the s.67.3 ratio for the 2025 GLC 43 lease; it sets the
deductible share of every lease line, here and in `build_transaction_ledger.py`. The
ledger builder then sets the ITC share of every Mercedes cost from any source:
`VEHICLE_USE` (80%) for fuel and maintenance, `VEHICLE_USE × LEASE_CAP` for the lease,
and zero for car costs from Aug 15 to Sep 26, 2025 (Umar's own car, paid by mileage). Hospital charges land in `Personal — review` at
zero. Tax amounts round with `cents()`, half away from zero like Excel's ROUND, so
the ledger matches any spreadsheet built from it. In the ledger builder,
`US_VENDOR` marks chequing rows paid to US software vendors (Vercel etc.) as
non-resident, with no ITC. Until Sep 23, 2026 the catch-all silently filed Mercedes, Apple Store and
hospital charges as meals — add a named rule for any new merchant that isn't food. Non-resident suppliers are flagged and get
no ITC, which is the easiest place to over-claim. Settlements from the chequing
account are excluded and printed at the end so you can tie them to the workbook.

## 1d. `expand_recurring_expenses.py`

Expands the director-funded recurring expenses in
`../parsed_data/recurring_expenses.json` into dated transactions.

```bash
python3 expand_recurring_expenses.py --config ../parsed_data/recurring_expenses.json \
  --today $(date +%F) --out ../parsed_data/personal_recurring.csv
```

Add or change an item by editing the JSON, not the script. `hst_status` decides
whether an ITC arises — `exempt` items (insurance, residential rent) get zero,
which is the guard against the most common over-claim. `claim_pct` carries the
business share while the full amount paid stays on the row.

## 1c. `build_transaction_ledger.py`

Merges the workbook and every categorised card CSV into one normalised table —
`transactions_master.csv` and `.xlsx`. Adding a year is an append.

```bash
soffice --headless --norestore --convert-to xlsx --outdir /tmp "Business Transactions.xlsx"
python3 build_transaction_ledger.py --workbook "/tmp/Business Transactions.xlsx" \
  --cards ../parsed_data/cc_2026_categorised.csv \
          ../../../2025/Corporate/parsed_data/cc_2025_categorised.csv \
  --personal ../parsed_data/personal_recurring.csv ../parsed_data/personal_actuals.csv \
  --out ../parsed_data/transactions_master
```

Schema and example queries are in `../TRANSACTION_LEDGER.md`.

## 2. `verify_workbook.py`

Six integrity checks on `Business Transactions.xlsx`. Run after **every** edit.

```bash
soffice --headless --norestore --convert-to xlsx --outdir /tmp "Business Transactions.xlsx"
python3 verify_workbook.py "/tmp/Business Transactions.xlsx"
```

The LibreOffice step is not optional. The workbook is formula-driven and
openpyxl returns formula strings, not values, unless the file has been
recalculated first.

Checks: balance chain, master vs chain, tab vs master at transaction level,
orphan amounts on undated rows, subtotal arithmetic, formula errors, and each
year subtotal against the dated rows in its window (`WINDOWS`, with named
`WINDOW_EXCEPTIONS`). Each one
corresponds to a bug that has actually occurred in this file — see
`../WORKBOOK_GUIDE.md`.

## 3. `rebuild_balance_chain.py`

Recomputes the hardcoded opening balance on every monthly tab. Needed after any
insert, delete or re-date, because nothing in the workbook enforces that one
month's total equals the next month's opening.

```bash
soffice --headless --norestore --convert-to xlsx --outdir /tmp "Business Transactions.xlsx"
python3 rebuild_balance_chain.py "Business Transactions.xlsx" "/tmp/Business Transactions.xlsx"
soffice --headless --norestore --convert-to xlsx --outdir /tmp "Business Transactions.xlsx"
python3 verify_workbook.py "/tmp/Business Transactions.xlsx"
```

Two file arguments, and they are not interchangeable. The recalculated copy
supplies the computed deltas; the original is what gets written, so it keeps its
formulas and formatting. A backup is written alongside before anything changes.
Running it on a correct workbook reports `0 month(s) corrected`.

## 4. `reconcile_debit_vs_workbook.py`

Matches parsed statement lines against the workbook on date + amount +
direction.

```bash
python3 reconcile_debit_vs_workbook.py \
  ../parsed_data/debit_2026_H1_parsed.csv "/tmp/Business Transactions.xlsx" \
  2026-01-01 2026-06-30
```

Descriptions are deliberately not compared. The bank writes
`MIRSERVICESPAY/PAY`; the workbook writes `MIR pay`.

When lines don't match 1:1, read the leftovers before changing anything. The
script totals both sides — if they agree, it's a split/merge difference, not a
missing transaction. Two known ones as of Aug 2026: the bank splits the Feb 2
card payment into two transfers, and the workbook splits the May 8 WISE debit
into payment plus fee.

## Dependencies

```bash
pip install pdfplumber openpyxl
```

LibreOffice (`soffice`) for recalculation. Installed Sep 23, 2026 to
`~/Applications/LibreOffice.app` (no Homebrew: the Xcode licence blocks it), so
the binary is `~/Applications/LibreOffice.app/Contents/MacOS/soffice`. `cp` is
aliased to `cp -i` in this shell; use `command cp -f` to overwrite parsed CSVs.

## 5. Receipts — `receipts/`

Five scripts that take phone photos and PDFs of card receipts from
`Taxes/2026/Corporate/Credit Card/receipts/`, match each one to a card line in
`transactions_master.csv`, file it, and compress it. Working files (OCR text,
match tables) live in `../parsed_data/receipt_work/`.

1. Drop new receipts into `receipts/uncategorized/`.
2. `ocr_all.py <receipts>/uncategorized ../../parsed_data/receipt_work/ocr_uncat.json`
   — macOS Vision OCR (`uv run --with ocrmac`), no install beyond the package.
3. `match_2026.py` — matches by amount (CAD, or the USD amount in the card
   descriptor), receipt date within 4 days, and merchant name when a receipt has
   no readable date. PDFs prefer the "amount paid" figure. One receipt per card
   line; a second document for the same line is kept as a copy.
4. `organize_receipts.py` (dry run) then `--apply` — renames to
   `DD-Mon-Merchant-Amount-MCxxxx.ext`, files by statement month (a line after the
   28th belongs to the next statement), and compresses losslessly: mozjpeg
   optimisation for JPEG (pixel-identical, checked), oxipng for PNG, pikepdf for
   PDF. EXIF is re-inserted without GPS. Originals go to the macOS Trash.
   Anything the matcher can't place needs a rule in `MANUAL_LINE`, `PERSONAL` or
   `PENDING` — the script stops rather than guess.
5. `build_saira_package.py` — rebuilds `HST Filing 2025-26 - for Saira/`
   (refuses to overwrite; trash the old folder first), then recalculate the
   workpaper with the xlsx skill's `recalc.py` or a LibreOffice `--convert-to xlsx`
   round trip. `--workpaper-only` rewrites just `01 HST 2025-26 workpaper.xlsx` and
   leaves the documents in place.

`match_receipts.py` does the same matching for the 2025 folders
(`Invoices by Month/`, amounts in filenames).

Indexes: `receipts_2026_index.csv` and
`../../2025/Corporate/parsed_data/receipts_2025_hst_period_index.csv`, keyed by
date + description + amount so ledger rebuilds don't break them.

## 6. `personal_actuals.py`

Director-funded expenses with known actual amounts: Bell payments and Rogers
bills (from the account screenshots in `Taxes/2026/Corporate/Director-funded
expenses/`) and the Apr 2, 2026 Mercedes service paid on Umar's Visa. Pass its
CSV to `build_transaction_ledger.py --personal` alongside
`personal_recurring.csv`. The modelled phone/internet line in
`recurring_expenses.json` starts after the last actual (Sep 14, 2026).

## 9. `build_vehicle_personal_use.py` and `build_vehicle_resolution.py`

The Mercedes 20% personal use charge to Umar, settled by offset against what the
corporation owes him.

```bash
uv run --with openpyxl python build_vehicle_personal_use.py \
  --ledger ../parsed_data/transactions_master.csv \
  --out "../../../../2026/Corporate/Vehicle personal use 2026.xlsx"
uv run --with python-docx python build_vehicle_resolution.py \
  --out "../../../../2026/Corporate/[Pending]Vehicle_Personal_Use_Resolution_2026.docx"
```

The workbook takes 2026 vehicle rows from the ledger and adds Sep–Dec estimates
(`ESTIMATES`, fuel at the Jan–Aug monthly average). Delete those once the December
statements are in the ledger. The resolution's Schedule A is hardcoded in `SCHEDULE`;
copy the workbook's Summary tab into it and re-run.
