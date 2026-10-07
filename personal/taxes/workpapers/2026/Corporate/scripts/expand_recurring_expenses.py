#!/usr/bin/env python3
"""
Expand the recurring director-funded expenses into dated transactions.

    python3 expand_recurring_expenses.py \
        --config ../parsed_data/recurring_expenses.json \
        --today 2026-08-03 \
        --out ../parsed_data/personal_recurring.csv

These are costs Umar pays on his personal card and the corporation reimburses.
They are deliberately a separate source from `debit` and `card` so the accountant
can see them on their own — filter `source == "personal"`.

## Why hst_status matters

Only `taxable` items carry an input tax credit:

  - **exempt** — insurance and residential rent are exempt supplies under the
    Excise Tax Act. No HST is charged, so there is nothing to claim. Recording a
    notional 13/113 on rent is the single most common way to over-claim ITCs.
  - **taxable** — HST is in the price. ITC = amount × claim_pct × 13/113.

## claim_pct

The full amount paid is recorded and `claim_pct` carries the business share, so
the source document and the claim are both visible. This matches how meals are
handled at 50% elsewhere in the ledger. The reimbursable figure is
`amount × claim_pct`.

Rows dated on or before `--today` are marked `actual`; later ones `projected`.
"""
import argparse, calendar, csv, datetime, json, sys

HST = 13 / 113


def month_iter(start, end):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def gst_period(d):
    y = d.year if (d.month, d.day) >= (8, 15) else d.year - 1
    return f'{y}-{str(y + 1)[2:]}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True)
    ap.add_argument('--today', required=True, help='ISO date; rows after it are marked projected')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    cfg = json.load(open(args.config))
    today = datetime.date.fromisoformat(args.today)
    lo = datetime.date.fromisoformat(cfg['generate_from'])
    hi = datetime.date.fromisoformat(cfg['generate_to'])

    rows = []
    for item in cfg['items']:
        starts = datetime.date.fromisoformat(item['starts']) if item.get('starts') else lo
        ends = datetime.date.fromisoformat(item['ends']) if item.get('ends') else hi
        for y, m in month_iter(lo, hi):
            day = min(item['day_of_month'], calendar.monthrange(y, m)[1])
            d = datetime.date(y, m, day)
            if not (lo <= d <= hi and starts <= d <= ends):
                continue
            amt = round(item['amount'], 2)
            claim = round(item['claim_pct'], 4)
            taxable = item['hst_status'] == 'taxable'
            hst_in = round(amt * claim * HST, 2) if taxable else 0.0
            rows.append({
                'date': d.isoformat(), 'source': 'personal',
                'account': 'Personal card (director-funded)', 'direction': 'out',
                'amount': amt, 'gross': '', 'hst': '', 'net': '',
                'description': item['name'], 'category': item['category'],
                'deductible_pct': claim, 'hst_in_price': hst_in,
                'itc_pct': 1.0 if taxable else 0.0, 'itc_claimable': hst_in,
                'supplier': 'Canadian', 'tax_year': d.year, 'gst_period': gst_period(d),
                'ref': f'recurring · {"actual" if d <= today else "projected"}',
            })

    rows.sort(key=lambda r: (r['date'], r['description']))
    with open(args.out, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

    print(f'{len(rows)} rows -> {args.out}\n')
    print(f'{"item":26}{"n":>4}{"paid":>12}{"claimed":>12}{"ITC":>10}')
    for item in cfg['items']:
        sel = [r for r in rows if r['description'] == item['name']]
        paid = sum(r['amount'] for r in sel)
        claimed = sum(r['amount'] * r['deductible_pct'] for r in sel)
        itc = sum(r['itc_claimable'] for r in sel)
        print(f'{item["name"][:24]:26}{len(sel):>4}{paid:>12,.2f}{claimed:>12,.2f}{itc:>10,.2f}')
    print(f'{"TOTAL":26}{len(rows):>4}{sum(r["amount"] for r in rows):>12,.2f}'
          f'{sum(r["amount"]*r["deductible_pct"] for r in rows):>12,.2f}'
          f'{sum(r["itc_claimable"] for r in rows):>10,.2f}')
    for scope, pred in [('tax year 2026', lambda r: r['tax_year'] == 2026),
                        ('GST period 2025-26', lambda r: r['gst_period'] == '2025-26')]:
        sel = [r for r in rows if pred(r)]
        print(f'\n{scope}: claimed {sum(r["amount"]*r["deductible_pct"] for r in sel):,.2f}'
              f' · ITC {sum(r["itc_claimable"] for r in sel):,.2f}')


if __name__ == '__main__':
    main()
