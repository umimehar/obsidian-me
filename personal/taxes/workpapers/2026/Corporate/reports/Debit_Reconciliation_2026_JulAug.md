# Debit Account Reconciliation — Jul 1 to Aug 31, 2026

**Account:** BMO Business ****1004 · 15248132 Canada Inc.
**Source:** 2 statements, `Taxes/2026/Corporate/Debit Account/Statements/` (July 31, August 31)
**Parsed to:** `parsed_data/debit_2026_JulAug_parsed.csv`
**Reconciled:** September 23, 2026

## Result

**22 bank transactions · 23 workbook entries · both months tie to the penny.**

| Statement | Bank closing | Workbook closing | |
|---|---:|---:|---|
| Jul 31, 2026 | 170,848.03 | 170,848.03 | ✓ |
| Aug 31, 2026 | 163,061.21 | 163,061.21 | ✓ |

Both statements pass the parser's self-check: parsed debits and credits equal each statement's summary block (Jul: 14,658.83 out, 18,034.80 in; Aug: 25,821.62 out, 18,034.80 in). July's closing balance is the figure projected on Aug 3.

July's ten workbook entries were already booked and are now confirmed. August had three entries booked on Aug 3; the other ten were added on Sep 23:

| Date | Workbook description | Amount | Bank string |
|---|---|---:|---|
| Aug 4 | credit card payment | 2,254.15 out | `TF000****5840` |
| Aug 7 | MIR pay | 9,492.00 in | `MIRSERVICESPAY/PAY` |
| Aug 10 | Wealthsimple investment | 1,000.00 out | `WSINVESTMENTSINV/PLA` |
| Aug 14 | Payroll Taxes | 460.14 out | `CANACTBUS/ENT` |
| Aug 21 | MIR pay | 8,542.80 in | `MIRSERVICESPAY/PAY` |
| Aug 24 | Wealthsimple investment | 5,000.00 out | `WSINVESTMENTSINV/PLA` |
| Aug 31 | Car lease | 1,750.01 out | `MBFINANCIALCA` |
| Aug 31 | Corp tax (2026) | 900.00 out | `CANADATXD/DIM` |
| Aug 31 | salary to Maham | 2,347.84 out | Interac e-Transfer |
| Aug 31 | credit card payment | 2,833.88 out | `TF000****5840` |

## The one line that isn't 1:1

**Aug 4 — WISE payment, workbook splits it.** Bank: one Online Bill Payment, 8,574.76. Workbook: freelancer payment 8,512.00 + WISE fee 62.76. Same pattern as May 8.

## Card settlements tie

The Aug 4 transfer of 2,254.15 equals the credits on the Aug 28 Mastercard statement. The Aug 31 transfer of 2,833.88 equals that statement's purchases and will show as a credit on the Sep 28 statement.

## Workbook change: fiscal year 2026-27 opened

Aug 14 closes the HST year, so the master tab now has a `Fiscal year 2026-2027` subtotal at row 328, between the Aug 14 payroll remittance and the Aug 21 MIR deposit. Row 205 (FY 2025-26) now stops at row 327; row 247 (CY 2026) spans both sides of row 328; row 3 subtracts row 328. `verify_workbook.py` has a seventh check that ties every year subtotal to the transactions dated inside its window.

## Not yet verified

September onward. The Sep 1 car insurance debit ($700.84, last of the expiring term) and the Sep 4 and Sep 18 MIR deposits will appear on the Sep 30 statement.
