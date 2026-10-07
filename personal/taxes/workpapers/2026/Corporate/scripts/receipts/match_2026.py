"""Match 2026 receipts (categorized by filename, uncategorized by OCR) to card lines."""
import datetime as dt
import json
import re
from pathlib import Path

import pandas as pd
import pypdf

S = Path(__file__).resolve().parents[2] / 'parsed_data' / 'receipt_work'
RC = Path('/Users/umarfarooqaslam/Documents/Taxes/2026/Corporate/Credit Card/receipts')
LEDGER = Path(__file__).resolve().parents[2] / 'parsed_data' / 'transactions_master.csv'
MON = {m: i for i, m in enumerate(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}
AMT = re.compile(r'\$?\s?(\d{1,4}(?:,\d{3})?[.:]\d{2})(?!\d)')


def dates_in(text):
    out = set()
    for y, m, d in re.findall(r'(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})', text):
        out.add((int(y), int(m), int(d)))
    for a, b, y in re.findall(r'(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](20\d\d|\d\d)(?!\d)', text):
        y = int(y) + (2000 if len(y) == 2 else 0)
        for m, d in ((int(a), int(b)), (int(b), int(a))):
            out.add((y, m, d))
    for mo, d, y in re.findall(r'([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2}),?\s*(20\d\d)', text):
        if mo.lower() in MON:
            out.add((int(y), MON[mo.lower()], int(d)))
    for d, mo, y in re.findall(r'(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*\.?[\s-]+(20\d\d|\d\d)', text):
        if mo.lower() in MON:
            y = int(y) + (2000 if len(y) == 2 else 0)
            out.add((y, MON[mo.lower()], int(d)))
    res = set()
    for y, m, d in out:
        try:
            res.add(dt.date(y, m, d))
        except ValueError:
            pass
    return {d for d in res if dt.date(2025, 8, 1) <= d <= dt.date(2026, 9, 30)}


ocr_extra = json.loads((S / 'ocr_extra.json').read_text()) if (S / 'ocr_extra.json').exists() else {}
t = pd.read_csv(LEDGER, parse_dates=['date'])
card = t[(t.source == 'card') & (t.date >= '2025-08-15')].copy()
card['d'] = card.date.dt.date
usd = card.description.str.extract(r'USD ([\d,]+\.\d{2})@')[0]
card['usd'] = usd.str.replace(',', '').astype(float)

receipts = []
for sub in sorted(RC.iterdir()):
    if not sub.is_dir() or sub.name == 'uncategorized' or sub.name.startswith('.'):
        continue
    for p in sorted(sub.iterdir()):
        if p.name.startswith('.'):
            continue
        amts = {float(a.replace(',', '').replace(':', '.')) for a in AMT.findall(p.stem)}
        text = p.stem
        if p.suffix.lower() == '.pdf':
            text = '\n'.join(pg.extract_text() or '' for pg in pypdf.PdfReader(p).pages)
            amts |= {float(a.replace(',', '').replace(':', '.')) for a in AMT.findall(text)}
        elif p.suffix.lower() in {'.png', '.jpg', '.jpeg'} and not amts:
            text = ocr_extra.get(f'{sub.name}/{p.name}', '')
            amts |= {float(a.replace(',', '').replace(':', '.')) for a in AMT.findall(text)}
        m = re.match(r'(\d{1,2})-([A-Za-z]{3})', p.name)
        ds = set()
        if m:
            mo = MON[m.group(2).lower()]
            ds = {dt.date(2025 if mo == 12 else 2026, mo, int(m.group(1)))}
        else:
            ds = dates_in(text)
        paid = {float(a.replace(',', '')) for a in re.findall(
            r'(?i)(?:amount paid|total paid|paid)\D{0,6}([\d,]+\.\d{2})', text)}
        receipts.append({'file': f'{sub.name}/{p.name}', 'amts': amts, 'dates': ds,
                         'text': text, 'paid': paid})
ocr = json.loads((S / 'ocr_uncat.json').read_text()) if (RC / 'uncategorized').exists() else {}
for name, text in ocr.items():
    amts = {float(a.replace(',', '').replace(':', '.')) for a in AMT.findall(text)}
    receipts.append({'file': f'uncategorized/{name}', 'amts': amts, 'dates': dates_in(text),
                     'text': text, 'card5840': '5840' in text})

STOP = {'MISSISSAUGA', 'TORONTO', 'ONTARIO', 'CANADA', 'MISSISSA', 'SCARBOROUGH', 'OAKVILLE',
        'COFFEE', 'GRILL', 'FOOD', 'STORE', 'EXPRESS', 'SQUARE'}


def same_merchant(desc, text):
    words = {w for w in re.findall(r'[A-Z]{4,}', re.sub(r'USD \S+', '', desc.upper()))} - STOP
    flat = re.sub(r'[^A-Z]', '', text.upper())
    return any(w in flat for w in words)


pairs = []
for ri, r in enumerate(receipts):
    for ci, c in card.iterrows():
        if round(c.amount, 2) not in r['amts'] and not (c.usd == c.usd and c.usd in r['amts']):
            continue
        gap = min((abs((c.d - d).days) for d in r['dates']), default=None)
        if gap is not None and gap > 4:
            continue
        name_hit = same_merchant(c.description, r['text'])
        if gap is None and not name_hit:
            continue
        paid_hit = not r.get('paid') or round(c.amount, 2) in r['paid']
        score = (0 if paid_hit else 1, 0 if gap is not None else 1, 0 if name_hit else 1,
                 gap or 0, -c.amount)
        pairs.append((score, ri, ci))
pairs.sort()
used_r, used_c, match = set(), set(), {}
for score, ri, ci in pairs:
    if ri in used_r or ci in used_c:
        continue
    used_r.add(ri)
    used_c.add(ci)
    match[ri] = ci

extra = {}
for score, ri, ci in pairs:
    if ri not in used_r and score[0] == 0 and score[1] == 0 and score[3] <= 1:
        used_r.add(ri)
        extra[ri] = ci
rows = []
for ri, r in enumerate(receipts):
    ci = match.get(ri, extra.get(ri))
    rows.append({'file': r['file'], 'ledger_idx': ci,
                 'date': card.loc[ci, 'd'] if ci is not None else None,
                 'merchant': card.loc[ci, 'description'] if ci is not None else None,
                 'amount': card.loc[ci, 'amount'] if ci is not None else None,
                 'second_copy': ri in extra, 'ocr_dates': sorted(r['dates'])[:3], 'ocr_amts': sorted(r['amts'])[-4:]})
df = pd.DataFrame(rows)
df.to_pickle(S / 'receipt_matches_2026.pkl')
un = df[df.ledger_idx.isna()]
print('receipts', len(df), 'matched', df.ledger_idx.notna().sum(), 'unmatched', len(un))
print(un[['file', 'ocr_dates', 'ocr_amts']].to_string())
