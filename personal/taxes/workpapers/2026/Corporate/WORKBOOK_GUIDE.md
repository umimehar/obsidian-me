# Business Transactions.xlsx — how it works and how to not break it

Location: `Taxes/Business Transactions.xlsx`
Covers Sep 2023 → present. 37 tabs.

## Layout

**`T 23-26`** — the master. Every transaction, chronological, plus year and
fiscal-year subtotals and the summary block at the top. Renamed from `T 23-25`
on Aug 3, 2026 when 2026 data pushed past the old name.

**`T 23 - 24`** — archived earlier master. Not maintained. Leave it alone.

**36 monthly tabs** — `Sep`, `Oct`, `Nov`, `Dec` (2023), then `Jan`…`July`,
`Aug 2024` onward. The 2023–mid-2024 tabs carry no year in the name. They are
not alphabetically sortable; the correct order is hardcoded in
`scripts/verify_workbook.py` as `ORDER`.

## Columns

| Col | Meaning |
|---|---|
| A | Date |
| B | Transaction description |
| C | Type — `Incoming` / `Outgoing` |
| D | Gross amount (money in, HST included) |
| E | GST/HST portion |
| F | Net amount (money in, HST stripped) |
| G | Payout amount (money out) |
| H, I | Notes |

Money in uses D/E/F. Money out uses G only. A row never uses both.

On monthly tabs, E and F are formulas: `=ROUND(D*13/113,2)` and
`=ROUND(D/1.13,2)`. On the master they are typed values. Rows with a blank D
compute to zero, which is why non-revenue outflows are harmless there.

## Row anatomy — monthly tabs

| Row | Contents |
|---|---|
| 1 | `F1` = net minus payouts; `I1` = **Closing Balance** — this is the real bank balance and should match the statement |
| 3 | Totals — `=SUM(D5:D116)` etc. Includes row 5. |
| 4 | Header |
| 5 | **Starting Balance — hardcoded values, not formulas** |
| 6 | Blank separator |
| 7+ | Transactions |

## The trap: the balance chain is manual

Each month's row 3 total becomes the next month's row 5 starting balance. Nothing
enforces this. Row 5 holds typed numbers. **Insert, delete, or re-date a
transaction and every downstream month silently goes stale.**

To rebuild: recalculate the workbook, compute each tab's delta
(`row 3 − row 5`), then walk `ORDER` writing `start[n] = start[n-1] + delta[n-1]`.
Deltas are independent of the starting balances, so one pass is enough.

## The trap: subtotal rows hold hand-written ranges

Master subtotal rows and what they cover:

| Row | Period | Shape |
|---|---|---|
| 6 | FY 2023-24 | `SUM(D8:D36) + SUM(D40:D91)` |
| 7 | CY 2023 | |
| 39 | CY 2024 | `SUM(D40:D140) - D95` |
| 95 | FY 2024-25 | `SUM(D96:D204) - D142` |
| 142 | CY 2025 | `SUM(D143:D245) - D205` |
| 205 | FY 2025-26 | `SUM(D206:D246) + SUM(D248:D327)` |
| 247 | CY 2026 | `SUM(D248:D327) + SUM(D329:D1027)` |
| 328 | FY 2026-27 | `SUM(D329:D1027)` |

Row 3 sums everything and subtracts rows 39, 95, 142, 205, 247, 328 so nested
subtotals aren't double-counted.

FY rows sit inline at the Aug 14 / Aug 15 boundary. Row 328 was added Sep 23,
2026 between the Aug 14 payroll remittance (row 327) and the Aug 21 MIR deposit
(row 329). When the next boundary arrives (Aug 14, 2027), add the FY 2027-28 row
the same way and add it to `SUBTOTAL_ROWS` and `WINDOWS` in `verify_workbook.py`.

Three filed-year rows sit outside their date window on purpose: rows 36–37 (Jan 16,
2024 payout for Dec 2023 work, kept in 2023) and row 93 (Aug 15, 2024 dividend,
kept in the FY 2023-24 block). `WINDOW_EXCEPTIONS` in the verify script names them.

Two real bugs found here on Aug 3, 2026:

- **Row 247** subtracted `D311`/`G311`. Row 311 is a live transaction (Jul 2
  car insurance, $700.84), not a subtotal. Someone extended the block and the
  reference drifted. 2026 payouts were understated by $700.84.
- **Row 205 column G** summed only `G206:G253` while D and F summed to row 1027.
  Payouts stopped mid-January. Reported $85,978.63 against an actual
  $209,138.72.

**When you add rows past the end, check that every subtotal's ranges still cover
them and that nothing subtracts a transaction row.** The four columns of a
subtotal must use identical ranges.

## The trap: orphan amounts

A net amount of $4,960.50 was sitting in a blank, undated row 6 on the Nov 2025
tab. Row 3's `SUM(F5:F116)` picked it up, so every closing balance from November
onward was inflated while the master knew nothing about it. It belonged to the
Oct 10 GST refund.

`verify_workbook.py` check 4 catches this. Paste carefully.

## MINUS() vs plain subtraction

The workbook used Excel's `MINUS(a,b)` in 43 places. LibreOffice evaluates it to
0, so any headless recalculation silently zeroed the tax and GST summary cells.
All were rewritten as `(a - b)` on Aug 3, 2026. **Don't reintroduce `MINUS()`.**

## Side-panel lists

Columns K–Q of the master hold hand-maintained lists of row references:
`L248` (2026 Wealthsimple investments), `Q247` (2026 corp tax paid), `Q205`
(2025-26 GST prepayments), `L143` (2025 MIR). Extend them when you add a row of
that kind; nothing checks them.

## Adding a month safely

1. Add the transactions to the master, chronologically.
2. Add the same transactions to the monthly tab from row 7 down.
3. Confirm every subtotal range still reaches the new rows.
4. Recalculate: `soffice --headless --convert-to xlsx --outdir /tmp "Business Transactions.xlsx"`
5. Rebuild the balance chain — `scripts/rebuild_balance_chain.py`.
6. Run `scripts/verify_workbook.py` — seven checks, including every year subtotal
   against the transactions dated inside its window.
7. Cross-check against the statement with `scripts/reconcile_debit_vs_workbook.py`.

## Reading it with openpyxl

`openpyxl.load_workbook(path)` gives formulas. `data_only=True` gives the last
values Excel cached — which are **absent** if the file was last written by
openpyxl. Always recalculate through LibreOffice first, then read the converted
copy with `data_only=True`. Save the original, not the converted copy;
LibreOffice round-trips lose some styling.
