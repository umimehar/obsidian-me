#!/usr/bin/env python3
"""
Integrity checks for Business Transactions.xlsx.

Run this after ANY edit to the workbook. It catches the failure modes that have
actually occurred in this file (see WORKBOOK_GUIDE.md):

  1. Monthly starting balances no longer chain (row 5 != prior month's row 3)
  2. Master row 3 totals disagree with the final month's closing total
  3. A monthly tab and the master hold different transactions
  4. Amounts parked on undated rows (silently inflate a tab's totals)
  5. Subtotal rows double-count or subtract a live transaction row
  6. #REF!/#VALUE! anywhere
  7. A year subtotal disagrees with the transactions dated inside its window

The workbook is formula-driven, so it must be recalculated first:
    soffice --headless --norestore --convert-to xlsx --outdir /tmp "Business Transactions.xlsx"
    python3 verify_workbook.py "/tmp/Business Transactions.xlsx"

Reading the un-recalculated file with openpyxl returns formula strings, not values.
"""
import datetime
import sys
from collections import Counter

import openpyxl

MASTER = 'T 23-26'

# monthly tabs in true chronological order -- the tab names are NOT sortable
ORDER = ['Sep', 'Oct', 'Nov', 'Dec',                                    # 2023
         'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug 2024', # 2024
         'Sep 2024', 'Oct 2024', 'Nov 2024', 'Dec 2024',
         'Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025',
         'July 2025', 'Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025',
         'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'June 2026',
         'July 2026', 'Aug 2026']

PERIOD = dict(zip(ORDER, [
    (2023, 9), (2023, 10), (2023, 11), (2023, 12),
    (2024, 1), (2024, 2), (2024, 3), (2024, 4), (2024, 5), (2024, 6), (2024, 7), (2024, 8),
    (2024, 9), (2024, 10), (2024, 11), (2024, 12),
    (2025, 1), (2025, 2), (2025, 3), (2025, 4), (2025, 5), (2025, 6),
    (2025, 7), (2025, 8), (2025, 9), (2025, 10), (2025, 11), (2025, 12),
    (2026, 1), (2026, 2), (2026, 3), (2026, 4), (2026, 5), (2026, 6),
    (2026, 7), (2026, 8)]))

SUBTOTAL_ROWS = {39: 'CY2024', 95: 'FY24-25', 142: 'CY2025', 205: 'FY25-26', 247: 'CY2026',
                 328: 'FY26-27'}
# date window each subtotal must equal; FY = HST year, Aug 15 to Aug 14
WINDOWS = {39: ('2024-01-01', '2024-12-31'), 95: ('2024-08-15', '2025-08-14'),
           142: ('2025-01-01', '2025-12-31'), 205: ('2025-08-15', '2026-08-14'),
           247: ('2026-01-01', '2026-12-31'), 328: ('2026-08-15', '2027-08-14')}
# rows deliberately booked outside their cash date window (filed years, leave as is)
# master row -> subtotal row whose window it is excluded from
WINDOW_EXCEPTIONS = {36: 39,   # Jan 16 2024 payout for Dec 2023 work, kept in 2023
                     37: 39,   # WISE fee on that payout, kept in 2023
                     93: 95}   # Aug 15 2024 dividend, kept in the FY 2023-24 block
COLS = (4, 5, 6, 7)   # D gross, E HST, F net, G payout
LAST = 1027           # master sum ranges end here


