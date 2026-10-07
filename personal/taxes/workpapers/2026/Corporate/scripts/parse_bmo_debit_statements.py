#!/usr/bin/env python3
"""
Parse BMO business chequing statement PDFs into a flat CSV.

Account: BMO Business ****1004 (15248132 Canada Inc.)
Tested against the 2025 and 2026 statement layouts.

Usage:
    python3 parse_bmo_debit_statements.py <statements_dir> [-o out.csv]

Output columns: date, desc, dir, amount, balance, file
  dir is "debit" or "credit", inferred from the running balance rather than
  column position -- BMO's two-column layout does not survive text extraction
  reliably, but the balance always does.

Requires: pdfplumber
"""
import argparse, csv, os, re, sys

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber required:  pip install pdfplumber")

MONTHS = {m: i + 1 for i, m in enumerate(
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])}

# BMO strips spaces out of the date column: "Jan02 OnlineTransfer,TF000... 1,164.94 153,451.26"
ROW_RE = re.compile(r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\d{2})\s+(.*)$')
AMT_RE = re.compile(r'([\d,]+\.\d{2})')
# The summary row starts with the account number; any BMO account shape, so none is hardcoded.
SUMMARY_RE = re.compile(
    r'#\d{8}-\d{3}\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})')

TOL = 0.011  # cent tolerance when testing the balance roll


def money(s):
    return float(s.replace(',', ''))


def parse_pdf(path, year):
    """Return (transactions, summary) for one statement."""
    with pdfplumber.open(path) as pdf:
        text = '\n'.join(p.extract_text() or '' for p in pdf.pages)

    m = SUMMARY_RE.search(text)
    summary = [money(x) for x in m.groups()] if m else None  # open, debited, credited, close

    txns, prev = [], None
    for line in (l.strip() for l in text.split('\n')):
        hit = ROW_RE.match(line)
        if not hit:
            continue
        mon, day, rest = hit.group(1), int(hit.group(2)), hit.group(3)

        if 'Openingbalance' in rest:
            nums = AMT_RE.findall(rest)
            prev = money(nums[-1])
            continue
        if 'Closingtotals' in rest or 'Closingbalance' in rest:
            continue

        nums = AMT_RE.findall(rest)
        if len(nums) < 2:
            continue
        amount, balance = money(nums[-2]), money(nums[-1])
        desc = AMT_RE.split(rest)[0].strip()

        direction = 'debit'
        if prev is not None:
            if abs(prev - amount - balance) < TOL:
                direction = 'debit'
            elif abs(prev + amount - balance) < TOL:
                direction = 'credit'
            else:
                direction = '?'   # balance did not roll -- inspect manually

        txns.append({'date': f'{year}-{MONTHS[mon]:02d}-{day:02d}', 'desc': desc,
                     'dir': direction, 'amount': amount, 'balance': balance,
                     'file': os.path.basename(path)})
        prev = balance
    return txns, summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('directory', help='folder of statement PDFs')
    ap.add_argument('-o', '--out', default='debit_parsed.csv')
    ap.add_argument('-y', '--year', type=int, required=True,
                    help='calendar year of the statements (filenames omit it)')
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(args.directory) if f.lower().endswith('.pdf'))
    if not files:
        sys.exit(f'no PDFs in {args.directory}')

    all_txns, problems = [], []
    for fn in files:
        txns, summary = parse_pdf(os.path.join(args.directory, fn), args.year)
        all_txns += txns

        # self-check: parsed debits/credits must equal the statement summary block
        if summary:
            deb = round(sum(t['amount'] for t in txns if t['dir'] == 'debit'), 2)
            cre = round(sum(t['amount'] for t in txns if t['dir'] == 'credit'), 2)
            ok = abs(deb - summary[1]) < TOL and abs(cre - summary[2]) < TOL
            print(f'{fn:26} {len(txns):3} txns  debit {deb:>11,.2f}  credit {cre:>11,.2f}'
                  f'  close {summary[3]:>12,.2f}  {"OK" if ok else "MISMATCH"}')
            if not ok:
                problems.append(fn)
        else:
            print(f'{fn:26} {len(txns):3} txns  (no summary block found)')
            problems.append(fn)

    unknown = [t for t in all_txns if t['dir'] == '?']
    if unknown:
        problems.append('unresolved direction')
        print('\nrows whose balance did not roll:')
        for t in unknown:
            print('  ', t)

    with open(args.out, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=['date', 'desc', 'dir', 'amount', 'balance', 'file'])
        w.writeheader()
        w.writerows(all_txns)

    print(f'\n{len(all_txns)} transactions -> {args.out}')
    if problems:
        print('REVIEW NEEDED:', ', '.join(sorted(set(problems))))
        sys.exit(1)
    print('all statements self-checked clean')


if __name__ == '__main__':
    main()
