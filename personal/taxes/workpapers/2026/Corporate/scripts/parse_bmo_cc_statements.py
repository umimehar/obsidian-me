#!/usr/bin/env python3
"""
Parse BMO Ascend World Elite Business Mastercard statements and classify each
line for deductibility and input tax credits.

    python3 parse_bmo_cc_statements.py "<statements_dir>" -y 2026 \
        -o ../parsed_data/cc_2026_categorised.csv

Two gotchas in this statement layout, both handled here:

  1. The transaction and posting date columns run together in extracted text —
     "Dec. 25Dec. 29", not "Dec. 25  Dec. 29". The regex allows zero spaces.
  2. The annual fee is reported under "Fees" in the summary block, NOT under
     "Purchases and other charges". Validation adds the two before comparing.

Every statement self-checks twice: parsed purchases must equal
purchases + fees, and the closing balance must roll from
previous − payments + purchases + fees. Exit code 1 if any statement fails.

Transfers in from the chequing account (TRSF FROM/DE ACCT) are dropped — they
are settlements, not spend. Merchant refunds are kept as negatives.

## Classification

`RULES` is ordered and first-match-wins, so the catch-all at the bottom sweeps
restaurants into Meals & entertainment. Adjust the patterns, not the order.

  - Meals & entertainment: 50% deductible, 50% ITC (ITA s.67.1)
  - Fines and penalties: not deductible at all (ITA s.67.6)
  - Credit card annual fee: deductible, but a financial service, so no HST and no ITC
  - Non-resident suppliers (USD-billed, US city in the descriptor): no HST
    charged, so no ITC — this is the single biggest source of over-claiming

HST in price is computed as amount × 13/113 (Ontario). The vehicle lease and
professional fees carry ITCs too but run through the chequing account, so they
are not in this file — see CREDIT_CARD_2026.md.
"""
import argparse
import csv
import os
import re
import sys
from decimal import ROUND_HALF_UP, Decimal

try:
    import pdfplumber
except ImportError:
    sys.exit('pdfplumber required:  pip install pdfplumber')

MONTHS = {m: i + 1 for i, m in enumerate(
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])}
M3 = r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
ROW  = re.compile(rf'^{M3}\.\s*(\d{{1,2}})\s*{M3}\.\s*(\d{{1,2}})\s+(.*)$')
AMT  = re.compile(r'([\d,]+\.\d{2})(\s+CR)?\s*$')
PREV = re.compile(r'Previous (?:total )?balance,.*?\$?([\d,]+\.\d{2})')      # layout changed in 2026
PAYC = re.compile(r'Payments and credits\s+-?([\d,]+\.\d{2})')
PURC = re.compile(r'Purchases and other charges\s*\+?([\d,]+\.\d{2})')
FEES = re.compile(r'^Fees\s*\+?([\d,]+\.\d{2})', re.MULTILINE)
TOTB = re.compile(r'(?:Total|New) balance\s+\$([\d,]+\.\d{2})')            # ditto
SETTLE = re.compile(r'TRSF FROM/DE ACCT|^FROM/DE ACCT|PAYMENT - THANK|MERCI', re.IGNORECASE)

# ITA s.67.3 / ETA s.235: the 2025 GLC 43 lease is deductible, and its HST creditable, only
# in the ratio 38,000 / (0.85 x 99,500 list price incl. factory options). Accountant confirms.
LEASE_CAP = round(38000 / (0.85 * 99500), 4)
# Placeholder: build_transaction_ledger.py sets the ITC share of every car cost (business use, cap)
LEASE_ITC = 1.0
RULES = [   # category, deductible fraction, ITC fraction, pattern
    ('Cash back rebate',         0.0, 0.00, r'Cash Back|Remises Rebate'),
    ('Fines & penalties',        0.0, 0.00, r'PARKING TICKET|CONV FEE -TORONTO RSD'),
    ('Bank fees (HST-exempt)',   1.0, 0.00, r'ANNUAL FEE'),
    ('Software & subscriptions', 1.0, 1.00, r'PADDLE|CLAUDE|ANTHROPIC|OPENAI|GOOGLE \*|Prime Member|Ad free|SQSP|VERCEL|STRIPE|Z\.AI|SQUARESPACE|YOUTUBE'),
    ('Vehicle & fuel',           1.0, 1.00, r'SHELL|ESSO|PETRO|CIRCLE K|PIONEER|VALET CAR WASH|ULTRAMAR|HUSKY'),
    ('Telecom',                  1.0, 1.00, r'FREEDOM MOBILE|ROGERS|BELL |TELUS'),
    ('Travel & parking',         1.0, 1.00, r'LYFT|UBER|PARKING|WATERPARK|HONK|ENTERPRISE|HOTEL|AIR CANADA|CITY OF|GENERAL HOSPITA|HALTON HEALTH|CARDS'),
    ('Office & supplies',        1.0, 1.00, r'APPLE STORE|AMZN|Amazon|RONA|TEMU|IKEA|WAL-MART|STAPLES|BEST BUY|WINNERS|FLEXISPOT'),
    ('Personal — owed by Umar', 0.0, 0.00, r'THP[ -]|TRILLIUM|CREDIT VALLEY'),
    ('Government fees',          1.0, 0.00, r'CORP CANADA|SERVICEONTARIO'),
    ('Vehicle — maintenance',    1.0, 1.00, r'MERCEDES-BENZ|MERCEDES BENZ'),
    ('Meals & entertainment',    0.5, 0.50, r'.'),
]
# lines a merchant pattern can't place: (date, amount) -> category, deductible, ITC fraction
OVERRIDES = {('2025-09-27', 4000.00): ('Vehicle — lease', LEASE_CAP, LEASE_ITC),  # lease deposit
             ('2025-09-30', 2750.01): ('Vehicle — lease', LEASE_CAP, LEASE_ITC)}  # due on delivery
