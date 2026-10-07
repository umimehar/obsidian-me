"""
Generate two payroll PDFs for Maham Amir - 2026:

1) CPP.pdf            -> original: $2,000/month for all 12 months ($24,000 total)
2) CPP_24K_Apr-Dec.pdf -> revised:  $24,000 spread across April–December (9 months)
                                    = $2,666.67/month (employer CPP match, EI exempt)
"""
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)

OUT_DIR = "/sessions/zen-ecstatic-carson/mnt/Taxes/2026/Corporate/payroll"

styles = getSampleStyleSheet()
small_bold = ParagraphStyle('sb', parent=styles['Normal'],
                            fontName='Helvetica-Bold', fontSize=9, leading=11)

HEADER_LINES = [
    "Maham Amir",
    "Year - 2026",
    "SIN: ****",
    "15248132 Canada Inc.",
    "BN: 795920958 RP 0001",
    "Umar Farooq Aslam",
    "647-762-8949",
    "1004-200 Burnhamthorpe E",
    "Mississauga, ON",
    "L5A 4L4",
]

MONTHS_ALL = ["January","February","March","April","May","June",
              "July","August","September","October","November","December"]


def build_pdf(out_path, paid_months, salary, cpp, tax,
              schedule=None):
    """Build a payroll PDF.
    paid_months : list of month names that receive a paycheque
    salary, cpp, tax : per-month values
    schedule : optional dict with keys
        'pay_dates'  -> list of (month, date_str) for net-pay e-transfers
        'cra_dates'  -> list of (quarter_label, date_str, amount) for CRA remittance
        If provided, two extra summary tables are appended below the main table.
    """
    EI       = "-"
    EI_EMP   = "-"
    TD       = round(cpp + tax, 2)
    NET      = round(salary - TD, 2)
    ECPP     = cpp
    ETOT     = ECPP
    PAY      = round(TD + ETOT, 2)

    # Quarterly remittance: sum of monthly "Payable-CRA" within calendar quarter
    quarter_map = {
        "March":     ["January","February","March"],
        "June":      ["April","May","June"],
        "September": ["July","August","September"],
        "December":  ["October","November","December"],
    }
    paid_set = set(paid_months)
    quarterly_by_month = {}
    for end_month, q_months in quarter_map.items():
        q_total = sum(PAY for m in q_months if m in paid_set)
        quarterly_by_month[end_month] = round(q_total, 2)

    # ---------- Left header block ----------
    header_para = [Paragraph(line, small_bold) for line in HEADER_LINES]
    header_table = Table([[p] for p in header_para], colWidths=[2.0*inch])
    header_table.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 0),
        ("TOPPADDING",   (0,0), (-1,-1), 1),
        ("BOTTOMPADDING",(0,0), (-1,-1), 1),
    ]))

    # ---------- Payroll table ----------
    def fmt(v):
        if isinstance(v, str):
            return v
        if v == 0:
            return "-"
        return f"{v:,.2f}"

    hdr_row_1 = ["Month","Salary","CPP","EI - Exempt","Tax",
                 "Total\nDeductions","Net Pay",
                 "CPP","EI - Exmpt","Total",
                 "Payable - CRA","Quarterly"]
    hdr_row_2 = ["","$","$","$","$","$","$","$","$","$","$",""]
    hdr_row_3 = ["","(A)","(B)","( C)","(D)",
                 "(E= B + C + D)","(F = A - E)",
                 "(G)","(H)","(I = G + H)",
                 "(J = E + I)",""]

    data_rows = []
    tot = dict(sal=0, cpp=0, tax=0, td=0, net=0, ecpp=0, etot=0, pay=0, q=0)

    for name in MONTHS_ALL:
        if name in paid_set:
            sal_v, cpp_v, tax_v = salary, cpp, tax
            td_v, net_v = TD, NET
            ecpp_v, etot_v, pay_v = ECPP, ETOT, PAY
            ei_v, ei_emp_v = EI, EI_EMP
        else:
            sal_v = cpp_v = tax_v = 0
            td_v = net_v = 0
            ecpp_v = etot_v = pay_v = 0
            ei_v = ei_emp_v = "-"

        q_v = quarterly_by_month.get(name, "")
        if isinstance(q_v, (int, float)):
            tot["q"] += q_v

        tot["sal"]  += sal_v
        tot["cpp"]  += cpp_v
        tot["tax"]  += tax_v
        tot["td"]   += td_v
        tot["net"]  += net_v
        tot["ecpp"] += ecpp_v
        tot["etot"] += etot_v
        tot["pay"]  += pay_v

        q_disp = (fmt(q_v) if isinstance(q_v,(int,float)) and q_v > 0 else "")
        data_rows.append([
            name, fmt(sal_v), fmt(cpp_v), ei_v, fmt(tax_v),
            fmt(td_v), fmt(net_v),
            fmt(ecpp_v), ei_emp_v, fmt(etot_v),
            fmt(pay_v), q_disp,
        ])

    total_row = [
        "Total",
        fmt(tot["sal"]),  fmt(tot["cpp"]), "-", fmt(tot["tax"]),
        fmt(tot["td"]),   fmt(tot["net"]),
        fmt(tot["ecpp"]), "-", fmt(tot["etot"]),
        fmt(tot["pay"]),  fmt(tot["q"]),
    ]

    table_data = [hdr_row_1, hdr_row_2, hdr_row_3] + data_rows + [total_row]

    col_widths = [
        0.85*inch, 0.75*inch, 0.65*inch, 0.7*inch, 0.6*inch,
        0.85*inch, 0.75*inch,
        0.6*inch, 0.7*inch, 0.65*inch,
        0.85*inch, 0.75*inch,
    ]
    payroll_table = Table(table_data, colWidths=col_widths, repeatRows=3)

    HDR_BLUE   = colors.HexColor("#FFE9B0")
    CPP_BG     = colors.HexColor("#F2DCDB")
    EI_BG      = colors.HexColor("#FDE9D9")
    TAX_BG     = colors.HexColor("#FCD5B4")
    TD_BG      = colors.HexColor("#FFE9B0")
    NET_BG     = colors.HexColor("#DCE6F1")
    EMP_HDR_BG = colors.HexColor("#D9D9D9")
    EMP_PURPLE = colors.HexColor("#E4DFEC")
    PAY_BG     = colors.HexColor("#FFFF00")
    Q_BG       = colors.HexColor("#FFFF00")

    style = TableStyle([
        ("BOX", (0,0), (-1,-1), 0.75, colors.black),
        ("INNERGRID", (0,0), (-1,-1), 0.25, colors.grey),

        ("FONTNAME", (0,0), (-1,2), "Helvetica-Bold"),
        ("FONTNAME", (0,3), (-1,-1), "Helvetica"),
        ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 8.5),

        ("ALIGN", (1,0), (-1,-1), "RIGHT"),
        ("ALIGN", (0,0), (0,-1),  "LEFT"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),

        ("BACKGROUND", (2,0), (5,2),  HDR_BLUE),
        ("BACKGROUND", (7,0), (10,2), EMP_HDR_BG),
        ("TEXTCOLOR",  (2,0), (5,2),  colors.HexColor("#7B1F1F")),
        ("TEXTCOLOR",  (10,0),(10,2), colors.HexColor("#7B1F1F")),

        ("BACKGROUND", (2,3), (2,-2), CPP_BG),
        ("BACKGROUND", (3,3), (3,-2), EI_BG),
        ("BACKGROUND", (4,3), (4,-2), TAX_BG),
        ("BACKGROUND", (5,3), (5,-2), TD_BG),
        ("BACKGROUND", (6,3), (6,-2), NET_BG),
        ("BACKGROUND", (7,3), (7,-2), EMP_PURPLE),
        ("BACKGROUND", (8,3), (8,-2), EMP_PURPLE),
        ("BACKGROUND", (9,3), (9,-2), EMP_PURPLE),
        ("BACKGROUND", (10,3),(10,-2),PAY_BG),
        ("BACKGROUND", (11,3),(11,-2),Q_BG),

        ("LINEABOVE", (0,-1), (-1,-1), 1.0, colors.black),
        ("LINEBELOW", (0,-1), (-1,-1), 1.5, colors.black),

        ("LEFTPADDING",  (0,0), (-1,-1), 3),
        ("RIGHTPADDING", (0,0), (-1,-1), 3),
        ("TOPPADDING",   (0,0), (-1,-1), 2),
        ("BOTTOMPADDING",(0,0), (-1,-1), 2),
    ])
    payroll_table.setStyle(style)

    # "Employer Contribution" superheader spanning columns 7-9
    emp_super = Table(
        [["", "", "", "", "", "", "", "Employer Contribution", ""]],
        colWidths=[
            0.85*inch, 0.75*inch, 0.65*inch, 0.7*inch, 0.6*inch,
            0.85*inch, 0.75*inch, 1.95*inch, 1.6*inch,
        ],
    )
    emp_super.setStyle(TableStyle([
        ("FONTNAME", (7,0), (7,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ALIGN",    (7,0), (7,0), "CENTER"),
        ("LINEBELOW",(7,0), (7,0), 0.5, colors.black),
        ("BOTTOMPADDING",(0,0), (-1,-1), 0),
        ("TOPPADDING",   (0,0), (-1,-1), 0),
    ]))

    left_right = Table(
        [[header_table, payroll_table]],
        colWidths=[2.1*inch, 8.6*inch],
    )
    left_right.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 0),
    ]))

    doc = SimpleDocTemplate(
        out_path,
        pagesize=landscape(letter),
        leftMargin=0.4*inch, rightMargin=0.4*inch,
        topMargin=0.4*inch,  bottomMargin=0.4*inch,
    )

    story = [emp_super, Spacer(1, 0.02*inch), left_right]

    # ---------- Optional: payment schedule tables ----------
    if schedule:
        title_style = ParagraphStyle('title_sched', parent=styles['Normal'],
                                     fontName='Helvetica-Bold', fontSize=11,
                                     textColor=colors.HexColor("#1F4E79"),
                                     spaceBefore=10, spaceAfter=4)

        story.append(Spacer(1, 0.25*inch))

        # ---- Net-pay e-transfer schedule ----
        story.append(Paragraph(
            "Payment Schedule — E-transfer to Maham (Net Pay)", title_style))

        et_header = ["#", "Month", "Pay Date", "Amount (CAD)"]
        et_rows = [et_header]
        et_total = 0.0
        for i, (m, d) in enumerate(schedule['pay_dates'], start=1):
            amt = NET
            et_total += amt
            et_rows.append([str(i), m, d, fmt(amt)])
        et_rows.append(["", "", "Total", fmt(round(et_total, 2))])

        et_table = Table(et_rows, colWidths=[0.4*inch, 1.4*inch, 2.0*inch, 1.5*inch])
        et_table.setStyle(TableStyle([
            ("BOX", (0,0), (-1,-1), 0.75, colors.black),
            ("INNERGRID", (0,0), (-1,-1), 0.25, colors.grey),
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#DCE6F1")),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 9),
            ("ALIGN",  (3,0), (3,-1), "RIGHT"),
            ("ALIGN",  (0,0), (0,-1), "CENTER"),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("LINEABOVE", (0,-1), (-1,-1), 1.0, colors.black),
            ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#F2F2F2")),
            ("LEFTPADDING",  (0,0), (-1,-1), 4),
            ("RIGHTPADDING", (0,0), (-1,-1), 4),
            ("TOPPADDING",   (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0), (-1,-1), 3),
        ]))
        story.append(et_table)

        # ---- CRA remittance schedule ----
        story.append(Paragraph(
            "Payment Schedule — CRA Payroll Remittance (PD7A, Quarterly)",
            title_style))

        cra_header = ["Quarter", "Months Covered", "Due Date", "Amount (CAD)"]
        cra_rows = [cra_header]
        cra_total = 0.0
        for q in schedule['cra_dates']:
            label, months_covered, due_date, amount = q
            cra_total += amount
            cra_rows.append([label, months_covered, due_date, fmt(amount)])
        cra_rows.append(["", "", "Total", fmt(round(cra_total, 2))])

        cra_table = Table(cra_rows, colWidths=[1.0*inch, 2.0*inch, 1.6*inch, 1.4*inch])
        cra_table.setStyle(TableStyle([
            ("BOX", (0,0), (-1,-1), 0.75, colors.black),
            ("INNERGRID", (0,0), (-1,-1), 0.25, colors.grey),
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#FFF2CC")),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 9),
            ("ALIGN",  (3,0), (3,-1), "RIGHT"),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("LINEABOVE", (0,-1), (-1,-1), 1.0, colors.black),
            ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#F2F2F2")),
            ("LEFTPADDING",  (0,0), (-1,-1), 4),
            ("RIGHTPADDING", (0,0), (-1,-1), 4),
            ("TOPPADDING",   (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0), (-1,-1), 3),
        ]))
        story.append(cra_table)

        note_style = ParagraphStyle('note', parent=styles['Normal'],
                                    fontName='Helvetica-Oblique', fontSize=8,
                                    textColor=colors.HexColor("#555555"),
                                    spaceBefore=6, leading=11)
        story.append(Paragraph(
            "Pay dates shown are month-end; if a date falls on a weekend or "
            "holiday, send the e-transfer on the prior business day. CRA "
            "quarterly remittance due dates per CRA rules: 15th of the month "
            "following each calendar quarter (or next business day).",
            note_style))

        if schedule.get('calc_basis'):
            basis_style = ParagraphStyle(
                'basis', parent=styles['Normal'],
                fontName='Helvetica', fontSize=8,
                textColor=colors.HexColor("#333333"),
                spaceBefore=10, leading=11,
                borderColor=colors.HexColor("#BBBBBB"), borderWidth=0.5,
                borderPadding=6, backColor=colors.HexColor("#FAFAFA"),
            )
            story.append(Paragraph(schedule['calc_basis'], basis_style))

    doc.build(story)
    print(f"Wrote {out_path}")
    print(f"  per-month: SAL={salary} CPP={cpp} TAX={tax} TD={TD} NET={NET} EMP_CPP={ECPP} CRA={PAY}")
    print(f"  totals:    SAL={tot['sal']:.2f} CPP={tot['cpp']:.2f} TAX={tot['tax']:.2f} "
          f"NET={tot['net']:.2f} CRA={tot['pay']:.2f}")
    return tot


