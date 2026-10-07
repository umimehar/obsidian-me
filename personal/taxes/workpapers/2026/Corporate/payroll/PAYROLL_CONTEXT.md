# 2026 Payroll Context — 15248132 Canada Inc. (XYZ Bytes)
Last updated: May 9, 2026

## Purpose
This file captures the 2026 payroll plan for **Maham Amir** (spouse of sole shareholder Umar Farooq Aslam) and the rigorous CRA calculations behind the PDFs in `2026/Corporate/payroll/`. Future Claude sessions should load this instead of re-deriving the math.

---

## Employee — Maham Amir

| Field | Detail |
|---|---|
| Legal name | Maham Amir |
| Relationship | Spouse of Umar Farooq Aslam (100% shareholder + director) |
| SIN | **** |
| Province of employment | Ontario |
| Pay frequency | Monthly |
| **EI status** | **EXEMPT** — non-arm's length employment (spouse of controlling shareholder) per EI Act ss.5(2)(i) |
| **CPP status** | Required (CPP applies even when EI is exempt) |
| TD1 Claim Code | 1 (basic personal amount only) |
| 2025 history | Added to payroll Dec 2025. Two payments: $6,000 + $10,000 = $16,000. Employer CPP+EI = $1,837.50 |

---

## 2026 Plan — confirmed

- **Annual gross salary: $24,000**
- **Pay period: April – December 2026** (9 months) at $2,666.67/month
  - $2,666.67 × 9 = $24,000.03 (3¢ rounding — disregard or trim final month by 3¢)
- April was when Maham started working in 2026; payroll begins that month.
- January–March 2026: no salary, no payroll filings needed for those months.

### Per-month figures (April–December)

| Item | Amount | Formula / Source |
|---|---:|---|
| Gross salary (A) | $2,666.67 | $24,000 ÷ 9 |
| Employee CPP (B) | $141.31 | ($2,666.67 − $291.67) × 5.95% |
| EI – exempt (C) | — | non-arm's length |
| Federal + Ontario income tax + OHP (D) | $177.52 | annual $1,597.68 ÷ 9 (true-up method) |
| **Total deductions (E = B+C+D)** | **$318.83** | |
| **Net pay (F = A − E)** | **$2,347.84** | e-transferred to Maham |
| Employer CPP match (G) | $141.31 | matches B (CPP enhancement same rate) |
| Employer EI (H) | — | exempt |
| Employer total (I = G+H) | $141.31 | |
| **CRA payable per month (J = E+I)** | **$460.14** | employee CPP + tax + employer CPP |

### Annual totals (9 months)

| Item | Amount |
|---|---:|
| Gross salary | $24,000.03 |
| Employee CPP | $1,271.79 |
| Income tax + OHP | $1,597.68 |
| Total deductions | $2,869.47 |
| **Net pay (e-transfer total)** | **$21,130.56** |
| Employer CPP match | $1,271.79 |
| **Total to remit to CRA** | **$4,141.26** |

---

## E-transfer schedule (to Maham — from business chequing)

| # | Month | Pay date | Amount |
|---:|---|---|---:|
| 1 | April | Thu, Apr 30, 2026 | $2,347.84 |
| 2 | May | Fri, May 29, 2026 (May 31 = Sun) | $2,347.84 |
| 3 | June | Tue, Jun 30, 2026 | $2,347.84 |
| 4 | July | Fri, Jul 31, 2026 | $2,347.84 |
| 5 | August | Mon, Aug 31, 2026 | $2,347.84 |
| 6 | September | Wed, Sep 30, 2026 | $2,347.84 |
| 7 | October | Fri, Oct 30, 2026 (Oct 31 = Sat) | $2,347.84 |
| 8 | November | Mon, Nov 30, 2026 | $2,347.84 |
| 9 | December | Thu, Dec 31, 2026 | $2,347.84 |
| | | **Total** | **$21,130.56** |

---

## CRA payroll remittance schedule — ACTUAL SET-UP (monthly)

