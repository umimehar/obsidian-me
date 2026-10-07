# Claude Workspace — 15248132 Canada Inc. (XYZ Bytes)

Last updated: **September 23, 2026**

Everything Claude has parsed, calculated or written for this corporation's tax
and finance work, organized by year. Load from here at the start of a session
instead of re-parsing PDFs or re-deriving figures.

> **Folder was renamed.** `~/Documents/2025 taxes` is now
> **`~/Documents/Taxes`**. Any path in an older document that starts with
> `2025 taxes/` should be read as `Taxes/`. `Taxes/CLAUDE.md` still uses the old
> paths and is otherwise stale — see Open Items.

---

## Start here

| If you're doing... | Read |
|---|---|
| Anything with the transaction workbook | `2026/Corporate/WORKBOOK_GUIDE.md` |
| Checking where the business stands right now | `2026/Corporate/2026_YTD_STATUS.md` |
| Filing the 2025-26 HST return | `2026/Corporate/HST_RETURN_2025-26.md`, package in `Taxes/2026/Corporate/HST Filing 2025-26 - for Saira/` |
| A CRA question about the 2025 return | `2025/Corporate/T2_2025_FILED_AUDIT_PROTECTION.md` |
| Anything about 2026 instalments | `2026/Corporate/CORP_TAX_INSTALMENTS_2026.md` |
| Parsing statements or verifying the workbook | `2026/Corporate/scripts/README.md` |
| Just wanting to see where things stand | `2026/Corporate/reports/2026_Dashboard.html` |
| Credit card spend, ITCs, classification | `2026/Corporate/CREDIT_CARD_2026.md` |
| Querying any transaction, any year | `2026/Corporate/TRANSACTION_LEDGER.md` |
| Personal-card claims for the accountant | `2026/Corporate/DIRECTOR_FUNDED_EXPENSES.md` |

---

## Folder structure

```
_claude_workspace/
├── INDEX.md                              ← this file
├── 2025/Corporate/
│   ├── T2_2025_FILED_AUDIT_PROTECTION.md      audit defense — read first on CRA contact
│   ├── T2_2025_EXPENSE_TRACEABILITY_MAP.md    every S125 line traced to source
│   ├── ACCOUNTANT_REVIEW_2026-05-14.md        round 1 draft review
│   ├── Email_to_Accountant_2026-05-14.md
│   ├── Email_to_Accountant_Round2_2026-05-15.md
│   ├── parsed_data/                            8 CSVs
│   ├── scripts/                                2 extraction scripts
│   └── reports/                                reconciliation workbook + PDF + dashboard
└── 2026/Corporate/
    ├── 2026_YTD_STATUS.md                     current position, all figures
    ├── HST_RETURN_2025-26.md                  line-by-line return, Aug 15 2025 – Aug 14 2026
    ├── CREDIT_CARD_2026.md                    card spend, classification, ITCs
    ├── TRANSACTION_LEDGER.md                  the master ledger — schema and queries
    ├── DIRECTOR_FUNDED_EXPENSES.md            personal-card claims, for the accountant
    ├── CORP_TAX_INSTALMENTS_2026.md           why instalments are below CRA's schedule
    ├── WORKBOOK_GUIDE.md                      how Business Transactions.xlsx works
    ├── Business Transactions — verified 2026-09-23.xlsx   known-good workbook snapshot
    ├── parsed_data/
    │   ├── debit_2026_H1_parsed.csv            62 bank lines, Jan–Jun 2026
    │   ├── debit_2026_JulAug_parsed.csv        22 bank lines, Jul–Aug 2026
    │   ├── cc_2026_categorised.csv             224 card lines, 8 statements to Aug 28
    │   ├── recurring_expenses.json             director-funded config — edit here
    │   ├── personal_recurring.csv              49 expanded recurring rows
    │   ├── transactions_master.csv             821 rows, every source, one schema
    │   └── transactions_master.xlsx            same, filterable in Excel
    ├── reports/
    │   ├── 2026_Dashboard.html                 interactive dashboard (also a saved artifact)
    │   ├── Debit_Reconciliation_2026_H1.md     statement-vs-workbook, Jan–Jun
    │   └── Debit_Reconciliation_2026_JulAug.md statement-vs-workbook, Jul–Aug
    ├── scripts/                                8 scripts + README
    └── payroll/
        ├── PAYROLL_CONTEXT.md                 full worked 2026 payroll calculation
        ├── CRA_Remittance_Schedule_Set_Up.md  9 remittance dates
        └── scripts/{calc_2026.py, build_cpp_pdf.py, README.md}
```

---

## The live workbook

