#!/usr/bin/env python3
"""
Build one normalised transaction ledger from every source.

    python3 build_transaction_ledger.py \
        --workbook "/tmp/Business Transactions.xlsx" \
        --cards ../parsed_data/cc_2026_categorised.csv \
                ../../2025/Corporate/parsed_data/cc_2025_categorised.csv \
        --personal ../parsed_data/personal_recurring.csv \
        --out ../parsed_data/transactions_master

Writes `<out>.csv` and `<out>.xlsx`. Both carry the same rows and one schema, so
a future year is an append, not a rewrite.

The workbook must be LibreOffice-recalculated first — openpyxl cannot evaluate
its formulas.

## Schema

| column | meaning |
|---|---|
| date | transaction date, ISO |
| source | `debit`, `card`, or `personal` (director-funded, reimbursable) |
| account | which account it moved through |
| direction | `in` or `out` |
| amount | always positive; direction carries the sign |
| gross / hst / net | revenue split, debit deposits only |
| category | classification (see CATEGORIES below) |
| deductible_pct | 1.0, 0.5 for meals, 0.0 for fines |
| hst_in_price | HST embedded in the price, 0 for non-residents and exempt supplies |
| itc_pct | fraction of that HST claimable |
| itc_claimable | hst_in_price × itc_pct |
| supplier | `Canadian` or `non-resident` |
| tax_year | calendar year, drives the T2 |
| gst_period | Aug 15 – Aug 14 window the row falls in, e.g. `2025-26` |
| ref | statement filename or workbook tab |

## Querying it

    import pandas as pd
    t = pd.read_csv('transactions_master.csv')
    t[t.tax_year==2026].groupby('category').amount.sum()          # spend by category
    t[t.gst_period=='2025-26'].itc_claimable.sum()                # ITCs for a filing
    (t[(t.tax_year==2026)&(t.direction=='out')]
       .eval('deductible = amount*deductible_pct').deductible.sum())
"""
import argparse
import csv
import datetime
import os
import re
import sys
from decimal import ROUND_HALF_UP, Decimal

import openpyxl

# ---- classification, shared by both sources -------------------------------
# ITA s.67.3 / ETA s.235: the 2025 GLC 43 lease is deductible, and its HST creditable, only
# in the ratio 38,000 / (0.85 x 99,500 list price incl. factory options). Accountant confirms.
LEASE_CAP = round(38000 / (0.85 * 99500), 4)
# Mercedes business use is 80% (Umar). The lease ITC is that share of the s.235 cap.
VEHICLE_USE = 0.80
LEASE_ITC = round(LEASE_CAP * VEHICLE_USE, 4)
# Car costs from the 2025-26 period opening to the lease were Umar's own car, paid by mileage
OWN_CAR_FROM, LEASE_START = '2025-08-15', '2025-09-27'
VEHICLE_ITC_CATEGORIES = ('Vehicle — lease', 'Vehicle & fuel', 'Vehicle — maintenance')
CATEGORIES = [
    ('Revenue',                  1.0, 0.00, r'MIR pay|Lazer|IMMIGRATION|Tax Return'),
    ('Investments (not expense)',0.0, 0.00, r'Wealthsimple|WSINVESTMENTS'),
    ('Tax & GST remittances',    0.0, 0.00, r'pre payment GST|Corp tax|CANADATXD|Payroll Taxes|CANACTBUS'),
    ('Card settlement',          0.0, 0.00, r'credit card payment|TRSF FROM/DE ACCT'),
    ('Director payments',        0.0, 0.00, r'Umar|Dividends|Reimbursement'),
    ('Salary',                   1.0, 0.00, r'salary to|Maham'),
    ('Subcontractor',            1.0, 0.00, r'WISE Freelancer|zeeshan|Contract payout'),
    ('Bank & transfer fees',     1.0, 0.00, r'WISE Fee|WISE FEE|platform fee|Bank charge|ANNUAL FEE'),
    ('Fines & penalties',        0.0, 0.00, r'PARKING TICKET|CONV FEE -TORONTO RSD'),
    ('Professional fees',        1.0, 1.00, r'accountant|Ejaz|dues cleared|CMCPA|Tax filling'),
    ('Vehicle — lease',          LEASE_CAP, LEASE_ITC, r'Car lease|MBFINANCIAL'),
    ('Vehicle — insurance',      1.0, 0.00, r'Car insurance|CERTASDIRECT'),
    ('Vehicle & fuel',           1.0, 1.00, r'SHELL|ESSO|PETRO|CIRCLE K|PIONEER|VALET CAR WASH|ULTRAMAR|HUSKY'),
    ('Software & subscriptions', 1.0, 1.00, r'PADDLE|CLAUDE|ANTHROPIC|OPENAI|GOOGLE \*|Prime Member|Ad free|SQSP|VERCEL|STRIPE|Z\.AI|SQUARESPACE|YOUTUBE|vercel|domain'),
    ('Telecom',                  1.0, 1.00, r'FREEDOM MOBILE|ROGERS|BELL |TELUS'),
    ('Travel & parking',         1.0, 1.00, r'LYFT|UBER|PARKING|WATERPARK|HONK|ENTERPRISE|HOTEL|AIR CANADA|CITY OF|GENERAL HOSPITA|HALTON HEALTH|CARDS|Flight'),
    ('Office & supplies',        1.0, 1.00, r'APPLE STORE|AMZN|Amazon|RONA|TEMU|IKEA|WAL-MART|STAPLES|BEST BUY|WINNERS|FLEXISPOT|business name registra|logo design'),
    ('Personal — owed by Umar', 0.0, 0.00, r'THP[ -]|TRILLIUM|CREDIT VALLEY'),
    ('Government fees',          1.0, 0.00, r'CORP CANADA|SERVICEONTARIO'),
    ('Vehicle — maintenance',    1.0, 1.00, r'MERCEDES-BENZ|MERCEDES BENZ'),
    ('Meals & entertainment',    0.5, 0.50, r'.'),
]
NON_RESIDENT = re.compile(r'^USD \d|SAN FRANCIS|NEW YORK NY|GBP ', re.IGNORECASE)
# workbook rows name US vendors without a card descriptor; they charge no Canadian HST
US_VENDOR = re.compile(r'vercel|anthropic|openai|z\.ai|paddle|stripe', re.IGNORECASE)
HST = 13 / 113
MASTER_TAB = 'T 23-26'