Pre-scheduled as 9 monthly bill payments via BMO business chequing on May 9, 2026. Quarterly remitter status was available but the user opted for monthly remittance instead (simpler, more frequent reconciliation, and December's remittance falls inside the 2026 fiscal year).

| # | Scheduled date | Day | Covers payroll for | CRA monthly due date | Amount |
|---:|---|---|---|---|---:|
| 1 | **May 11, 2026** | Mon | April 2026 | May 15, 2026 | $460.14 |
| 2 | **Jun 15, 2026** | Mon | May 2026 | Jun 15, 2026 | $460.14 |
| 3 | **Jul 15, 2026** | Wed | June 2026 | Jul 15, 2026 | $460.14 |
| 4 | **Aug 14, 2026** | Fri | July 2026 | Aug 15, 2026 (Sat) | $460.14 |
| 5 | **Sep 11, 2026** | Fri | August 2026 | Sep 15, 2026 | $460.14 |
| 6 | **Oct 09, 2026** | Fri | September 2026 | Oct 15, 2026 | $460.14 |
| 7 | **Nov 13, 2026** | Fri | October 2026 | Nov 15, 2026 (Sun) | $460.14 |
| 8 | **Dec 04, 2026** | Fri | November 2026 | Dec 15, 2026 | $460.14 |
| 9 | **Dec 31, 2026** | Thu | December 2026 | Jan 15, 2027 | $460.14 |
| | | | **Total** | | **$4,141.26** |

Each $460.14 = $141.31 employee CPP + $177.52 employee tax + $141.31 employer CPP match.
Remitted under BN **795920958 RP 0001**. Detailed schedule in `CRA_Remittance_Schedule_Set_Up.md`.

---

## Calculation methodology — IMPORTANT

### "True-up" tax method (used here)
Tax withholding is computed against the **actual projected annual income of $24,000**, not the annualized $32,000 that comes from naively projecting $2,666.67 × 12. Default CRA PDOC tables annualize, which would over-withhold for an employee who only works part of the year — the over-withholding is later refunded at year-end on the T1.

This is technically defensible (CRA accepts non-standard withholding methods provided total tax owing is satisfied), but most payroll software uses the annualized default. **If the new accountant prefers the conservative annualized approach, regenerate the PDF with the larger withholding numbers.** The total tax owed at year-end is the same; only the timing changes.

### CPP calculation (per-pay-period method, CRA standard)
CPP is calculated per pay period using the monthly basic exemption ($291.67 = $3,500 ÷ 12). Because Maham is paid for only 9 months, total annual CPP ($1,271.79) is slightly higher than what a true annual calculation would give ($1,219.75 = ($24,000 − $3,500) × 5.95%). The ~$52 over-contribution is reconciled and refunded on Maham's T1 — this is normal and how CRA expects per-pay deductions to work.

---

## 2026 Official CRA reference values (verified May 2026)

| Item | 2026 value | 2025 value | Notes |
|---|---:|---:|---|
| Federal lowest tax rate | **14.0%** | 15.0% | Reduced for 2026 |
| Federal BPA (full) | **$16,452** | $16,129 | Phases down to $14,829 at $258,482+ income |
| Federal bracket 2 threshold | $58,523 | $57,375 | Indexed +2.0% |
| Ontario lowest rate | 5.05% | 5.05% | Unchanged |
| Ontario BPA | **$12,989** | $12,747 | Indexed 1.9% |
| Ontario bracket 2 threshold | $53,891 | $52,886 | Indexed 1.9% |
| Ontario surtax 20% threshold | $5,710 (Ont. tax) | — | Not relevant at $24K income |
| OHP — $20K to $25K | 6% × (TI − $20K), max $300 | same | Premium = $227.18 at $23,786 TI |
| CPP rate (employee) | 5.95% | 5.95% | 4.95% base + 1.0% enhanced |
| CPP rate (employer) | 5.95% | 5.95% | Match |
| CPP YBE (annual exemption) | $3,500 | $3,500 | Unchanged. Monthly = $291.67 |
| CPP YMPE | $74,600 | $71,300 | Not binding at $24K |
| CPP YAMPE (CPP2 ceiling) | $85,000 | — | Not binding |

Sources: CRA announcements; cross-verified via TaxTips.ca, PaycheckGuru, WealthNorth, EY 2026 tables.

---

## Step-by-step worked calculation

```
Gross annual salary               = $24,000.00
Annual employee CPP contribution
  = ($2,666.67 - $291.67) × 5.95% × 9 months
  = $141.31/mo × 9
  = $1,271.79

  Enhanced portion (1/5.95)       = $213.75   (income deduction)
  Base portion (4.95/5.95)        = $1,058.04 (non-refundable credit at lowest rate)

Federal taxable income            = $24,000 - $213.75 = $23,786.25
Federal tax @ 14%                 = $3,330.08
  Less BPA credit (14% × $16,452) = -$2,303.28
  Less CPP base credit (14% × $1,058.04) = -$148.13
Federal income tax (annual)       = $878.67

Ontario taxable income            = $23,786.25
Ontario tax @ 5.05%               = $1,201.21
  Less Ontario BPA (5.05% × $12,989) = -$655.95
  Less Ontario CPP base credit (5.05% × $1,058.04) = -$53.43
Ontario base income tax (annual)  = $491.83
  + Ontario Health Premium = 6% × ($23,786.25 - $20,000) = $227.18
Ontario tax incl. OHP             = $719.01

TOTAL ANNUAL TAX                  = $878.67 + $719.01 = $1,597.68
PER MONTH TAX (true-up, /9)       = $177.52
```

---

## Output artifacts (live)

| File | Location | Description |
|---|---|---|
| `CPP.pdf` | `Taxes/2026/Corporate/payroll/CPP.pdf` | Original 12-month plan ($2,000/mo). Kept for reference. |
| `CPP_24K_Apr-Dec.pdf` | `Taxes/2026/Corporate/payroll/CPP_24K_Apr-Dec.pdf` | **The active plan** — 9 months April–December at $2,666.67/mo, with rigorous 2026 CRA values, e-transfer schedule, and CRA quarterly remittance schedule. |
| `build_cpp_pdf.py` | `_claude_workspace/2026/Corporate/payroll/scripts/` | Generates both PDFs. Run with `python3 build_cpp_pdf.py`. |
| `calc_2026.py` | `_claude_workspace/2026/Corporate/payroll/scripts/` | Standalone calculator that prints per-month + annual figures for both 8-month and 9-month scenarios. |

---

## Pay frequency rules (decision: monthly e-transfers, quarterly CRA)

### Why e-transfers must be monthly (not quarterly)
Ontario ESA s.11 requires the employer to set a recurring pay period and pay day. Maximum allowable gap:
- **≤ 16 days** for non-managerial employees (semi-monthly minimum).
- **≤ 1 month** for managerial employees.

**Quarterly pay is not ESA-compliant** for any class of employee. Lump-summing wages every 3 months would also undermine the deduction in a CRA review (wages must be actually paid in the period claimed). Maham can be treated as **managerial** (spouse of sole director, 2-person corp), which permits monthly pay; otherwise semi-monthly would be safer.

### Why CRA remittance can be quarterly
This corp qualifies as a **small employer quarterly remitter**: AMWA threshold is $3,000/month, and this corp's monthly remittance is only $460.14. New small employers with monthly remittance < $1,000 are auto-defaulted to quarterly. Quarterly due dates: Apr 15 / Jul 15 / Oct 15 / Jan 15.

### Recommended cadence

| What | Frequency | When |
|---|---|---|
| E-transfer of net pay $2,347.84 to Maham | **Monthly** | Last business day of each month, Apr–Dec |
| CRA PD7A remittance $1,380.42 | **Quarterly** | Jul 15, 2026 / Oct 15, 2026 / Jan 15, 2027 |

Practical operations note: of each month's $2,807.98 total payroll cost ($2,666.67 gross + $141.31 employer CPP), **$460.14 is "CRA money"** that should accumulate in the business chequing until the next quarterly due date.

---

## Open / future items

- [ ] Confirm with new accountant whether to keep true-up withholding or switch to PDOC-annualized default. If switching, regenerate with `tax = $269.07/mo` (conservative; ≈$2,422/yr withheld, refunded at year-end).
- [ ] T4 slip will need to be issued to Maham for 2026 by Feb 28, 2027.
- [ ] Maintain payroll register / paystubs each month (the per-month e-transfer record + this PDF cover that documentation).
- [ ] Watch for 2026 final CRA T4032ON (Ontario Payroll Deductions Tables) release — currently relying on indexed estimates for some Ontario BPA/bracket figures.
- [ ] If Maham is added EI-exempt in payroll software, verify that's reflected in the BN account (RP 0001) configuration.