def num(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return 0.0


def check(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    M = wb[MASTER]
    fails = []

    # 1 -- balance chain
    prev = None
    for sh in ORDER:
        start = [num(wb[sh].cell(5, c).value) for c in COLS]
        if prev is not None and start != prev:
            fails.append(f'chain break at {sh}: opens {start}, prior month closed {prev}')
        prev = [num(wb[sh].cell(3, c).value) for c in COLS]
    print(f'1. monthly balance chain      {"OK" if not fails else "FAIL"}')

    # 2 -- master vs chain
    r3 = [num(M.cell(3, c).value) for c in COLS]
    ok2 = r3 == prev
    if not ok2:
        fails.append(f'master row 3 {r3} != final closing {prev}')
    print(f'2. master totals == chain     {"OK" if ok2 else "FAIL"}')

    # 3 -- transaction-level tab vs master
    master = {}
    for r in M.iter_rows(min_row=1, max_row=LAST, values_only=True):
        d = r[0]
        if isinstance(d, datetime.datetime):
            master.setdefault((d.year, d.month), []).append(
                (d.date().isoformat(), str(r[1]).strip(),
                 num(r[3]), num(r[4]), num(r[5]), num(r[6])))
    bad = 0
    for sh in ORDER:
        tab = [(r[0].date().isoformat(), str(r[1]).strip(),
                num(r[3]), num(r[4]), num(r[5]), num(r[6]))
               for r in wb[sh].iter_rows(min_row=5, values_only=True)
               if isinstance(r[0], datetime.datetime)]
        a, b = Counter(tab), Counter(master.get(PERIOD[sh], []))
        if a != b:
            bad += 1
            fails.append(f'{sh} differs from master')
            for x in a - b:
                print(f'     {sh}: tab only    {x}')
            for x in b - a:
                print(f'     {sh}: master only {x}')
    print(f'3. every tab == master        {"OK" if not bad else f"{bad} tab(s) differ"}')

    # 4 -- orphan amounts on undated rows
    # only the monthly tabs -- MASTER and the archived 'T 23 - 24' tab carry
    # summary blocks on undated rows by design
    orphans = [(sh, r)
               for sh in ORDER for ws in [wb[sh]]
               for r in range(6, ws.max_row + 1)
               if not isinstance(ws.cell(r, 1).value, datetime.datetime)
               and any(num(ws.cell(r, c).value) for c in COLS)]
    if orphans:
        fails.append(f'orphan amounts: {orphans}')
    print(f'4. no orphan amounts          {"OK" if not orphans else f"FAIL {orphans}"}')

    # 5 -- subtotal arithmetic
    plain = [round(sum(num(M.cell(r, c).value)
                       for r in range(8, LAST + 1) if r not in SUBTOTAL_ROWS), 2)
             for c in COLS]
    ok5 = plain == r3
    if not ok5:
        fails.append(f'subtotals off: transactions sum to {plain}, row 3 says {r3}')
    print(f'5. subtotal arithmetic        {"OK" if ok5 else "FAIL"}')

    # 6 -- formula errors
    errs = [f'{ws.title}!{c.coordinate}'
            for ws in wb.worksheets for row in ws.iter_rows() for c in row
            if isinstance(c.value, str) and c.value.startswith('#')]
    if errs:
        fails.append(f'formula errors: {errs[:10]}')
    print(f'6. no formula errors          {"OK" if not errs else f"FAIL {errs[:5]}"}')

    # 7 -- each subtotal equals the dated rows in its window
    dated = [(i, r[0].date().isoformat(), [num(r[c - 1]) for c in COLS])
             for i, r in enumerate(M.iter_rows(min_row=8, max_row=LAST, values_only=True), 8)
             if isinstance(r[0], datetime.datetime)]
    bad7 = []
    for row, (lo, hi) in WINDOWS.items():
        want = [round(sum(v[i] for n, d, v in dated
                          if lo <= d <= hi and WINDOW_EXCEPTIONS.get(n) != row), 2)
                for i in range(4)]
        got = [num(M.cell(row, c).value) for c in COLS]
        if want != got:
            bad7.append(f'row {row} {SUBTOTAL_ROWS[row]}: says {got}, dated rows sum to {want}')
    fails += bad7
    print(f'7. subtotals match date window {"OK" if not bad7 else f"FAIL {len(bad7)}"}')

    print()
    if fails:
        print(f'{len(fails)} PROBLEM(S):')
        for f in fails:
            print('  -', f)
        return 1
    print('ALL CHECKS PASS')
    return 0


if __name__ == '__main__':
    sys.exit(check(sys.argv[1] if len(sys.argv) > 1 else 'Business Transactions.xlsx'))