def cents(x):
    """Round to the cent, halves away from zero, as Excel's ROUND does."""
    return float(Decimal(str(round(x, 6))).quantize(Decimal('0.01'), ROUND_HALF_UP))


def classify(desc, source):
    for cat, ded, itc, pat in CATEGORIES:
        if re.search(pat, desc, re.IGNORECASE):
            # the meals catch-all only applies to card lines; unmatched debit rows are "Other"
            if cat == 'Meals & entertainment' and source == 'debit':
                return 'Other', 1.0, 1.0
            return cat, ded, itc
    return 'Other', 1.0, 1.0


def apply_vehicle_use(rows):
    """Set the ITC share of car costs from every source by date: none before the lease."""
    for r in rows:
        if r['category'] not in VEHICLE_ITC_CATEGORIES or r['itc_pct'] == '':
            continue
        if r['date'] < OWN_CAR_FROM:
            continue
        if r['date'] < LEASE_START:
            itc = 0.0
        else:
            itc = LEASE_ITC if r['category'] == 'Vehicle — lease' else VEHICLE_USE
        r['itc_pct'] = itc
        r['itc_claimable'] = cents(float(r['hst_in_price']) * itc)


def gst_period(d):
    """Aug 15 – Aug 14 window, labelled by its opening year."""
    y = d.year if (d.month, d.day) >= (8, 15) else d.year - 1
    return f'{y}-{str(y + 1)[2:]}'


