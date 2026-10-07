# Debit Account Reconciliation — Jan 1 to Jun 30, 2026

**Account:** BMO Business ****1004 · 15248132 Canada Inc.
**Source:** 6 statements, `Taxes/2026/Corporate/Debit Account/Statements/`
**Reconciled:** August 3, 2026

## Result

**62 bank transactions · 62 workbook entries · every month ties to the penny.**

| Statement | Bank closing | Workbook closing | |
|---|---:|---:|---|
| Jan 30, 2026 | 140,636.81 | 140,636.81 | ✓ |
| Feb 27, 2026 | 151,834.74 | 151,834.74 | ✓ |
| Mar 31, 2026 | 145,166.85 | 145,166.85 | ✓ |
| Apr 30, 2026 | 148,457.93 | 148,457.93 | ✓ |
| May 29, 2026 | 162,076.80 | 162,076.80 | ✓ |
| Jun 30, 2026 | 167,472.06 | 167,472.06 | ✓ |

Monthly debit and credit totals match the statement summary blocks exactly. The Jan 1 opening balance of 154,616.20 also matches the workbook's Dec 2025 closing, so the chain is continuous from 2025.

## The three lines that aren't 1:1

Neither is an error. Both sides total identically.

**Feb 2 — card payment, bank splits it**
Bank: two Online Transfers of 1,104.13 and 132.41, same reference `TF000****5840`.
Workbook: one line, "credit card payment", 1,236.54.

**May 8 — WISE payment, workbook splits it**
Bank: one Online Bill Payment, WISE, 8,067.15.
Workbook: two lines, freelancer payment 8,008.00 + WISE fee 59.15.
The split is the better record — the fee is separately deductible.

## Flag for the accountant

The May 28 credit of **4,644.90** posts as `CANADA RIT/RIF` — a CRA refund of income tax, not revenue. It currently sits in the Gross and Net Amount columns, so it lifts reported 2026 revenue and income by that amount. Cash-wise it's correct. For the T2 income statement it should be backed out of revenue.

## Not yet verified

July and the three Aug 4 entries have no statement behind them. The July statement will confirm:

- Jul 2 car insurance 700.84 · Jul 10 MIR 8,542.80 · Jul 13 WS 1,000.00
- Jul 15 payroll tax 460.14 · Jul 20 GST prepayment 6,500.00 · Jul 24 MIR 9,492.00
- Jul 27 WS 1,000.00 · Jul 30 car lease 1,750.01 · Jul 31 corp tax 900.00 · Jul 31 salary 2,347.84

Expected July closing: **170,848.03**. Aug 4 items (700.84 + 8,512.00 + 62.76) will likely appear as one WISE debit of 8,574.76 plus the insurance.

## Recurring pattern confirmed by the bank

| Merchant string | Booked as | Cadence |
|---|---|---|
| `MIRSERVICESPAY/PAY` | MIR pay | biweekly, 8,542.80 / 9,492.00 |
| `CERTASDIRECTINS/ASS` | Car insurance | monthly, 700.84 |
| `MBFINANCIALCA` | Car lease | monthly, 1,750.01 |
| `WSINVESTMENTSINV/PLA` | Wealthsimple investment | 49,000 YTD |
| `CANADATXD/DIM` | GST prepayment / corp tax | quarterly 6,500 · monthly 900 |
| `CANACTBUS/ENT` | Payroll taxes | 460.14 |
| `TF...5840` | Credit card payment | monthly |
