#!/usr/bin/env python3
"""
Build the 2026 Mercedes personal use schedule (20% charged to Umar by set-off).

    uv run --with openpyxl python build_vehicle_personal_use.py \
        --ledger ../parsed_data/transactions_master.csv \
        --out "../../../../2026/Corporate/Vehicle personal use 2026.xlsx"

Actual rows come from the ledger. Months the ledger has not reached yet are added
as estimates and marked so; replace them once the December statements are parsed.
"""

import argparse
import csv

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

BUSINESS_USE = 0.80
LEASE_CAP = round(38000 / (0.85 * 99500), 4)
LEASE = 'Vehicle — lease'
CATEGORIES = [LEASE, 'Vehicle — insurance', 'Vehicle & fuel', 'Vehicle — maintenance']
# Sep–Dec 2026 not yet on a parsed statement. Insurance renews Oct 1 at $9,657/yr.
ESTIMATES = [
    ('2026-09-01', 'Vehicle — insurance', 700.84, 'Car insurance (2025-26 policy)'),
    ('2026-10-01', 'Vehicle — insurance', 804.75, 'Car insurance (2026-27 renewal)'),
    ('2026-11-01', 'Vehicle — insurance', 804.75, 'Car insurance (2026-27 renewal)'),
    ('2026-12-01', 'Vehicle — insurance', 804.75, 'Car insurance (2026-27 renewal)'),
    ('2026-09-30', LEASE, 1750.01, 'Car lease'),
    ('2026-10-30', LEASE, 1750.01, 'Car lease'),
    ('2026-11-30', LEASE, 1750.01, 'Car lease'),
    ('2026-12-30', LEASE, 1750.01, 'Car lease'),
]
FUEL_MONTHS_ESTIMATED = ('2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31')

# 2025 figures: filed T2 line 9281 and the 2025 ledger, see VEHICLE_2025_vs_2026.md
COMPARISON = [
    ('Lease payments', 12000.04, 0.0),
    ('Insurance (Mercedes; own car insurance sat in the home policy)', 2102.44, 0.0),
    ('Fuel, washes, accessories', 1716.33, 0.0),
    ('Maintenance and tires', 3134.05, 0.0),
    ('Own car Jan–Sep: mileage paid to Umar', 3160.96, 0.0),
    ('Own car Jan–Sep: services, installment, washes, parking, rental', 3331.27, 0.0),
]

ARIAL = 'Arial'
BOLD = Font(name=ARIAL, bold=True)
BLUE = Font(name=ARIAL, color='0000FF')
PLAIN = Font(name=ARIAL)
GREY = Font(name=ARIAL, italic=True, color='808080')
HEAD_FILL = PatternFill('solid', start_color='D9E1F2')
INPUT_FILL = PatternFill('solid', start_color='FFFF00')
MONEY = '$#,##0.00;($#,##0.00);-'
PCT = '0.00%'
TOP = Border(top=Side(style='thin'))


def read_actuals(path):
    """Vehicle costs for tax year 2026 from the ledger, every source."""
    rows = []
    with open(path, newline='') as f:
        for r in csv.DictReader(f):
            if r['tax_year'] == '2026' and r['direction'] == 'out' and r['category'] in CATEGORIES:
                paid_by = 'Umar (personal card)' if r['source'] == 'personal' else 'Corporation'
                rows.append(
                    (
                        r['date'],
                        paid_by,
                        r['category'],
                        r['description'],
                        float(r['amount']),
                        'Actual',
                    )
                )
    return rows


def estimates(actual_rows):
    fuel = [a for _, _, c, _, a, _ in actual_rows if c == 'Vehicle & fuel']
    months_seen = len({d[:7] for d, _, c, *_ in actual_rows if c == 'Vehicle & fuel'})
    per_month = round(sum(fuel) / months_seen, 2)
    rows = [(d, 'Corporation', c, desc, amt, 'Estimate') for d, c, amt, desc in ESTIMATES]
    rows += [
        (
            d,
            'Corporation',
            'Vehicle & fuel',
            'Fuel and washes, monthly average Jan–Aug',
            per_month,
            'Estimate',
        )
        for d in FUEL_MONTHS_ESTIMATED
    ]
    return rows


def header(ws, row, labels):
    for col, label in enumerate(labels, 1):
        cell = ws.cell(row=row, column=col, value=label)
        cell.font, cell.fill = BOLD, HEAD_FILL
        cell.alignment = Alignment(wrap_text=True, vertical='center')


