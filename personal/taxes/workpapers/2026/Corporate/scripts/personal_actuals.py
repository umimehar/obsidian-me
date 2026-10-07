#!/usr/bin/env python3
"""Write director-funded expenses with known actual amounts, in the ledger schema.

Telecom comes from the Bell payment history and Rogers bill history (account
screenshots, Sep 23, 2026); it replaces the modelled $115/month up to Sep 13, 2026.

    python3 personal_actuals.py -o ../parsed_data/personal_actuals.csv
"""
import argparse
import csv
import datetime
from decimal import ROUND_HALF_UP, Decimal

BELL = [('2025-09-03', 57.64), ('2025-10-03', 57.64), ('2025-10-31', 57.64),
        ('2025-12-03', 57.64), ('2026-01-02', 57.64), ('2026-02-02', 60.47),
        ('2026-03-05', 58.25), ('2026-04-02', 56.50), ('2026-05-01', 118.65),
        ('2026-06-13', 113.00), ('2026-07-14', 113.00), ('2026-08-13', 117.24),
        ('2026-09-13', 113.00)]
ROGERS = [('2025-08-22', 67.79), ('2025-09-22', 67.79), ('2025-10-22', 67.79),
          ('2025-11-22', 67.79), ('2025-12-22', 67.79), ('2026-01-22', 67.79),
          ('2026-02-22', 67.79), ('2026-03-22', 67.79), ('2026-04-22', 163.58),
          ('2026-05-22', -148.78)]  # credit; the Jun 22 bill repeats the same balance
MERCEDES = 'Mercedes-Benz Mississauga service, invoice 1128781 (paid on personal Visa 1680)'
OTHER = [('2026-04-02', 353.94, MERCEDES, 'Vehicle — maintenance')]
FIELDS = ['date', 'source', 'account', 'direction', 'amount', 'gross', 'hst', 'net',
          'description', 'category', 'deductible_pct', 'hst_in_price', 'itc_pct',
          'itc_claimable', 'supplier', 'tax_year', 'gst_period', 'ref']


def cents(x):
    return float(Decimal(str(round(x, 6))).quantize(Decimal('0.01'), ROUND_HALF_UP))


def gst_period(d):
    y = d.year if (d.month, d.day) >= (8, 15) else d.year - 1
    return f'{y}-{str(y + 1)[2:]}'


def row(ds, amt, desc, cat, ref):
    d = datetime.date.fromisoformat(ds)
    hst = cents(abs(amt) * 13 / 113)
    sign = -1 if amt < 0 else 1
    return {'date': ds, 'source': 'personal', 'account': 'Personal card (director-funded)',
            'direction': 'refund' if amt < 0 else 'out', 'amount': abs(amt), 'gross': '',
            'hst': '', 'net': '', 'description': desc, 'category': cat,
            'deductible_pct': 1.0, 'hst_in_price': sign * hst, 'itc_pct': 1.0,
            'itc_claimable': sign * hst, 'supplier': 'Canadian', 'tax_year': d.year,
            'gst_period': gst_period(d), 'ref': ref}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-o', '--out', required=True)
    args = ap.parse_args()
    rows = [row(d, a, 'Bell (mobile + internet)', 'Telecom', 'Bell payment history')
            for d, a in BELL]
    rows += [row(d, a, 'Rogers home internet', 'Telecom', 'Rogers bill history')
             for d, a in ROGERS]
    rows += [row(d, a, desc, cat, 'receipt 04-April') for d, a, desc, cat in OTHER]
    rows.sort(key=lambda r: r['date'])
    with open(args.out, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f'{len(rows)} rows -> {args.out}')


if __name__ == '__main__':
    main()
