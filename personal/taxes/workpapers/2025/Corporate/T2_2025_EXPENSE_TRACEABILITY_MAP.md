# T2 2025 — Expense Traceability Map (Filed Lines → Source Records)

**Purpose:** If CRA queries any specific line on the filed T2, this map points to the underlying source records.

## How to read this

For each S125 line, the table shows:
1. **What's in it** (which source items contributed)
2. **Source file/ledger** (where to find the receipts)
3. **CRA defense angle** (the technical position if challenged)

---

## Operating expenses — line by line

### Salaries & wages (9060) — $17,838

| Component | Amount | Source |
|---|---:|---|
| Maham salary — Dec 5, 2025 (e-transfer) | $6,000 | `business-debit-transactions.xlsx` row 234 |
| Maham salary — Dec 24, 2025 (e-transfer) | $10,000 | `business-debit-transactions.xlsx` row 233 |
| Employer CPP + EI remitted to CRA Dec 30 | $1,837.50 | `business-debit-transactions.xlsx` row 237 |
| **Total** | **$17,837.50** ≈ $17,838 | |

**T4 filed for Maham Feb 28, 2026.** Payroll records maintained.

### Sub-contracts (9110) — $64,272

| Component | Amount | Source |
|---|---:|---|
| Zeeshan payouts via WISE (5 separate payments Feb–Aug) | $56,910 | `business-debit-transactions.xlsx` (various rows) |
| WISE Freelancer payment Nov 26 | $7,007.69 | Debit ledger |
| WISE platform / transfer fees (debited separately) | $354.56 | Debit ledger — included by accountant in this line |
| **Total** | **$64,272.25** ≈ $64,272 | |

**Defense:** Zeeshan offshore, services performed entirely outside Canada — no T4A or NR4 required. Contractor agreement and WISE records on file. ITA s.115, ITR 105.

### Vehicle expenses (9281) — $24,315

**Estimated build-up (accountant total $24,315 vs our reconciled $25,580, off by ~$1,265 = CC fuel):**

| Component | Amount | Source |
|---|---:|---|
| Mercedes lease — down payment + 1st install on CC (Sep 27 & 30) | $6,750.01 | `cc_v2_parsed.csv` rows 135, 137 |
| Mercedes lease — Nov/Dec/Jan-pre instalments via debit | $5,250.03 | Debit ledger rows 217, 226, 236 |
| Winter tires (Oct 4, on CC) | $2,817.77 | `cc_v2_parsed.csv` row 143 |
| Mercedes service Nov 8 | $316.28 | `cc_v2_parsed.csv` row 171 |
| Car insurance Oct–Dec (3 × $700.84) | $2,102.44 | Debit ledger rows 214, 221, 227 |
| Accessories (dashcam $260, 2 AMZN items) | $315.37 | `cc_v2_parsed.csv` |
| Car wash (4 charges Oct–Dec) | $216.92 | `cc_v2_parsed.csv` |
| Parking (3 entries Oct–Nov) | $78.25 | `cc_v2_parsed.csv` |
| Personal CC vehicle items (mileage, Lexus services, etc.) | $6,468.17 | `personal_cc_parsed.csv` |
| **Subtotal (estimate)** | **~$24,315** | |
| (CC fuel $1,264 — likely in Other expenses 9270) | | |

**Defense:**
- 100% business use claimed; mileage logs on file Jan–Sep (via Personal-CC receipts)
- Mercedes lease cap (ITA s.67.3): cap is ~$1,050+HST/mo for 2025. Actual lease ~$1,750/mo. If CRA invokes cap: deductible portion reduces by ~$700/mo × 3 months recognized = ~$2,100 add-back risk.

### Computer-related expenses (9150) — $14,157

**Build-up:**

| Component | Amount | Source |
|---|---:|---|
| Apple Mac Studio Jun 15 | $5,931.37 | `cc_v2_parsed.csv` row 72 |
| Apple Store #R350 Dec 7 | $2,404.64 | `cc_v2_parsed.csv` row 198 |
| AMZN monitor Jun 14 | $725.60 | `cc_v2_parsed.csv` row 71 |
| IKEA furniture Jun 14 | $1,476.90 | `cc_v2_parsed.csv` row 67 |
| IKEA furniture Sep 26 | $609.02 | `cc_v2_parsed.csv` row 134 |
| Flexispot standing desk Jul 15 | $1,141.27 | `cc_v2_parsed.csv` row 93 |
| AMZN Mova vacuum Nov 29 | $1,693.87 | `cc_v2_parsed.csv` row 185 |
| **Subtotal** | **$13,982.67** | |
| Difference to filed $14,157 | ~$174 | minor items |

**Defense:**
- Per user direction, expensed in 2025 (not capitalized) — accept timing-only audit risk
- If CRA disallows and forces capitalization: would reclass to Class 50 (computers, 55%) and Class 8 (furniture, 20%) on Schedule 8. Net effect: timing, not permanent.

### Rental (8910) — $9,335

| Component | Amount | Source |
|---|---:|---|
| Home office rent at 30% × $31,116 annual rent | $9,334.80 | `personal_cc_parsed.csv` (12 monthly rent entries × 40% wait... 30%) |

**Defense:**
- Lease agreement on file showing $2,593/mo rent ($31,116 annual)
- 30% allocation = ~$777.90/mo
- Aggressive vs CRA's typical 15–25% — need photos and sq ft measurement to defend if queried

### Meals & entertainment (8523) — $5,939