def build_assumptions(wb):
    ws = wb.active
    ws.title = 'Assumptions'
    ws['A1'], ws['A1'].font = (
        'Mercedes GLC 43 personal use, tax year 2026',
        Font(name=ARIAL, bold=True, size=13),
    )
    ws['A2'] = (
        '15248132 Canada Inc. (o/a XYZ Bytes). '
        'Yellow cells are the inputs; everything else is a formula.'
    )
    ws['A2'].font = GREY
    items = [
        (
            'Business use',
            BUSINESS_USE,
            'Set by Umar on Oct 7, 2026. Matches the 2025-26 HST return.',
        ),
        (
            's.67.3 lease cap ratio',
            LEASE_CAP,
            '38,000 / (0.85 × 99,500 list price). Same ratio as the HST return.',
        ),
    ]
    for i, (label, value, note) in enumerate(items, start=4):
        ws.cell(row=i, column=1, value=label).font = PLAIN
        cell = ws.cell(row=i, column=2, value=value)
        cell.font, cell.fill, cell.number_format = BLUE, INPUT_FILL, PCT
        ws.cell(row=i, column=3, value=note).font = GREY
    ws['A6'], ws['B6'] = 'Personal use', '=1-B4'
    ws['A7'], ws['B7'] = 'Lease deductible share (business use × cap)', '=B4*B5'
    for ref in ('A6', 'A7'):
        ws[ref].font = PLAIN
    for ref in ('B6', 'B7'):
        ws[ref].font, ws[ref].number_format = PLAIN, PCT
    ws['A9'] = (
        'Personal share is charged to Umar by set-off against what the corporation owes him '
        '(resolution of the sole director). The cap applies only to the business share; '
        'the corporation absorbs the excess and it is not charged to Umar.'
    )
    ws['A9'].font = GREY
    ws.column_dimensions['A'].width = 44
    ws.column_dimensions['B'].width = 14
    ws.column_dimensions['C'].width = 70


def build_transactions(wb, rows):
    ws = wb.create_sheet('Transactions')
    header(
        ws,
        1,
        [
            'Date',
            'Paid by',
            'Category',
            'Description',
            'Amount',
            'Status',
            'Personal share (charged to Umar)',
            'Deductible to corporation',
            'Over the lease cap (not deductible)',
        ],
    )
    for i, (d, paid_by, cat, desc, amt, status) in enumerate(sorted(rows), start=2):
        values = [d, paid_by, cat, desc, amt, status]
        for col, v in enumerate(values, 1):
            cell = ws.cell(row=i, column=col, value=v)
            cell.font = BLUE if col == 5 else (GREY if status == 'Estimate' else PLAIN)
        ws.cell(row=i, column=7, value=f'=E{i}*Assumptions!$B$6')
        ws.cell(
            row=i,
            column=8,
            value=f'=IF(C{i}="{LEASE}",E{i}*Assumptions!$B$7,E{i}*Assumptions!$B$4)',
        )
        ws.cell(row=i, column=9, value=f'=IF(C{i}="{LEASE}",E{i}*Assumptions!$B$4-H{i},0)')
        for col in (5, 7, 8, 9):
            ws.cell(row=i, column=col).number_format = MONEY
    widths = [12, 22, 22, 44, 13, 10, 18, 18, 18]
    for col, w in zip('ABCDEFGHI', widths):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = 'A2'
    return len(rows) + 1


def sumifs(col, last, *crit):
    pairs = ''.join(f',Transactions!${c}$2:${c}${last},{v}' for c, v in crit)
    return f'=SUMIFS(Transactions!${col}$2:${col}${last}{pairs})'


