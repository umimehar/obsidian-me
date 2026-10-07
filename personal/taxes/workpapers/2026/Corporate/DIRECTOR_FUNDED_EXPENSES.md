# Director-funded expenses — for the accountant

Costs Umar pays on his **personal card** and the corporation reimburses. Held as
a separate source in the ledger (`source == "personal"`) so they can be handed
over on their own, without being mixed into the chequing or Mastercard data.

Set up Aug 3, 2026. Config: `parsed_data/recurring_expenses.json`.

## The three items

| Item | Paid | Business share | Claimed / yr | HST | ITC / yr | Cadence |
|---|---:|---:|---:|---|---:|---|
| Home insurance | $32.83/mo | 100% | $393.96 | exempt | — | 1st of the month |
| Phone and internet | $115.00/mo | 100% | $1,380.00 | taxable | $158.76 | 1st of the month |
| Rent — home office | $2,600.00/mo | 30% | $9,360.00 | exempt | — | 15th of the month |
| **Total, tax year 2026** | | | **$11,133.96** | | **$158.76** | |

Phone and internet is the average of the usual $113 and this month's $117.

## Only one of the three carries an ITC

This is the part that is easy to get wrong.

- **Insurance is an exempt financial service.** No HST is charged, so there is
  nothing to claim. Applying 13/113 to it would be an over-claim.
- **Residential rent is an exempt supply.** Same conclusion. A landlord renting
  a residential unit does not charge HST, whatever share of it the business uses.
- **Phone and internet is taxable.** HST is in the price, so the ITC is
  $115.00 × 100% × 13/113 = **$13.23/month**, $158.76 a year.

The config records this per item as `hst_status`, and the expander refuses to
compute an ITC on anything not marked `taxable`.

## Why the full rent is recorded, not the 30%

Every row carries the amount actually paid ($2,600) with `deductible_pct` at
0.30. The claim is `amount × deductible_pct`. This keeps the source document and
the claim both visible, and matches how meals are held at 50% elsewhere in the
ledger. It also means changing the home-office percentage is a one-field edit
rather than a recalculation.

30% matches the rate used on the filed 2025 T2 — Schedule 125 line 8910 showed
$9,335 of rent against $9,360 projected here, so the basis is consistent and
already survived one filing.

## What this does and does not cover

These three close **$11,133.96** of the **$30,132.49** of director-funded
expenses needed to bring 2026 corporate tax down to the $10,500 of instalments
already scheduled. In 2025 the equivalent total was **$41,357**, the balance
being vehicle and mileage costs plus ad-hoc personal-card business spend.

So there is roughly **$19,000 of deductions still untracked**. Worth adding next:

- Mileage — logs existed for 2025 (`2025/Corporate/Personal CC Expenses/`)
- Vehicle service, washes and parking paid personally
- Any one-off business purchases on the personal card

`2025/Corporate/parsed_data/personal_cc_parsed.csv` shows what was captured last
year and is the natural template.

## Adding or changing an item

Edit `parsed_data/recurring_expenses.json`, then:

```bash
python3 scripts/expand_recurring_expenses.py \
  --config parsed_data/recurring_expenses.json \
  --today $(date +%F) \
  --out parsed_data/personal_recurring.csv

python3 scripts/build_transaction_ledger.py \
  --workbook "/tmp/Business Transactions.xlsx" \
  --cards parsed_data/cc_2026_categorised.csv \
          ../../2025/Corporate/parsed_data/cc_2025_categorised.csv \
  --personal parsed_data/personal_recurring.csv \
  --out parsed_data/transactions_master
```

Each item takes `starts` and `ends`, so stopping one is a date, not a deletion —
history stays intact.

## Handing it to Ejaz

```python
import pandas as pd
t = pd.read_csv('parsed_data/transactions_master.csv')
p = t[(t.source=='personal') & (t.tax_year==2026)]
p.assign(claimed=p.amount*p.deductible_pct) \
 .groupby('category')[['amount','claimed','itc_claimable']].sum()
```

Rows generated after today are marked `projected` in the `ref` column — filter
them out if he wants actuals only.

## Reimbursement owed to Umar