NON_RESIDENT = re.compile(r'^USD \d|SAN FRANCIS|NEW YORK NY|GBP ', re.IGNORECASE)
HST_RATE = 13 / 113


def money(s):
    return float(s.replace(',', ''))



def cents(x):
    """Round to the cent, halves away from zero, as Excel's ROUND does."""
    return float(Decimal(str(round(x, 6))).quantize(Decimal('0.01'), ROUND_HALF_UP))


def classify(desc):
    for cat, ded, itc, pat in RULES:
        if re.search(pat, desc, re.IGNORECASE):
            return cat, ded, itc
    return 'Other', 1.0, 1.0


def parse(path, year):
    with pdfplumber.open(path) as pdf:
        text = '\n'.join(p.extract_text() or '' for p in pdf.pages)

    prev = money(PREV.search(text).group(1))
    pay  = money(PAYC.search(text).group(1))
    pur  = money(PURC.search(text).group(1))
    tot  = money(TOTB.search(text).group(1))
    fees = money(FEES.search(text).group(1)) if FEES.search(text) else 0.0

    lines = [l.strip() for l in text.split('\n')]
    txns, i = [], 0
    while i < len(lines):
        m = ROW.match(lines[i])
        if m:
            body = m.group(5)
            a = AMT.search(body)
            if a:
                desc = body[:a.start()].strip()
                j = i + 1        # merchant names wrap onto a short uppercase line
                while (j < len(lines) and lines[j] and not ROW.match(lines[j])
                       and not AMT.search(lines[j]) and len(lines[j]) < 40 and lines[j].isupper()):
                    desc += ' ' + lines[j].strip(); j += 1
                tm, td = MONTHS[m.group(1)], int(m.group(2))
                stem = re.sub(r'^\d{1,2}[-_ ]', '', os.path.basename(path))   # strip a "01-" prefix
                sm = MONTHS.get(stem[:3].title(), tm)
                yr = year - 1 if tm > sm else year      # Dec line on a January statement
                txns.append({'trans_date': f'{yr}-{tm:02d}-{td:02d}',
                             'desc': re.sub(r'\s+', ' ', desc),
                             'amount': money(a.group(1)),
                             'type': 'credit' if a.group(2) else 'purchase',
                             'statement': os.path.basename(path)})
                i = j; continue
        i += 1

    p = round(sum(t['amount'] for t in txns if t['type'] == 'purchase'), 2)
    c = round(sum(t['amount'] for t in txns if t['type'] == 'credit'), 2)
    checks = (abs(p - (pur + fees)) < 0.011,
              abs(c - pay) < 0.011,
              abs((prev - pay + pur + fees) - tot) < 0.011)
    return txns, {'prev': prev, 'pay': pay, 'pur': pur, 'fees': fees, 'tot': tot,
                  'parsed_p': p, 'parsed_c': c, 'checks': checks}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('directory')
    ap.add_argument('-y', '--year', type=int, required=True)
    ap.add_argument('-o', '--out', default='cc_categorised.csv')
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(args.directory) if f.lower().endswith('.pdf'))
    if not files:
        sys.exit(f'no PDFs in {args.directory}')

    allt, bad = [], []
    print(f'{"statement":24}{"n":>4}{"purch+fees":>12}{"parsed":>12}{"credits":>11}{"parsed":>11}  chk roll')
    for fn in files:
        txns, s = parse(os.path.join(args.directory, fn), args.year)
        allt += txns
        ok = all(s['checks'])
        if not ok:
            bad.append(fn)
        print(f'{fn[:22]:24}{len(txns):>4}{s["pur"]+s["fees"]:>12,.2f}{s["parsed_p"]:>12,.2f}'
              f'{s["pay"]:>11,.2f}{s["parsed_c"]:>11,.2f}  {"OK" if s["checks"][0] and s["checks"][1] else "BAD"}'
              f'  {"OK" if s["checks"][2] else "BAD"}')

    spend = [t for t in allt if not (t['type'] == 'credit' and SETTLE.search(t['desc']))]
    rows = []
    for t in spend:
        sign = -1 if t['type'] == 'credit' else 1
        amt = round(sign * t['amount'], 2)
        cat, ded, itc = OVERRIDES.get((t['trans_date'], amt)) or classify(t['desc'])
        foreign = bool(NON_RESIDENT.search(t['desc']))
        hst = 0.0 if (foreign or itc == 0) else cents(amt * HST_RATE)
        rows.append({'date': t['trans_date'], 'merchant': t['desc'], 'amount': amt,
                     'category': cat, 'deductible_pct': ded, 'hst_in_price': hst,
                     'itc_pct': itc, 'itc_claimable': cents(hst * itc),
                     'supplier': 'non-resident' if foreign else 'Canadian',
                     'statement': t['statement']})

    with open(args.out, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

    tot = sum(r['amount'] for r in rows)
    ded = sum(r['amount'] * r['deductible_pct'] for r in rows)
    itc = sum(r['itc_claimable'] for r in rows)
    print(f'\n{len(rows)} lines -> {args.out}')
    print(f'net spend {tot:,.2f} · deductible {ded:,.2f} · ITC {itc:,.2f}')
    settled = sum(t['amount'] for t in allt if t['type'] == 'credit' and SETTLE.search(t['desc']))
    print(f'settlements from chequing (excluded): {settled:,.2f}'
          f'  — should equal the "credit card payment" rows in the workbook')
    if bad:
        print('REVIEW NEEDED:', ', '.join(bad)); sys.exit(1)
    print('all statements self-checked clean')


if __name__ == '__main__':
    main()