def num(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return 0.0


def from_workbook(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    if MASTER_TAB not in wb.sheetnames:
        sys.exit(f'{MASTER_TAB} not found — is this the right workbook?')
    rows = []
    for r in wb[MASTER_TAB].iter_rows(min_row=1, max_row=1027, values_only=True):
        d = r[0]
        if not isinstance(d, datetime.datetime):
            continue
        desc = str(r[1]).strip()
        gross, hst_col, net, out = num(r[3]), num(r[4]), num(r[5]), num(r[6])
        direction = 'out' if out else 'in'
        amount = out if out else gross
        if not amount:
            continue
        cat, ded, itc = classify(desc, 'debit')
        supplier = 'non-resident' if US_VENDOR.search(desc) else 'Canadian'
        hst_in = (cents(amount * HST)
                  if (direction == 'out' and itc and supplier == 'Canadian') else 0.0)
        rows.append({'date': d.date().isoformat(), 'source': 'debit',
                     'account': 'BMO chequing ****1004', 'direction': direction,
                     'amount': amount, 'gross': gross if direction == 'in' else '',
                     'hst': hst_col if direction == 'in' else '',
                     'net': net if direction == 'in' else '',
                     'description': desc, 'category': cat,
                     'deductible_pct': ded if direction == 'out' else '',
                     'hst_in_price': hst_in, 'itc_pct': itc if direction == 'out' else '',
                     'itc_claimable': cents(hst_in * itc), 'supplier': supplier,
                     'tax_year': d.year, 'gst_period': gst_period(d.date()),
                     'ref': MASTER_TAB})
    return rows


MONTHS = {m: i + 1 for i, m in enumerate(
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])}
STMT_MONTH = {f'{i:02d}-{m}': i for i, m in enumerate(
    ['January','February','March','April','May','June','July',
     'August','September','October','November','December'], 1)}


def from_card_csv(path):
    """Accepts either the categorised 2026 export or the raw 2025 statement dump."""
    rows = []
    with open(path) as f:
        data = list(csv.DictReader(f))
    if not data:
        return rows
    categorised = 'category' in data[0]
    for r in data:
        if categorised:
            d = r['date']; desc = r['merchant']; amt = float(r['amount'])
            cat, ded = r['category'], float(r['deductible_pct'])
            hst_in, itc = float(r['hst_in_price']), float(r['itc_pct'])
            supplier, ref = r['supplier'], r['statement']
        else:                                   # 2025 dump: "Dec. 27" + statement_month
            m = re.match(r'([A-Za-z]{3})\.?\s*(\d{1,2})', r['trans_date'].strip())
            sm = STMT_MONTH.get(r['statement_month'])
            if not m or not sm:
                continue
            tm, td = MONTHS[m.group(1)[:3].title()], int(m.group(2))
            yr = 2024 if tm > sm else 2025
            d = f'{yr}-{tm:02d}-{td:02d}'; desc = r['description']
            try:
                amt = float(str(r['amount']).replace(',', '').replace('$', ''))
            except ValueError:
                continue
            if re.search(r'TRSF|PAYMENT -|MERCI|THANK YOU', desc, re.IGNORECASE):
                continue
            cat, ded, itc = classify(desc, 'card')
            supplier = 'non-resident' if NON_RESIDENT.search(desc) else 'Canadian'
            hst_in = 0.0 if (supplier == 'non-resident' or not itc) else cents(amt * HST)
            ref = r['statement_month']
        dt = datetime.date.fromisoformat(d)
        rows.append({'date': d, 'source': 'card', 'account': 'BMO Mastercard 5840',
                     'direction': 'out' if amt >= 0 else 'refund', 'amount': abs(amt),
                     'gross': '', 'hst': '', 'net': '', 'description': desc,
                     'category': cat, 'deductible_pct': ded, 'hst_in_price': hst_in,
                     'itc_pct': itc, 'itc_claimable': cents(hst_in * itc),
                     'supplier': supplier, 'tax_year': dt.year,
                     'gst_period': gst_period(dt), 'ref': ref})
    return rows


FIELDS = ['date', 'source', 'account', 'direction', 'amount', 'gross', 'hst', 'net',
          'description', 'category', 'deductible_pct', 'hst_in_price', 'itc_pct',
          'itc_claimable', 'supplier', 'tax_year', 'gst_period', 'ref']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workbook', required=True, help='LibreOffice-recalculated copy')
    ap.add_argument('--cards', nargs='*', default=[])
    ap.add_argument('--personal', nargs='*', default=[],
                    help='director-funded recurring CSVs from expand_recurring_expenses.py')
    ap.add_argument('--out', default='transactions_master')
    args = ap.parse_args()

    rows = from_workbook(args.workbook)
    print(f'debit  {len(rows):>5} rows')
    for c in args.cards:
        if not os.path.exists(c):
            print(f'  skip (missing): {c}'); continue
        got = from_card_csv(c)
        print(f'card   {len(got):>5} rows  <- {os.path.basename(c)}')
        rows += got
    for pf in args.personal:
        if not os.path.exists(pf):
            print(f'  skip (missing): {pf}'); continue
        with open(pf) as f:
            got = [{k: r.get(k, '') for k in FIELDS} for r in csv.DictReader(f)]
        for r in got:                       # normalise types coming back off disk
            r['amount'] = float(r['amount']); r['tax_year'] = int(r['tax_year'])
            r['deductible_pct'] = float(r['deductible_pct'])
            r['hst_in_price'] = float(r['hst_in_price']); r['itc_pct'] = float(r['itc_pct'])
            r['itc_claimable'] = float(r['itc_claimable'])
        print(f'person {len(got):>5} rows  <- {os.path.basename(pf)}')
        rows += got
    apply_vehicle_use(rows)
    rows.sort(key=lambda r: (r['date'], r['source']))

    with open(args.out + '.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(rows)

    wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'transactions'
    ws.append(FIELDS)
    for r in rows:
        ws.append([r[k] for k in FIELDS])
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = f'A1:{openpyxl.utils.get_column_letter(len(FIELDS))}{len(rows)+1}'
    for i, k in enumerate(FIELDS, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = \
            40 if k == 'description' else max(11, len(k) + 2)
    for row in ws.iter_rows(min_row=2, min_col=5, max_col=8):
        for c in row:
            c.number_format = '#,##0.00'
    for row in ws.iter_rows(min_row=2, min_col=12, max_col=14):
        for c in row:
            c.number_format = '#,##0.00'
    wb.save(args.out + '.xlsx')

    print(f'\n{len(rows)} rows -> {args.out}.csv and {args.out}.xlsx')
    yrs = sorted({r['tax_year'] for r in rows})
    print('tax years:', ', '.join(map(str, yrs)))
    print('sources:', ', '.join(f'{s} {sum(1 for r in rows if r["source"] == s)}'
                                for s in sorted({r['source'] for r in rows})))
    print('gst periods:', ', '.join(sorted({r['gst_period'] for r in rows})))


if __name__ == '__main__':
    main()