# ---------- Build the two PDFs ----------

# 1) Original: $2,000/month, all 12 months  → CPP $101.82, Tax $89.81
build_pdf(
    out_path=f"{OUT_DIR}/CPP.pdf",
    paid_months=MONTHS_ALL,
    salary=2000.00, cpp=101.82, tax=89.81,
)

# 2) Revised: April–December (9 months), $2,666.67/month
#    CPP and Tax scaled to keep annual totals ≈ same as original
#    ($1,221.80 / 9 ≈ $135.76,  $1,077.68 / 9 ≈ $119.74)
APR_DEC = ["April","May","June","July","August","September","October","November","December"]

# Pay dates: month-end (Thursdays/etc. handled in note)
PAY_DATES = [
    ("April",     "Thu, Apr 30, 2026"),
    ("May",       "Fri, May 29, 2026"),   # May 31 is Sunday → prior business day
    ("June",      "Tue, Jun 30, 2026"),
    ("July",      "Fri, Jul 31, 2026"),
    ("August",    "Mon, Aug 31, 2026"),
    ("September", "Wed, Sep 30, 2026"),
    ("October",   "Fri, Oct 30, 2026"),   # Oct 31 is Saturday → prior business day
    ("November",  "Mon, Nov 30, 2026"),
    ("December",  "Thu, Dec 31, 2026"),
]