Nothing has been paid out for these in 2026. They accrue as an amount the
corporation owes the director — the same treatment Ejaz applied for 2025, see
`../../2025/Corporate/T2_2025_FILED_AUDIT_PROTECTION.md` §5a.

| | |
|---|---:|
| Opening balance at 31 Dec 2025 — filed Schedule 100, line 2780 | $13,357.00 |
| Accrued 1 Jan – 23 Sep 2026 (rent 30%, actual phone and internet, insurance, Mercedes service Apr 2) | $8,704.33 |
| Less Credit Valley charges put on the corporate card, Jul 27 | −$1,221.00 |
| Less Mercedes personal use, 20% of corp-paid costs Jan–Aug (lease, insurance, fuel, washes) | −$4,657.56 |
| Less 20% of the Apr 2 Mercedes service Umar paid (claim it at 80%) | −$70.79 |
| Reimbursements paid in 2026 | $0.00 |
| **Owed at 23 Sep 2026** | **$16,111.98** |
| Still to accrue to 31 Dec (rent Oct–Dec, phone Oct–Dec, insurance Oct–Dec) | $2,804.49 |
| Less Mercedes personal use Sep–Dec (estimate) | −$2,391.13 |
| **Owed at 31 Dec 2026 (estimate)** | **$16,525.34** |

### Mercedes personal use offset (added Oct 7, 2026)

Mercedes business use is 80%. The corporation pays the lease, insurance, fuel and washes in
full, so the 20% personal share is charged to Umar by offset against this balance, not paid in
cash. Authority: `Taxes/2026/Corporate/[Pending]Vehicle_Personal_Use_Resolution_2026.docx`
(sign it, minute book). Workings: `Taxes/2026/Corporate/Vehicle personal use 2026.xlsx`,
built by `scripts/build_vehicle_personal_use.py` from the ledger. Full year estimate
**$7,119.48** ($4,728.35 actual Jan–Aug, $2,391.13 estimated Sep–Dec). Replace the estimates
with actuals after the December statements and book one entry at Dec 31: Dr Due to
shareholder, Cr vehicle expenses.

The s.67.3 lease cap is **not** charged to Umar. It limits the deduction on the business 80%;
the excess is a non-deductible cost the corporation absorbs.

Rent rose from $2,600 to $2,630 with the Sep 15, 2026 payment, so the rent share is
$789.00/month from then on (was $780.00). Accruing at about **$934.83/month**: rent
$789.00 + phone $113.00 + insurance $32.83.

Accrued 1 Jan – 23 Sep 2026, by item:

| Item | Claimed |
|---|---:|
| Rent — home office share (8 × $780 + 1 × $789) | $7,029.00 |
| Phone and internet (Bell and Rogers actuals, net of the Rogers credit) | $1,025.92 |
| Mercedes service, Apr 2 (personal Visa) | $353.94 |
| Home insurance (9 × $32.83) | $295.47 |
| **Total** | **$8,704.33** |

### The double-count trap

`personal_recurring.csv` starts at **15 Aug 2025** because the HST period does,
and those Aug–Dec 2025 rows carry ITCs that belong to the 2025-26 return. But
that $4,491.32 of claimed expense is **already inside the $13,357** — the filed
2025 T2 recognised $41,357 of director-funded costs for the whole of 2025.

**Only count 2026 rows toward the reimbursement balance.** Filter
`date >= '2026-01-01'`. The ITC side is unaffected: an income tax deduction in
2025 and an input tax credit in the 2025-26 HST period are separate claims on
separate calendars, and both are correct.

### Tax treatment

Reimbursing a business expense the director already paid is **repayment, not
income**. No T4, no taxable benefit, no personal tax. It reduces the
corporation's cash and its liability, not its taxable income — the deduction was
already taken when the expense was recognised.

There is no deadline. The balance can sit and grow, or be drawn in one payment,
or in instalments. Drawing the full balance (about $16,525) at year end would reduce the projected
31 Dec bank balance by the same amount.

### Watch this

Every payment out to Umar must be labelled as **expense reimbursement**, never
as a dividend or a loan. The 2025 entries were originally captioned "Dividends to
Umar" in the workbook and had to be reclassified before filing. Use
"Umar/Personal CC Expense Reimbursement" as the description, matching the
corrected 2025 rows.
