# Corporate credit card — 2026

BMO Ascend World Elite Business Mastercard, card **XXXX 5840**.
Seven statements, Jan 28 – Jul 28 2026, covering Dec 29 2025 – Jul 28 2026.
Parsed and classified Aug 3, 2026.

> **Sep 23, 2026 update.** The Aug 28 statement is loaded: 30 lines, $2,833.88
> of purchases, $2,254.15 settled from chequing on Aug 4. Through Aug 28 the
> 2026 card totals $13,389.04 net spend, $9,747.10 deductible, $873.38 ITC,
> running at $1,673.63/month. New rules file hospital charges as
> `Personal — review` (Credit Valley $1,221.00 on Jul 27) and Corporations
> Canada fees as `Government fees`. The tables below are the Aug 3 snapshot;
> `2026_YTD_STATUS.md` and the dashboard carry the current figures.

Only card 5840 appears in 2026. The supplementary card 2898, which shared the
2025 statements, has no activity this year.

## Parse quality

All seven statements pass three checks each: parsed purchases equal
purchases + fees, parsed credits equal payments and credits, and the closing
balance rolls from previous − payments + purchases + fees. 194 lines.

Settlements from the chequing account total **$9,465.95** across 8 transfers,
matching the seven "credit card payment" rows in the workbook to the cent. The
card side also explains the Feb 2 split that showed up in the bank
reconciliation: $1,104.13 (January's closing balance) plus $132.41, paid the
same day.

## Spend, 1 Jan – 28 Jul 2026

| Category | Lines | Spend | Deductible | ITC |
|---|---:|---:|---:|---:|
| Meals & entertainment | 115 | $3,822.98 | $1,911.49 | $219.02 |
| Vehicle & fuel | 35 | $3,107.48 | $3,107.48 | $357.46 |
| Software & subscriptions | 13 | $2,208.69 | $2,208.69 | $44.32 |
| Travel & parking | 8 | $580.91 | $580.91 | $66.84 |
| Office & supplies | 13 | $402.60 | $402.60 | $46.32 |
| Telecom | 1 | $190.97 | $190.97 | $21.97 |
| Bank fees | 1 | $175.00 | $175.00 | — |
| Fines & penalties | 2 | $66.53 | — | — |
| **Total** | **188** | **$10,555.16** | **$8,577.14** | **$755.93** |

Net of $343.30 in merchant refunds (two Amazon, one Temu).

## The headline: spend is running at half of last year

| | Per month |
|---|---:|
| 2026, Jan–Jul | **$1,507.88** |
| 2025, full year | $2,953.36 |

That matters because the 2026 corporate tax instalments are deliberately set
below CRA's schedule on the expectation of higher expenses. The card is not
where those expenses are. See `CORP_TAX_INSTALMENTS_2026.md`.

## Classification rules

Ordered, first match wins, catch-all sweeps restaurants into meals.

- **Meals & entertainment** — 50% deductible and 50% ITC (ITA s.67.1).
- **Fines & penalties** — not deductible (ITA s.67.6). Two lines, $66.53: a
  Toronto parking ticket and its convenience fee.
- **Annual fee $175.00** — deductible, but a financial service, so no HST in
  the price and no ITC. BMO raised it from $149 effective June 2026.
- **Non-resident suppliers** — $1,838.91 of spend billed by US vendors
  (Z.AI via Stripe $939.52, Claude/Anthropic $693.16, OpenAI, Vercel). No
  Canadian HST is charged, so **no ITC**. This is the easiest place to
  over-claim; the classifier flags them in the `supplier` column.

HST in price is `amount × 13/113`.

## ITCs are bigger than the card alone

The card is one of three sources in the GST period 15 Aug 2025 – 14 Aug 2026:

| Source | Category | ITC |
|---|---|---:|
| Chequing | Vehicle lease — before the s.67.3 cap | $2,013.30 |
| Card | Meals & entertainment (50%) | $1,042.72 |
| Card | Vehicle & fuel | $554.91 |
| Card | Office & supplies | $359.52 |
| Chequing | Professional fees | $214.50 |
| Card | Travel & parking | $118.47 |
| Card | Software & subscriptions | $63.87 |
| Chequing | Software & subscriptions | $48.89 |
| Card | Telecom | $21.97 |
| | **Identified total** | **$4,438.15** |

Against HST collected of $26,972.40 and $26,000.00 prepaid, that turns $972.40
owing into a **refund of about $3,466**. Every line is traceable in
`parsed_data/transactions_master.csv` — filter `gst_period == "2025-26"` and sum
`itc_claimable`. The lease figure is before the s.67.3 passenger-vehicle cap, so
the accountant will trim it. Card data stops 28 Jul, so 1–14 Aug adds a little more.

For comparison, the accountant claimed $3,900.43 for the prior period. The ledger's
$4,303.67 for that window is not comparable: it counts a $2,667.60 CRA GST remittance
(Oct 9, 2024, category Other) as an ITC. Without it the ledger gives about $1,636.

## What is still missing

Nothing here captures expenses Umar funds personally — home office rent,
phone, insurance, personal-card business spend. Those totalled **$41,357** in
2025 and are the single largest deduction not yet in the 2026 numbers. Until
they are tracked, the corporate tax projection carries a swing of roughly
$5,000 in tax.

## The 2025 statements had to be re-parsed

The existing `2025/Corporate/parsed_data/cc_statements_parsed.csv` truncates
merchant names on wrapped lines — "SHELL C11301" became "C11301", and
"TRSF FROM/DE ACCT" became "FROM/DE ACCT". That broke classification badly:
chequing settlements were being counted as spend, and fuel was falling through to
meals at half the ITC. All 12 statements were re-parsed with the current script
into `2025/Corporate/parsed_data/cc_2025_categorised.csv`, which self-checks
clean. Net 2025 spend $35,409.82 against the accountant's $35,440.32 — a $30
difference from cash-back rebate handling.

**Use the categorised file, not the old dump.**

## Reproducing

```bash
python3 scripts/parse_bmo_cc_statements.py \
  "../../2026/Corporate/Credit Card" -y 2026 \
  -o parsed_data/cc_2026_categorised.csv
```