def build_summary(wb, last):
    ws = wb.create_sheet('Summary', 1)
    ws['A1'], ws['A1'].font = 'Summary, tax year 2026', Font(name=ARIAL, bold=True, size=13)
    header(
        ws,
        3,
        [
            'Category',
            'Total cost',
            'Personal share (charged to Umar)',
            'Deductible to corporation',
            'Over the lease cap',
        ],
    )
    for i, cat in enumerate(CATEGORIES, start=4):
        ws.cell(row=i, column=1, value=cat).font = PLAIN
        for col, src in zip(range(2, 6), 'EGHI'):
            cell = ws.cell(row=i, column=col, value=sumifs(src, last, ('C', f'$A{i}')))
            cell.number_format, cell.font = MONEY, PLAIN
    total = 4 + len(CATEGORIES)
    ws.cell(row=total, column=1, value='Total').font = BOLD
    for col in 'BCDE':
        cell = ws[f'{col}{total}']
        cell.value, cell.font, cell.number_format, cell.border = (
            f'=SUM({col}4:{col}{total - 1})',
            BOLD,
            MONEY,
            TOP,
        )
    split = total + 2
    ws.cell(row=split, column=1, value='Personal share, actual to date').font = PLAIN
    ws.cell(row=split, column=3, value=sumifs('G', last, ('F', '"Actual"')))
    ws.cell(row=split + 1, column=1, value='Personal share, estimated to Dec 31').font = PLAIN
    ws.cell(row=split + 1, column=3, value=sumifs('G', last, ('F', '"Estimate"')))
    ws.cell(
        row=split + 2, column=1, value='Of which Umar paid himself (reduces his claim)'
    ).font = PLAIN
    ws.cell(row=split + 2, column=3, value=sumifs('G', last, ('B', '"Umar (personal card)"')))
    for r in range(split, split + 3):
        ws.cell(row=r, column=3).number_format = MONEY
    ws.cell(
        row=split + 4,
        column=1,
        value=(
            'Journal entry at Dec 31, 2026: Dr Due to shareholder, Cr vehicle expense accounts, '
            'for the total personal share once the estimates are replaced by actuals.'
        ),
    ).font = GREY
    ws.column_dimensions['A'].width = 46
    for col in 'BCDE':
        ws.column_dimensions[col].width = 20


def build_comparison(wb, last):
    ws = wb.create_sheet('2025 vs 2026')
    ws['A1'], ws['A1'].font = 'Car costs: 2025 against 2026', Font(name=ARIAL, bold=True, size=13)
    ws['A2'] = (
        '2025: Jan–Sep own car paid by mileage; Mercedes from Sep 27, claimed at 100% with no cap '
        'on the filed T2 (line 9281: $24,315). 2026 column is the full year projection.'
    )
    ws['A2'].font = GREY
    header(
        ws, 4, ['Item', '2025 cost', '2025 deducted (as filed, 100%)', '2026 cost', '2026 deducted']
    )
    for i, (label, cost_2025, _) in enumerate(COMPARISON, start=5):
        ws.cell(row=i, column=1, value=label).font = PLAIN
        ws.cell(row=i, column=2, value=cost_2025).font = BLUE
        ws.cell(row=i, column=3, value=f'=B{i}').font = PLAIN
    links = {
        5: 4,
        6: 5,
        7: 6,
        8: 7,
    }  # 2025 rows -> Summary rows (lease, insurance, fuel, maintenance)
    for row, summary_row in links.items():
        ws.cell(row=row, column=4, value=f'=Summary!B{summary_row}').font = Font(
            name=ARIAL, color='008000'
        )
        ws.cell(row=row, column=5, value=f'=Summary!D{summary_row}').font = Font(
            name=ARIAL, color='008000'
        )
    total = 5 + len(COMPARISON)
    ws.cell(row=total, column=1, value='Total').font = BOLD
    for col in 'BCDE':
        cell = ws[f'{col}{total}']
        cell.value, cell.font, cell.border = f'=SUM({col}5:{col}{total - 1})', BOLD, TOP
    for r in range(5, total + 1):
        for col in 'BCDE':
            ws[f'{col}{r}'].number_format = MONEY
    ws['B5'].comment = Comment(
        'Down payment $4,000 + 4 instalments of $1,750.01, Sep 27 to Dec 30.', 'ledger'
    )
    ws['B10'].comment = Comment(
        'Lexus services $1,247.34 + $736.79, car installment $963.77, '
        'washes $325.42, parking $15, rental $33.89, TD $9.06.',
        'ledger',
    )
    ws.column_dimensions['A'].width = 58
    for col in 'BCDE':
        ws.column_dimensions[col].width = 18


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--ledger', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    actual = read_actuals(args.ledger)
    rows = actual + estimates(actual)
    wb = Workbook()
    build_assumptions(wb)
    last = build_transactions(wb, rows)
    build_summary(wb, last)
    build_comparison(wb, last)
    wb.calculation.fullCalcOnLoad = True
    wb.save(args.out)
    personal = sum(a for *_, a, _ in rows) * (1 - BUSINESS_USE)
    print(
        f'{len(actual)} actual + {len(rows) - len(actual)} estimated rows; '
        f'personal share ≈ ${personal:,.2f}'
    )


if __name__ == '__main__':
    main()
