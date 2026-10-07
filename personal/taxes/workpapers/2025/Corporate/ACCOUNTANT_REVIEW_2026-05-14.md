# 2025 Corporate Tax — Accountant Draft Review & Session Notes

**Date:** May 14, 2026
**Subject:** Review of accountant's draft FS (`3. Draft FS Yr 2025 - 15248132 Canada Inc.- Umar Aslam Farooq.docx`)
**Status:** Email queued to send; awaiting accountant response

---

## 1. Final reconciled figures (Claude's calc)

| Item | Amount |
|---|---:|
| Revenue (net of HST) | $261,877.93 |
| Sub-contractors (Zeeshan) | $63,917.69 |
| Gross Profit | $197,960.24 |
| Total Operating Expenses | $84,974.50 |
| Net Income Before Tax (Book) | $112,985.74 |
| 50% meals add-back (ITA s.67.1) | $2,969.82 |
| Estimated Taxable Income | $115,955.56 |
| Estimated tax (12.2% combined SBD) | $14,146.58 |
| Net Income After Tax | $98,839.16 |
| Opening Retained Earnings (Jan 1, 2025) | $57,377.00 |
| Closing Retained Earnings (Dec 31, 2025) | $156,216.16 |
| 2025 corp tax instalments paid | $17,960.00 |
| **Expected refund from CRA** | **~$3,813.42** |
| Cash balance Dec 31, 2025 (per BMO stmt) | $154,616.20 |

## 2. Source tie-outs

| Source | Total | Tie |
|---|---:|---|
| Business CC (BMO Mastercard, 233 txns) | $35,440.32 | ✓ cc_v2_parsed.csv |
| Business Debit (operating only) | $92,420.22 | ✓ debit ledger |
| Personal CC corp share (rent 30%) | $21,031.65 | ✓ Director Reso amended |
| **Total expenses** | **$148,892.19** | ✓ |

## 3. Key policy decisions made this session

| Decision | Rationale |
|---|---|
| **Rent at 30%** (was 40%) | More defensible vs CRA. CRA typically accepts 15–25%; 30% is at upper edge but defensible. |
| **Director Reso to be amended** to $21,031.65 reimbursement + $6,968.35 shareholder loan (was $24,143.25 / $3,856.75 at 40%) | Cash paid Jan–Apr unchanged at $28,000; just reclassification |
| **Pool Lab Canada Inc Dec 21 $28.25** → Meals & entertainment (50% deductible) | Was Repairs & maintenance; per user direction this is an office holiday gathering |
| **TCX 1000 GBP $1,884.50** → Travel (UK trip) | Was Bank charges & FX; per user direction this is a UK business travel cost |
| **Capital additions $13,983 fully expensed in 2025** | User's choice — accepts no future deduction stream. Items: Mac Studio $5,931, Apple Dec $2,405, AMZN monitor $726, IKEA $1,477 + $609, Flexispot $1,141, Mova vacuum $1,694 |
| **No dividends in 2025** | $28,000 Jan–Apr payments reclassified per Director Resolution; no T5 issued |
| **No T4A for Zeeshan** | Offshore subcontractor, services performed entirely outside Canada |

## 4. Issues identified in accountant's draft FS

(In the email to send below)

| # | Item | Accountant | Should be | Impact |
|---|---|---|---|---|
| 1 | "Vehicle - 2 Insurance $1,866" | Vehicle insurance | Home/office insurance (Aviva, TD, Square One) | Reclassification |
| 2 | "Cr. Card Payment $1,655" | Operating expense | Not an expense (CC payments fund CC balance) | Remove from opex |
| 3 | "Misce $5,344" | Unspecified | Need breakdown | Unknown — possibly remove |
| 4 | "Vehicle - 2 Fuel $6,468" | Vehicle fuel | Personal-CC mileage/Lexus/installments/wash | Reclassification |
| 5 | "Sub-contracts $355" | Subcontractor cost | WISE platform fees (Interest & bank charges) | Reclassification |
| 6 | "Business taxes & licences $752" | Business taxes | Office software subscriptions | Reclassification |
| 7 | CC travel ~$859 (Enterprise, Lyft, parking) | Missing | Should be in Travel | Add to Travel |
| 8 | Tax provision $15,989 (~15%) | General rate | SBD rate 12.2% (CCPC) | Tax savings ~$1,842 |
| 9 | Advance Corporate Tax $2,277 | No reconciliation | Need working paper | Confirm vs $17,960 instalments + $4,960 refund |
| 10 | Professional fees $2,274 | Lump sum | Confirm $1,200 is new accountant's fee | Verify |

## 5. Cash reconciliation note (resolved)

**Initial discrepancy:** Claude computed $160,636.79, accountant has $154,616.20 — gap $6,020.61.

**Root cause:** The debit ledger `business-debit-transactions.xlsx` has 6 January 2026 entries appended at the end (Jan 2, 9, 20, 23, 30). Claude's initial cumulative sum didn't filter by date.

**Resolution:** Bank statement Dec 31, 2025 = **$154,616.20** ✓. Accountant's figure is correct. Performa.xlsx updated to reflect this.

## 6. Items intentionally NOT raised with accountant

