# Transaction ledger

`parsed_data/transactions_master.csv` and `.xlsx` — every transaction from every
source in one table, one schema. Built Aug 3, 2026.

**781 rows · tax years 2023–2026 · GST periods 2023-24 through 2026-27**

| Source | Rows | Covers |
|---|---:|---|
| `debit` — BMO chequing ****1004 | 302 | Aug 2023 – Aug 2026 (workbook master tab) |
| `card` — BMO Mastercard 5840 | 430 | Jan 2025 – Jul 2026 (19 statements) |
| `personal` — director-funded, reimbursable | 49 | Aug 2025 – Dec 2026 (recurring, expanded) |

The xlsx has frozen headers, autofilter on every column, and money formatting —
open it and filter, no tooling needed. The CSV is for scripts.

## Schema

| Column | Meaning |
|---|---|
| `date` | transaction date, ISO |
| `source` | `debit`, `card`, or `personal` |
| `account` | which account it moved through |
| `direction` | `in`, `out`, or `refund` |
| `amount` | always positive; `direction` carries the sign |
| `gross` / `hst` / `net` | revenue split — debit deposits only |
| `description` | as it appears on the statement |
| `category` | see below |
| `deductible_pct` | 1.0, 0.5 for meals, 0.0 for fines and non-expenses |
| `hst_in_price` | HST embedded in the price; 0 for non-residents and exempt supplies |
| `itc_pct` | fraction of that HST claimable |
| `itc_claimable` | `hst_in_price × itc_pct` |
| `supplier` | `Canadian` or `non-resident` |
| `tax_year` | calendar year — drives the T2 |
| `gst_period` | the Aug 15 – Aug 14 window, labelled by opening year |
| `ref` | statement filename or workbook tab |

`tax_year` and `gst_period` are precomputed precisely because the corporate year
(Jan–Dec) and the HST period (Aug–Aug) don't line up. Filter on the one the
question needs.

## Categories

Revenue · Investments (not expense) · Tax & GST remittances · Card settlement ·
Director payments · Salary · Subcontractor · Bank & transfer fees · Cash back
rebate · Fines & penalties · Professional fees · Vehicle — lease · Vehicle —
insurance · Vehicle & fuel · Software & subscriptions · Telecom · Travel &
parking · Office & supplies · Meals & entertainment · Other

Non-expense outflows — investments, remittances, card settlements, director
payments — carry `deductible_pct = 0` so a naive sum of deductible spend can't
double-count them against the card lines that settled.

## Queries

```python
import pandas as pd
t = pd.read_csv('transactions_master.csv')

# spend by category for the corporate year
t[(t.tax_year==2026) & t.direction.isin(['out','refund'])] \
 .assign(a=lambda d: d.amount*d.direction.map({'out':1,'refund':-1})) \
 .groupby('category').a.sum().sort_values(ascending=False)

# ITCs for an HST filing
t[t.gst_period=='2025-26'].itc_claimable.sum()          # 3,841.35

# deductible expense, meals already halved
d = t[(t.tax_year==2026) & (t.direction=='out')]
(d.amount * d.deductible_pct).sum()

# what did US suppliers cost, and confirm none carry an ITC
t[t.supplier=='non-resident'].groupby('tax_year').amount.sum()
```

## Rebuilding

```bash
soffice --headless --norestore --convert-to xlsx --outdir /tmp "Business Transactions.xlsx"
python3 scripts/build_transaction_ledger.py \
  --workbook "/tmp/Business Transactions.xlsx" \
  --cards parsed_data/cc_2026_categorised.csv \
          ../../2025/Corporate/parsed_data/cc_2025_categorised.csv \
  --out parsed_data/transactions_master
```

Adding a year is an append: parse the new statements with
`parse_bmo_cc_statements.py`, then pass the extra CSV to `--cards`.

## Reconciliation

Checked against figures derived independently:

| | Ledger | Expected |
|---|---:|---:|
| 2026 debit deposits, gross | $138,482.10 | $138,482.10 |
| 2026 debit withdrawals | $131,525.87 | $131,525.87 |
| 2026 card net spend | $10,555.16 | $10,555.16 |
| 2025 card net spend | $35,409.82 | $35,440.32 (accountant) |

The $30 on 2025 card spend is cash-back rebate treatment.

## Known gaps

- **Card 2898** — the supplementary card on the 2025 statements is included; it
  has no 2026 activity.
- **Aug 2026 card statement** not issued yet, so 1–14 Aug spend is missing from
  the 2025-26 GST period.
- **Director-funded expenses are partially in.** The three recurring items
  (insurance, phone and internet, 30% of rent) are expanded from
  `recurring_expenses.json` — $11,133.96 for 2026. Mileage, vehicle service and
  ad-hoc personal-card business spend are still missing; those made up most of
  the $41,357 claimed in 2025. `personal_cc_parsed.csv` in the 2025 workspace is
  the template.
- **`personal` rows after today are projections**, marked in the `ref` column.