# CRA quarterly remitter due dates: 15th of month after quarter-end
# Each month CRA payable = $460.14 (employee CPP $141.31 + tax $177.52 + employer CPP $141.31)
# Each full quarter (3 months) = $1,380.42
CRA_DATES = [
    ("Q2 2026", "April + May + June",       "Wed, Jul 15, 2026", 1380.42),
    ("Q3 2026", "July + August + September","Thu, Oct 15, 2026", 1380.42),
    ("Q4 2026", "October + Nov + December", "Fri, Jan 15, 2027", 1380.42),
]

CALC_BASIS_HTML = (
    "<b>Calculation basis (2026 official CRA values):</b> "
    "Federal lowest tax rate <b>14.0%</b> (reduced from 15% in 2025); "
    "Federal BPA <b>$16,452</b>; Ontario lowest rate <b>5.05%</b>; "
    "Ontario BPA <b>$12,989</b>; CPP rate <b>5.95%</b> with annual basic "
    "exemption <b>$3,500</b> (monthly $291.67); EI <b>exempt</b> "
    "(non-arm's-length employment, spouse of controlling shareholder); "
    "TD1 Claim Code <b>1</b>. "
    "<b>True-up method</b> used for tax withholding: tax computed on actual "
    "projected annual income of $24,000 rather than annualizing $2,666.67 "
    "× 12 = $32,000 — this avoids over-withholding for an employee who only "
    "works part of the year. "
    "<b>Per-month figures:</b> CPP = ($2,666.67 - $291.67) × 5.95% = $141.31. "
    "Federal annual tax = 14% × ($24,000 - enhanced CPP $213.75) − "
    "14% × ($16,452 BPA + $1,058.04 base CPP credit) = $878.67. "
    "Ontario annual tax = 5.05% × $23,786.25 − 5.05% × ($12,989 + $1,058.04) "
    "= $491.83. Ontario Health Premium = 6% × ($23,786.25 − $20,000) "
    "= $227.18. Annual tax $1,597.68 ÷ 9 months = <b>$177.52/month</b>."
)

build_pdf(
    out_path=f"{OUT_DIR}/CPP_24K_Apr-Dec.pdf",
    paid_months=APR_DEC,
    salary=2666.67, cpp=141.31, tax=177.52,
    schedule={"pay_dates": PAY_DATES, "cra_dates": CRA_DATES,
              "calc_basis": CALC_BASIS_HTML},
)