- **Capital additions $13,983** — user opted to keep as expensed (no CCA carry-forward). Accept the audit risk; jump in "Office Stationery" from $3,923 (2024) to $16,633 (2025) is a potential CRA screening flag but materially low.
- **Lazer T4A discrepancy ($5,075)** — Lazer revoked the T4A from CRA, so no longer an issue.

## 7. Draft email sent to accountant

```
Subject: Draft FS 2025 — a few items to clarify

Hi [Accountant name],

Thank you for sending over the draft financial statements. The headline
numbers tie nicely (revenue $261,878, sub-contractors $63,918, gross
profit $197,960, opening RE $57,377). I went through it carefully and
have a handful of items I'd appreciate your help understanding before
we finalize:

1. "Vehicle - 2 Insurance $1,866". I believe this is actually our
   home/office insurance (Aviva, TD, Square One) rather than vehicle
   insurance. Would you mind moving it to the general Insurance row?
   The auto insurance ($2,102) appears to be correctly captured in
   Vehicle Lease & other.

2. "Cr. Card Payment $1,655". I want to make sure I understand this
   line — credit-card payments fund the card balance, and the actual
   purchases are already captured in other lines. Could you confirm
   what's in this $1,655, or whether it should be removed?

3. "Misce $5,344". Would you be able to share the breakdown for this
   line? I'm having trouble tying it back to my source records
   (debit / CC / personal-CC ledgers).

4. A few classification points I'd love your view on:
   - "Vehicle - 2 Fuel $6,468" — these appear to be personal-CC
     mileage, Lexus services, car installments, and car wash, rather
     than fuel. Actual CC fuel was $1,264.
   - "Sub-contracts $355" — looks like WISE platform fees. Would
     Interest & bank charges be a better fit?
   - "Business taxes & licences $752" — these are office software
     subscriptions (iCloud, Apple One, domain). Should they sit under
     Office Stationery?
   - CC travel of ~$859 (Enterprise rental, Lyft, parking) doesn't
     seem to be in Travel — could you check?

5. SBD claim and tax rate. The provision $15,989 / NIBT $106,594 works
   out to ~15%. For a CCPC well under the $500K limit, the combined
   federal + Ontario SBD rate is ~12.2% (9% federal + 3.2% Ontario).
   Could you confirm we're claiming the Small Business Deduction? If
   so, the tax would come down by ~$1,842 and the refund would grow
   from ~$1,971 to ~$3,813.

6. Advance Corporate Tax $2,277. Would you mind sharing the working
   paper showing how this reconciles to $17,960 in instalments paid
   and the Oct 10 CRA refund of $4,960.50? I want to make sure my
   records line up with yours.

7. Professional fees $2,274. I have Saira's fee at $1,074 plus $12 of
   corporate filings. Is the additional ~$1,200 your fee for preparing
   these statements? Just want to confirm.

Thanks very much for your time — I appreciate it.

Best,
Umar
```

## 8. Comparison table — Claude vs Accountant

| Line | Claude | Accountant | Δ |
|---|---:|---:|---:|
| Total Revenue | $261,878 | $261,878 | $0 ✓ |
| Sub-contractors | $63,918 | $63,918 | $0 ✓ |
| Gross Profit | $197,960 | $197,960 | $0 ✓ |
| Total Operating Expenses | $84,975 | $91,366 | +$6,391 |
| NIBT | $112,986 | $106,594 | -$6,391 |
| Tax provision | $14,147 | $15,989 | +$1,842 |
| Effective tax rate | 12.2% | 15.0% | +2.8pp |
| Net Income After Tax | $98,839 | $90,605 | -$8,234 |
| Closing RE | $156,216 | $147,982 | -$8,234 |
| Cash (Dec 31, 2025) | $154,616* | $154,616 | $0 ✓ |
| **Refund expected** | **~$3,813** | **~$1,971** | **+$1,842** |

\* corrected — initial Claude calc was $160,637 due to including Jan 2026 entries from debit ledger

## 9. Outstanding items (post accountant response)

- [ ] Accountant to clarify "Misce $5,344" breakdown
- [ ] Accountant to confirm "Cr. Card Payment $1,655" — remove or explain
- [ ] Accountant to confirm SBD is being claimed (12.2% rate, not 15%)
- [ ] Accountant to share working paper for Advance Corp Tax $2,277
- [ ] Sign and file amended Director Resolution (at 30% rent: $21,031.65 reimb + $6,968.35 shareholder loan)
- [ ] Verify Oct 30 corp tax duplicate ($1,396 × 2 in ledger — bank statement only has one)
- [ ] File T4 for Maham (Feb 28, 2026 deadline) — confirm completed
- [ ] File T2 2025 by June 30, 2026 (balance was due March 31 — refund position so no penalty)
- [ ] Repay $6,968.35 shareholder loan by Dec 31, 2026 (ITA s.15(2))

## 10. Files in this session

| File | Purpose |
|---|---|
| `2025/Corporate/2025_Income_Statement.xlsx` | Claude's comprehensive income statement (7 tabs) |
| `2025/Corporate/2025_Corporate_Tax_Report.pdf` | Corrected tax report with errata |
| `2025/Corporate/performa.xlsx` | Filled accountant template (BS + IS + Bank Stmt) |
| `2025/Corporate/3. Draft FS Yr 2025 ...docx` | Accountant's original draft (under review) |
| `_claude_workspace/2025/Corporate/ACCOUNTANT_REVIEW_2026-05-14.md` | This file |
