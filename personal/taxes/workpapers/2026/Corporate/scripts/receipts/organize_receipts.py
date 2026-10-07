"""File, rename and losslessly compress the 2026 card receipts; write an index CSV.

Usage: organize_receipts.py [--apply]   (dry run without --apply)
"""
import datetime as dt
import io
import json
import re
import subprocess
import sys
from pathlib import Path

import mozjpeg_lossless_optimization as mlo
import numpy as np
import oxipng
import pandas as pd
import piexif
import pikepdf
from PIL import Image

S = Path(__file__).resolve().parents[2] / 'parsed_data' / 'receipt_work'
RC = Path('/Users/umarfarooqaslam/Documents/Taxes/2026/Corporate/Credit Card/receipts')
WS = Path(__file__).resolve().parents[2] / 'parsed_data'
APPLY = '--apply' in sys.argv
FOLDER = {1: '01-Jan', 2: '02-Feb', 3: '03-Mar', 4: '04-April', 5: '05-May', 6: '06-June',
          7: '07-July', 8: '08-Aug', 9: '09-Sep', 10: '10-Oct'}
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

MANUAL_LINE = {'8D2562D2': (623, ''), 'AF65CDA4': (651, '-ticket'), '4AA0E3BE': (695, '-copy2')}
PERSONAL = {  # Mercedes service Apr 2, 2026, paid on Umar's personal Visa 1680
    '4179BB92': '-invoice-p1', '5F5BE9EA': '-invoice-p2', 'D51C7FF4': '-cardslip'}
PENDING = {  # after the Aug 28 statement; will appear on the Sep 28 statement
    '17CA2F09': ('2026-08-31', 'FaroojAboAlabed', 51.95),
    'AA4FBC24': ('2026-08-29', 'Popeyes', 14.68),
    '9F42CD05': ('2026-08-30', 'PetroCanada', 100.00),
    '6AC3BBEB': ('2026-09-02', 'CrustNcrave', 28.80),
    'C266B9F3': ('2026-09-04', 'Shell', 115.13),
    '26B1DDE3': ('2026-09-05', 'Walmart', 158.02),
    '9993331A': ('2026-09-06', 'Walmart-REFUND', 124.28),
    'ED01E788': ('2026-09-06', 'Walmart', 112.93),
    'D8CB3EF4': ('2026-09-07', 'ChaiPani', 30.46),
    '5AF3E039': ('2026-09-11', 'EssoCircleK', 104.03),
    'DC2F6437': ('2026-09-11', 'CrustNcrave', 42.90),
    '4AEA520D': ('2026-09-19', 'Galitos', 52.25),
    '849D730E': ('2026-09-22', 'EssoCircleK', 97.74),
}
NOISE = r'\b(MISSISSAUGA|MISSISSA|TORONTO|TOROON|ON|BC|CA|QC|ETOBICOKE|OAKVILLE|MILTON|' \
        r'SCARBOROUGH|BRAMPTON|VANCOUVER|SAN|FRANCISCO|FRANCISCOCA|INC|LTD)\b'


def merchant(desc):
    if '2746024 ONTARIO' in desc:
        return 'Chaiiwala'
    d = re.sub(r'^USD [\d.,]+@[\d.]+ ', '', desc)
    d = re.sub(r'^(TST-|SQ \*|DD/|DOORDASH)', '', d, flags=re.IGNORECASE)
    d = re.sub(r'#?\d+|[*\'.,/&-]', ' ', d)
    d = re.sub(NOISE, ' ', d, flags=re.IGNORECASE)
    words = [w.capitalize() for w in d.split() if len(w) > 1][:3]
    return ''.join(words) or 'Unknown'


def card_of(text):
    for last4 in ('5840', '2898', '3252'):
        if last4 in text:
            return f'MC{last4}'
    return 'MC'


def optimize(path):
    raw = path.read_bytes()
    ext = {b'\xff\xd8': '.jpg', b'\x89P': '.png', b'%P': '.pdf'}.get(raw[:2], path.suffix.lower())
    if ext in {'.jpg', '.jpeg'}:
        out = mlo.optimize(raw)
        exif = Image.open(io.BytesIO(raw)).info.get('exif')
        if exif:
            d = piexif.load(exif)
            d['GPS'] = {}
            d.pop('thumbnail', None)
            d['1st'] = {}
            buf = io.BytesIO()
            piexif.insert(piexif.dump(d), out, buf)
            out = buf.getvalue()
        same_pixels(raw, out)
    elif ext == '.png':
        out = oxipng.optimize_from_memory(raw, level=4)
        same_pixels(raw, out)
    elif ext == '.pdf':
        src = pikepdf.open(io.BytesIO(raw))
        buf = io.BytesIO()
        src.save(buf, compress_streams=True, recompress_flate=True,
                 object_stream_mode=pikepdf.ObjectStreamMode.generate)
        out = buf.getvalue()
        if len(pikepdf.open(io.BytesIO(out)).pages) != len(src.pages):
            raise SystemExit(f'page count changed: {path}')
    else:
        return raw
    return out if len(out) < len(raw) else raw