**`Taxes/Business Transactions.xlsx`** — master tab `T 23-26` plus 36 monthly
tabs, Sep 2023 to present. This is the single source of truth for the debit
account.

It has three structural traps that have each caused a real error: a manual
balance chain, hand-written subtotal ranges that drift, and `MINUS()` formulas
that break headless recalculation. **Read `2026/Corporate/WORKBOOK_GUIDE.md`
before editing it**, and run `2026/Corporate/scripts/verify_workbook.py`
afterwards.

A known-good copy — all seven integrity checks passing, reconciled against
statements through Aug 31 — is kept at
`2026/Corporate/Business Transactions — verified 2026-09-23.xlsx`. If an edit
breaks the balance chain and the cause isn't obvious, diff against that rather
than unpicking it by hand. Replace the snapshot only after `verify_workbook.py`
passes on the new version.

Lifetime position as of Aug 31, 2026:

| | |
|---|---:|
| Gross revenue | $809,733.59 |
| HST collected | $92,050.14 |
| Net revenue | $717,683.45 |
| Total payouts | $646,672.38 |

Gross and net include two CRA refunds ($4,960.50 Oct 10 2025, $4,644.90 May 28
2026) that are not revenue.

---

## 2026 — active

Bank balance Aug 31: **$163,061.21**. Revenue is a single client (MIR Services),
$151,872.00 gross across 17 payments through Aug 31.

**Verified:** Jan 1 – Aug 31, 2026 reconciled line-by-line against eight BMO
chequing statements; every closing balance ties to the penny. Card verified to
Aug 28 across eight statements. Reports in `2026/Corporate/reports/`.

**Dashboard:** `2026/Corporate/reports/2026_Dashboard.html` — self-contained,
no network needed. Rolled forward to Aug 31 on Sep 23. The Cowork artifact
`xyz-bytes-2026-dashboard` was not updated and still shows Aug 3 figures.

**Vehicle:** 2026 Mercedes-Benz GLC 43 leased by the corporation Sep 30, 2025.
Lease terms and documents are in `~/obsidian/obsidian-me/personal/business-vehicle/`
(`data/vehicle.json`). The s.67.3 cap limits the income tax deduction to
**44.93%** of the lease (38,000 ÷ 0.85 × $99,500 list). `LEASE_CAP` in the card
parser and the ledger builder carries it. For HST, Mercedes costs are claimed at **80% business use** (Umar, Oct 7, 2026) and the lease also at the cap: 80% × 44.93% = 35.94% (`VEHICLE_USE`, `LEASE_ITC` in the ledger builder). No mileage log; 2025 logs on Umar's own car averaged about 700 business km a month.

**Receipts (Sep 23):** 2026 card receipts OCR-matched, renamed and filed by statement month in `Taxes/2026/Corporate/Credit Card/receipts/`, losslessly compressed (334 → 267 MB). 293 of 328 card purchases Aug 15, 2025 – Aug 28, 2026 have a receipt. Workflow: `2026/Corporate/scripts/README.md` §5.

**Director-funded expenses tracked:** home insurance $32.83/mo (100%), phone
and internet $115/mo (100%), rent $2,600/mo at 30% — $11,133.96 claimed for 2026,
$158.76 of ITCs. These accrue as a reimbursement owed to Umar at $927.83/month.
See `2026/Corporate/DIRECTOR_FUNDED_EXPENSES.md`.

### HST — period Aug 15, 2025 to Aug 14, 2026 (closed, not yet filed)
Line 101 $207,480.00 · line 103 $26,972.40 · line 106 $3,377.06 · line 109
$23,595.34 · instalments $26,000.00 → **refund of $2,404.66** (Mercedes at 80% business use, lease also capped; revised Oct 7 after the package went to Saira). Saira files. Due
Nov 14, 2026 (Saturday, so Nov 16). Worksheet: `2026/Corporate/HST_RETURN_2025-26.md`.

### Corporate tax
$6,900 paid, $10,500 planned by Dec 31. Projected tax $14,665, so **about $4,165
short** with only the tracked director-funded items. Break-even $45,273. See
`2026/Corporate/2026_YTD_STATUS.md` for what moved.

### Payroll (Maham Amir)
$24,000 gross over Apr–Dec 2026. Net $2,347.84/mo, CRA remittance $460.14/mo.
Five months of salary and four remittances paid; next remittance **Sep 11**.
2026 rates used: federal 14%, federal BPA $16,452, Ontario BPA $12,989,
CPP 5.95% over a $3,500 exemption, EI exempt.

---

## 2025 — T2 FILED AND ASSESSED

