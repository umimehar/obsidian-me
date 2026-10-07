"""Match card lines in the HST period to receipt files by the amount in the filename."""
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path('/Users/umarfarooqaslam/Documents/Taxes/2025/Corporate/Credit Card/Invoices by Month')
FOLDERS = ['07-July', '08-Aug', '09-Sep', '10-Oct', '11-Nov', '12-Dec', '01-jan']
AMT = re.compile(r'(\d+)\.{1,2}(\d{2})(?!\d)')

files = []
for f in FOLDERS:
    for p in sorted((ROOT / f).iterdir()):
        if p.name.startswith('.'):
            continue
        amts = {float(f'{a}.{b}') for a, b in AMT.findall(p.stem)}
        files.append({'path': str(p), 'amts': amts, 'used': False})

t = pd.read_csv(Path(__file__).resolve().parents[2] / 'parsed_data' / 'transactions_master.csv')
c = t[(t.gst_period == '2025-26') & (t.source == 'card')]
MANUAL = {  # (date, amount) -> receipt whose filename lacks the exact cents
    ('2025-08-31', 129.99): '09-Sep/youtube premium order.png',
    ('2025-09-08', 35.00): '09-Sep/montreal parking-grand-quai-35-9-sep.png',
    ('2025-09-09', 50.00): '09-Sep/petro gas-50-9-sep.png',
    ('2025-09-10', 405.62): '09-Sep/Enterprise Rental Agreement 9LFR0Y.pdf',
    ('2025-09-21', 49.19): '09-Sep/nawab bbq 49.20 - 21 sep.png',
    ('2025-09-22', 206.62): '09-Sep/table plus receipt.pdf',
    ('2025-09-26', 609.02): '10-Oct/IKEA e-receipt .pdf',
    ('2025-09-27', 4000.00): '10-Oct/mercedes-bens-4000-downpayment-lease-27-sep.png',
    ('2025-10-01', 39.99): '10-Oct/google one storage subscription per year.png',
    ('2025-10-04', 75.00): '10-Oct/esso-gas-75-4-oct.png',
    ('2025-10-15', 51.25): '10-Oct/halton health parking-51.21-15 oct.png',
}
out = {}
for i, r in c.iterrows():
    key = (r.date, round(r.amount, 2))
    if key in MANUAL:
        path = str((ROOT / MANUAL[key]).resolve())
        assert Path(path).exists(), path
        out[i] = path
        continue
    hits = [f for f in files if not f['used'] and round(r.amount, 2) in f['amts']]
    day = str(int(r.date[8:10]))
    hits.sort(key=lambda f: 0 if re.search(rf'(?<!\d){day}(?!\d)', Path(f['path']).stem) else 1)
    if hits:
        hits[0]['used'] = True
        out[i] = hits[0]['path']
WORK = Path(__file__).resolve().parents[2] / 'parsed_data' / 'receipt_work'
with open(WORK / 'receipt_map.json', 'w') as fh:
    json.dump(out, fh, indent=0)
c25 = c[c.date < '2026-01-01']
m = c25.index.isin([int(k) for k in out])
print('2025 card lines in period', len(c25), 'matched', m.sum())
print('ITC-bearing 2025 lines >= $30 unmatched:')
u = c25[~m & (c25.itc_claimable > 0) & (c25.amount >= 30)]
print(u[['date', 'description', 'amount', 'itc_claimable']].to_string())
print('unused receipt files:', [Path(f['path']).name for f in files if not f['used']
      and any(x in f['path'] for x in ['09-Sep', '10-Oct', '11-Nov', '12-Dec'])])