def same_pixels(a, b):
    x = np.asarray(Image.open(io.BytesIO(a)).convert('RGBA'))
    y = np.asarray(Image.open(io.BytesIO(b)).convert('RGBA'))
    if x.shape != y.shape or not (x == y).all():
        raise SystemExit('pixel mismatch after optimisation')


def plan():
    m = pd.read_pickle(S / 'receipt_matches_2026.pkl')
    ocr = json.loads((S / 'ocr_uncat.json').read_text())
    t = pd.read_csv(WS / 'transactions_master.csv', parse_dates=['date'])
    rows = []
    for _, r in m.iterrows():
        sub, name = r.file.split('/', 1)
        key = name[:8]
        text = ocr.get(name, '')
        entry = {'source_file': r.file, 'ledger_idx': r.ledger_idx, 'status': 'matched',
                 'second_copy': bool(r.second_copy)}
        if sub != 'uncategorized':
            entry['target'] = r.file
            entry['status'] = 'matched' if pd.notna(r.ledger_idx) else 'supporting'
            rows.append(entry)
            continue
        suffix = '-copy2' if r.second_copy else ''
        if key in MANUAL_LINE:
            idx, suffix = MANUAL_LINE[key]
            entry['ledger_idx'] = idx
        if pd.notna(entry['ledger_idx']):
            line = t.loc[int(entry['ledger_idx'])]
            d, amt, merch = line.date.date(), line.amount, merchant(line.description)
            stmt = pd.Timestamp(line.ref.replace('.pdf', '')).month
            if line.category == 'Personal — review':
                suffix += '-PERSONAL'
                entry['status'] = 'personal charge on corporate card — not claimed'
        elif key in PERSONAL:
            d, amt, merch, stmt = dt.date(2026, 4, 2), 353.94, 'MercedesBenz', 4
            suffix = PERSONAL[key]
            entry['status'] = 'personal card (Visa 1680) — director-funded'
        elif key in PENDING:
            ds, merch, amt = PENDING[key]
            d = dt.date.fromisoformat(ds)
            stmt = 9
            entry['status'] = 'pending Sep 28 statement'
        else:
            raise SystemExit(f'no rule for {r.file}')
        card = 'VISA1680' if key in PERSONAL else card_of(text)
        ext = '.png' if name.lower().endswith('.png') else '.jpg'
        base = f'{d.day:02d}-{MON[d.month - 1]}-{merch}-{amt:.2f}-{card}{suffix}{ext}'
        entry.update(target=f'{FOLDER[stmt]}/{base}', date=d, amount=amt, merchant=merch)
        rows.append(entry)
    plan_df = pd.DataFrame(rows)
    targets = plan_df.target.tolist()
    seen = {}
    for i, tg in enumerate(targets):
        n = seen.get(tg, 0)
        seen[tg] = n + 1
        if n:
            stem, dot, ext = tg.rpartition('.')
            targets[i] = f'{stem}-{n + 1}{dot}{ext}'
    plan_df['target'] = targets
    return plan_df


def main():
    p = plan()
    moves = p[p.source_file != p.target]
    print(f'{len(p)} receipts, {len(moves)} to file from uncategorized')
    print(moves.target.str.split('/').str[0].value_counts().sort_index().to_string())
    print(moves.target.head(8).to_string())
    if not APPLY:
        return
    before = after = 0
    for f in sorted(RC.rglob('*')):
        if not f.is_file() or f.name.startswith('.') or f.suffix.lower() == '.xlsx' \
                or '.impeccable' in f.parts:
            continue
        rel = f.relative_to(RC).as_posix()
        target = RC / p.set_index('source_file').target.get(rel, rel)
        if target.exists() and target != f:
            raise SystemExit(f'target exists: {target}')
        data = optimize(f)
        before += f.stat().st_size
        after += len(data)
        target.parent.mkdir(exist_ok=True)
        tmp = target.with_name(target.name + '.tmp')
        tmp.write_bytes(data)
        subprocess.run(['trash', str(f)], check=True)
        tmp.rename(target)
    unc = RC / 'uncategorized'
    if unc.exists() and not any(x for x in unc.iterdir() if not x.name.startswith('.')):
        subprocess.run(['trash', str(unc)], check=True)
    p.to_csv(WS / 'receipts_2026_index.csv', index=False)
    print(f'size {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB ({1 - after / before:.0%} smaller)')


if __name__ == '__main__':
    main()