Filed **May 18, 2026** by Ejaz Pirwani, Fintax Associate Inc. (EFiler #V3102).
Assessed same day. Refund **$4,592** — received May 28, 2026 as $4,644.90
(refund plus interest), visible in the bank as `CANADA RIT/RIF`.

| Item | Amount |
|---|---:|
| Revenue net of HST | $261,877.93 |
| Sub-contractors (Zeeshan) | $63,917.69 |
| Total operating expenses | $84,974.50 |
| Net income before tax | $112,985.74 |
| Taxable income after 50% meals add-back | $115,955.56 |
| Tax at 12.2% SBD | $14,146.58 |
| Instalments paid | $17,960.00 |
| Closing retained earnings | $156,216.16 |
| Cash Dec 31, 2025 | $154,616.20 |

Key policy decisions: rent at **30%** home office (not 40% — the earlier
Director Resolution needs amending), capital items expensed, Pool Lab
reclassified to Meals & entertainment, TCX to Travel. The Lazer T4A discrepancy
is closed — Lazer revoked the T4A.

**Master ledger:** `2026/Corporate/parsed_data/transactions_master.csv` (and
`.xlsx`) holds all 781 transactions from three sources — chequing, corporate Mastercard
and director-funded personal card — spanning 2023–2026, with tax year,
GST period, deductibility and ITC precomputed on every row. Start there for any
"how much did we spend on X" question rather than re-deriving from statements.

### 2025/Corporate/parsed_data

| File | What it holds |
|---|---|
| `cc_v2_parsed.csv` | CC Expenses 2025 v2 — CRA-ready, primary |
| `cc_v1_parsed.csv` | CC Expenses 2025 v1 — original |
| `cc_2025_categorised.csv` | **12 CC statements re-parsed Aug 2026, classified — use this one** |
| `cc_statements_parsed.csv` | 12 CC statements, original parse — merchant names truncated on wrapped lines, do not classify from it |
| `cc_reconciliation.csv` | CC v2 matched against statements |
| `personal_cc_parsed.csv` | Business expenses paid on personal Amex |
| `debit_txns_parsed.csv` | 2025 debit transactions from Excel |
| `debit_statements_parsed.csv` | 12 debit statements parsed |
| `invoices_catalog.csv` | All 240 invoice/receipt files indexed |

2025 reconciliation outcome: CC receipts 100% on file; 180/233 CC lines matched
directly to statements with all 53 exceptions explained; zero discrepancies.

---

## Prior filings

### Correspondence on file
`2025/Corporate/accountant files/accountant emails.pdf` — the full May 15–17, 2026 thread with Ejaz (4 messages). Draft sent 15 May → Umar's three clarification questions same day → Ejaz's answers 16 May → "go ahead and submit" 17 May → filed 18 May. The three Q&As are transcribed verbatim in `_claude_workspace/2025/Corporate/T2_2025_FILED_AUDIT_PROTECTION.md` §3.

**The thread contains no change to the balance sheet.** Checked Aug 3, 2026 specifically for a post-draft adjustment to the director account — there is none. Schedule 100 line 2780 stands at $13,357 in both the review draft (form 2025.3.5) and the filed client copy (form 2025.4.7).

Also from the thread: Ejaz asks that the same Schedule 125 income-statement format be maintained for 2026.

**T2 2024** — filed. Net revenue $238,877, net income before tax $128,052, tax
payable $15,848, dividends $72,550, **closing retained earnings $57,377** (this
is the correct 2025 opening figure, not $129,924).

**T2 2023** — 140-day partial year. Revenue $72,923, net income $35,716, tax
$4,379, RE closing $22,102.

**HST, period Aug 15 2024 – Aug 14 2025** — filed Sep 24, 2025, confirmation
**#837076**, business # 795920958 RT0001. Sales $300,168.74, HST collected
$39,021.93, ITCs $3,900.43, net owing $35,121.50. Do not recalculate or re-file.

---

## Business reference

| Field | Detail |
|---|---|
| Legal name | 15248132 Canada Inc. |
| Operating name | XYZ Bytes |
| Business number | 795920958 RC0001 · HST RT0001 |
| Incorporated | August 14, 2023 |
| Type | CCPC, Ontario, 13% HST |
| Corporate tax year | Jan 1 – Dec 31 |
| HST period | Annual, Aug 15 – Aug 14 |
| Debit account | BMO Business ****1004, transit 0494 |
| Credit card | BMO Ascend World Elite Mastercard — 5840 primary, 2898 supplementary |
| Director | Umar Farooq Aslam, 100% owner |
| Employee | Maham Amir — payroll from Apr 2026 |
| Subcontractor | Zeeshan — offshore, paid via WISE, no T4A/NR4 required |
| Current client | MIR Services — biweekly |
| Former client | Lazer Technologies — ended May 2025 |
| Accountant | Saira (CPACM), from Sep 2026 — filed HST 2024-25, filing HST 2025-26. Ejaz Pirwani (Fintax) filed T2 2025; engagement ended Sep 2026 |

### Standing rules
1. HST for 2024-25 is filed — never recalculate or re-file it.
2. No dividends in 2025 — the $28,000 Jan–Apr was reclassified as director
   expense reimbursement. As finally filed there is **no shareholder loan**;
   Schedule 100 line 2780 shows $13,357 owed by the corporation to the director.
3. No T5 for 2025, no T4A for Zeeshan.
4. T2 2024 and T2 2025 are both filed. Don't propose changes.
5. Wealthsimple transfers are asset moves, not expenses.
6. CRA refunds (`CANADA RIT/RIF`) are not revenue.

### Bank merchant strings

| Statement string | Books as |
|---|---|
| `MIRSERVICESPAY/PAY` | MIR pay — revenue, HST at 13/113 |
| `CERTASDIRECTINS/ASS` | Car insurance, $700.84/mo |
| `MBFINANCIALCA` | Car lease, $1,750.01/mo |
| `WSINVESTMENTSINV/PLA` | Wealthsimple — investment, not expense |
| `CANADATXD/DIM` | GST prepayment ($6,500/qtr) or corp tax instalment |
| `CANACTBUS/ENT` | Payroll remittance, $460.14 |
| `CANADARIT/RIF` | CRA income tax refund |
| `TF...5840` | Credit card payment |

---

## Open items

| Priority | Item | Status |
|---|---|---|
| HIGH | Saira files the 2025-26 HST return by Nov 16, 2026 — $2,404.66 refund (Umar told Saira about 80% + cap Oct 7; she updates her copy, revised workpaper not sent); package rebuilt Sep 23 (355 files, 263 MB, audited clean); still missing: 2 paper fuel receipts + Valet May 1, listed in `HST_RETURN_2025-26.md` | OPEN |
| HIGH | Give Saira Represent a Client access to RT0001 | OPEN |
| HIGH | Corp tax projects ~$4,165 short (lease cap + refund double count found Sep 23) — record director-funded expenses or top up instalments by December; break-even $45,273 | OPEN |
| HIGH | Mercedes mileage log — 95% business use is stated, no log exists | OPEN |
| CLOSED | Hospital charges on the corporate card | Credit Valley $1,221.00 (Jul 27, 2026) personal, charged by mistake; category `Personal — owed by Umar`, reduces the amount owed to him. Halton Health Care parking $78.25 (2025) business (Umar, Sep 23) |
| MED | 2025 T2 deducted the Mercedes lease without the s.67.3 cap — about $9,600 over, ~$1,170 tax. Raise with Saira | OPEN |
| CLOSED | Load 2026 CC statements | Done Sep 23, 2026 — 8 statements to Aug 28, 224 lines |
| CLOSED | Verify July and August bank | Done Sep 23, 2026 — both statements tie to the penny |
| CLOSED | Card lines misfiled as meals (Mercedes, Apple Store, hospitals, Paddle) | Reclassified Sep 23, 2026 via named rules and two date overrides |
| HIGH | Back the $4,644.90 CRA refund out of 2026 revenue for the T2 income statement | OPEN |
| MED | Sign and file Director Resolution in the minute book — amend to 30% rent first | PENDING |
| MED | Recheck 2026 instalments in November against actual income | SCHEDULED |
| INFO | Director account owed to Umar: **$19,999.64** today, $24,490.96 at 31 Dec. Drawable tax-free — reduces cash, not income | AVAILABLE |
| LOW | `Taxes/CLAUDE.md` is stale — says 40% rent, uses old `2025 taxes/` paths | OPEN |
| LOW | Workbook estimates corp tax at 12.3%; filed rate is 12.2% | OPEN |
| CLOSED | Oct 31 2025 duplicate $1,396 corp tax entry | Resolved Aug 3, 2026 — second entry was mis-dated, correct date Dec 30, 2025 |
| CLOSED | Lazer T4A $5,075 gap | Lazer revoked the T4A |
| CLOSED | Shareholder loan $3,856.75 repayable by Dec 31 2026 | Never existed as filed. Ejaz restructured it; Schedule 100 line 2780 shows $13,357 **due to** the director. No s.15(2) exposure. Confirmed by Umar Aug 3, 2026 |