| Component | Amount | Source |
|---|---:|---|
| 139 CC meals (139 transactions) | $5,625.07 | `cc_v2_parsed.csv` |
| Pool Lab Canada Inc Dec 21 (office holiday gathering) | $28.25 | `cc_v2_parsed.csv` row 215 |
| Personal CC food items (12 entries) | $286.32 | `personal_cc_parsed.csv` |
| **Total** | **$5,939.64** ≈ $5,939 | |
| 50% add-back on Schedule 1 line 121 | $2,970 | (= $5,939 × 50%) |

**Defense:** Receipts on file. Business purpose noted in CC ledger. 50% add-back applied correctly.

### Travel expenses (9200) — $2,880

| Component | Amount | Source |
|---|---:|---|
| TCX 1000 GBP currency exchange (UK trip) | $1,884.50 | Debit ledger |
| Marriott hotel (Personal CC) | $980.04 | `personal_cc_parsed.csv` |
| Parking (Personal CC) | $15.00 | `personal_cc_parsed.csv` |
| **Subtotal** | **$2,879.54** ≈ $2,880 | |
| CC travel $859 (Enterprise rental, Lyft, parking) — likely in Other expenses | | |

**Defense:** Currency exchange BMO record on file. Marriott receipt + business purpose to be documented.

### Accounting fees (8862) — $2,274

| Component | Amount | Source |
|---|---:|---|
| Saira (CMCPA) — financials prep to Aug 14, 2025 | $1,073.50 | Debit ledger |
| Ejaz Pirwani (Fintax) — T2 2025 prep fee (likely accrued) | $1,200.50 | Estimate — confirm invoice |
| **Total** | **$2,274.00** ≈ $2,274 | |

**Note:** The Ejaz Pirwani invoice of $1,575 was issued May 19, 2026 — this should technically be a 2026 expense unless it was accrued at Dec 31, 2025. Worth checking with accountant if any of it relates to a 2025 accrual.

### Insurance (8690) — $1,866

| Component | Amount | Source |
|---|---:|---|
| Aviva home/office + auto (6 months) | $1,758.24 | `personal_cc_parsed.csv` |
| TD home/auto | $9.06 | `personal_cc_parsed.csv` |
| Square One home/office | $98.49 | `personal_cc_parsed.csv` |
| **Total** | **$1,865.79** ≈ $1,866 | |

**Defense:** This is HOME-OFFICE insurance (not vehicle insurance — auto is in Vehicle expenses). Policies on file.

### Telephone & telecommunications (9225) — $1,789

| Component | Amount | Source |
|---|---:|---|
| Bell Mobile (12 months, 100% business) | $703.91 | `personal_cc_parsed.csv` |
| Rogers home internet (12 months, 100% business) | $813.48 | `personal_cc_parsed.csv` |
| Telus/Koodo SIMs | $271.20 | `personal_cc_parsed.csv` |
| **Total** | **$1,788.59** ≈ $1,789 | |

**Defense:** Bills retrievable from providers. 100% business use claimed per CLAUDE.md rules.

### Office expenses (8810) — $4,131

**Estimated components (residual after Computer-related items moved out):**
- CC office equipment minus capital items moved to Computer-related (~$2,400)
- Personal CC office items ($260)
- Possibly some of the Cr. Card Payment $1,655 absorbed here

**Defense:** All transactions on CC and Personal CC ledgers.

### Business taxes, licences & memberships (8760) — $752

| Component | Amount | Source |
|---|---:|---|
| Office software subscriptions (iCloud, Apple One, table-plus, etc.) | $730.78 | `cc_v2_parsed.csv` |
| xyzbytes.com domain (Personal CC) | $21.00 | `personal_cc_parsed.csv` |
| **Total** | **$751.78** ≈ $752 | |

**Note:** Accountant put software subscriptions here (rather than Office expenses or 9120). Tax impact zero.

### Amortization (8670) — $382

| Component | Amount | Source |
|---|---:|---|
| CCA Class 10 on prior-year UCC ($1,272 × 30%) | $382 | Schedule 8 |

### Bank charges (8715) — $12

| Component | Amount | Source |
|---|---:|---|
| Annual return filing fee | $12 | `personal_cc_parsed.csv` |

**Note:** Most bank charges (WISE fees $355, CC bank fees $149) are NOT here — WISE is in Sub-contracts, CC fees likely in Other.

### Other expenses (9270) — $5,332 ⚠ PLUG FIGURE

Per accountant: *"balancing number from all expenses when placed correctly to match with all payments through bank or both credit cards."*

**Likely contents:**
- CC fuel $1,264 (gas station charges)
- CC travel $859 (Enterprise, Lyft, parking)
- CC bank/card fees $149
- Cashback rewards offset (~$84)
- Returns/refund residual (~$302)
- Some portion of the prior-draft "Cr. Card Payment $1,655" residual
- Sum: ~$3,143 — leaving ~$2,189 of further unaccounted items

**Defense:**
- All underlying transactions are documented in source ledgers
- This is a categorization-completeness plug, not undocumented expense
- If CRA asks for the breakdown, accountant can produce his working paper

---

## Cross-references

| Filed line | Our pre-filing analysis | See section |
|---|---|---|
| Schedule 100 line 1066 (Taxes receivable $11,207) | Reconciled to $4,898 corp tax + $6,309 GST | Audit Protection doc §3 |
| Schedule 100 line 2780 (Due to shareholder $13,357) | Means corp owes Umar — no s.15(2) issue | Audit Protection doc §5 |
| Schedule 1 line 121 (Meal add-back $2,970) | = $5,939 × 50% | Same as filed |
| Schedule 1 line 103 (CCA $382) | Class 10 on $1,272 UCC | Schedule 8 |
| Schedule 8 (CCA) | Only $1,272 UCC; no 2025 additions | Per user direction (capital items expensed) |
| Schedule 50 (Shareholder) | UMAR FAROOQ ASLAM 100% common | Sole director/shareholder |
