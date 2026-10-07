#!/usr/bin/env python3
"""Write the receipt indexes (keyed by date + description + amount) from the match outputs."""
import json
from pathlib import Path

import pandas as pd

CORP = Path(__file__).resolve().parents[2]
WORK = CORP / 'parsed_data' / 'receipt_work'
WORKPAPERS = CORP.parents[1]
t = pd.read_csv(CORP / 'parsed_data' / 'transactions_master.csv')


def status_of(f, row, line):
    if row is None:
        if f.startswith('09-Sep'):
            return 'pending Sep 28 statement'
        if 'VISA1680' in f:
            return 'personal card (Visa 1680) — director-funded, in personal_actuals.csv'
        if 'vercel receipt' in f:
            return 'bank debit card (Vercel, Feb 4 chequing line)'
        if 'ValetCarWash-AutoBilling' in f:
            return 'email list of Valet AutoBilling receipts (PDFs to follow)'
        return 'supporting copy'
    if line.category == 'Personal — owed by Umar':
        return 'personal charge on corporate card'
    return 'second copy' if row.second_copy else 'matched'


m = pd.read_pickle(WORK / 'receipt_matches_2026.pkl')  # written by match_2026.py
rows = []
for r in m.itertuples():
    line = t.loc[int(r.ledger_idx)] if pd.notna(r.ledger_idx) else None
    rows.append({'receipt': r.file, 'status': status_of(r.file, r if line is not None else None,
                                                        line),
                 'date': line.date if line is not None else '',
                 'description': line.description if line is not None else '',
                 'amount': line.amount if line is not None else '',
                 'category': line.category if line is not None else ''})
pd.DataFrame(rows).to_csv(CORP / 'parsed_data' / 'receipts_2026_index.csv', index=False)

rm = json.loads((WORK / 'receipt_map.json').read_text())  # written by match_receipts.py
r25 = [{'receipt': v.split('Invoices by Month/')[-1], 'date': t.loc[int(k), 'date'],
        'description': t.loc[int(k), 'description'], 'amount': t.loc[int(k), 'amount']}
       for k, v in rm.items()]
out25 = WORKPAPERS / '2025/Corporate/parsed_data/receipts_2025_hst_period_index.csv'
pd.DataFrame(r25).to_csv(out25, index=False)
print(f'2026 index {len(rows)} rows, 2025 index {len(r25)} rows')
