# HST return — Aug 15, 2025 to Aug 14, 2026

15248132 Canada Inc. (XYZ Bytes) · 795920958 RT0001 · annual filer
Prepared Sep 23, 2026 from `parsed_data/transactions_master.csv`, `gst_period == '2025-26'`.
**Filing accountant: Saira** (she also filed 2024-25). The previous (temporary) accountant, who filed the 2025 T2, is no longer engaged.

**Return due Nov 14, 2026.** That is a Saturday, so Monday Nov 16 is on time. The period is a refund, so nothing to pay.

## The package for Saira

`Taxes/2026/Corporate/HST Filing 2025-26 - for Saira/`, 350 files, 263 MB, every file losslessly compressed (images pixel-identical, PDFs page-checked):

| Folder | Contents |
|---|---|
| `01 HST 2025-26 workpaper.xlsx` | Read me, Return, Sales, ITCs (406 purchase lines), Lease cap, Instalments, Questions. Formula-driven: change a Yes/No or an ITC % and the return updates |
| `02 Bank statements - BMO chequing` | 13 statements, Aug 29 2025 to Aug 31 2026 |
| `03 Card statements - BMO Mastercard` | 13 statements, Aug 28 2025 to Aug 28 2026 |
| `04 Receipts - Aug 15 to Dec 31 2025` | 106 receipts matched to 105 card lines (Receipt column on ITCs points to each) |
| `04b Receipts - 2026` | 198 receipts by statement month, Jan to Aug, incl. the Mercedes service paid on Umar's Visa |
| `05b Director-funded - Bell and Rogers` | Bell payment history, Rogers bill history (screenshots) |
| `05 Vehicle lease - Mercedes GLC 43` | lease agreement, pricing worksheet, signing receipts |
| `06 Prior HST return 2024-25` | NETFILE confirmation 837076 |
| `04c Invoices - chequing payments` | Saira's invoice 2041 (Feb 9, 2026) |
| `07 T2 2025 - as filed` | T2 client copy only (39 pages). Its CRA preparer box names the previous accountant; T-183 and assessment tracker left out |

Rebuilt by `scratchpad/build_saira_package.py` and `match_receipts.py` in the Sep 23 session; the builder refuses to overwrite an existing folder.

## The return

| Line | | Amount |
|---|---|---:|
| 101 | Sales, net of HST (26 MIR deposits) | 207,480.00 |
| 103 | HST collected | 26,972.40 |
| 106 | Input tax credits | 3,377.06 |
| 109 | Net tax | 23,595.34 |
| 110 | Instalments: Oct 20, Jan 20, Apr 20, Jul 20 at 6,500.00 | 26,000.00 |
| 114 | **Refund** | **2,404.66** |

Last year for comparison: sales 300,168.74, net tax 35,121.50. Lazer ended May 2025.

## Line 106 by category

| Category | Source | ITC |
|---|---|---:|
| Vehicle lease, 80% × s.235 cap = 35.94% | 10 debits + signing payment on card | 1,002.69 |
| Office & supplies | card (incl. Apple Store 2,404.64, Dec 7) | 636.16 |
| Vehicle & fuel, 80% (Sep 9, 2025 own-car fuel at 0) | card | 468.61 |
| Meals & entertainment, 50% | card, 199 lines incl. iFly Calgary (client entertainment, 18.40) | 386.83 |
| Vehicle maintenance | card (tires 2,817.77 Oct 4, service 316.28 Nov 8) + service 353.94 Apr 2 on Umar's Visa, 80% | 321.03 |
| Professional fees | debit (Saira 423.75; previous accountant 1,440.75, invoice kept by Umar, not shared) | 214.50 |
| Telecom | card 21.97 + Bell and Rogers actuals 170.55 | 192.52 |
| Travel & parking | card (incl. Halton Health Care parking 78.25) | 90.85 |
| Software & subscriptions | card (US vendors carry none) | 63.87 |
| **Total** | | **3,377.06** |

Rounding is half-up to the cent, the same as Excel's ROUND, so the ledger and the workpaper agree exactly. Until Sep 23 the scripts used Python's round-half-even, which put the ledger 0.53 lower.

### The lease

2026 Mercedes-Benz GLC 43, leased Sep 30, 2025 for 36 months at 1,548.68 + 201.33 HST. The 6,750.01 due at signing was a 4,424.78 down payment plus the first month plus 776.55 HST, paid on the card as 4,000.00 (Sep 27) and 2,750.01 (Sep 30). No security deposit.

HST paid on the lease in the period is 2,789.85 (776.55 at signing + 10 × 201.33). **Claimed at 80% business use × the 44.93% s.235 / s.67.3 ratio = 35.94%: ITC 1,002.69** (Umar, Oct 7, 2026; it was claimed in full in the package sent Sep 23). Fuel and maintenance from Sep 27, 2025 are at 80% too. Last year's return had no vehicle ITC (Umar's own car, paid by mileage), and at 80% + cap line 106 is 1.63% of sales against 1.30% last year. `VEHICLE_USE` and `LEASE_ITC` in `build_transaction_ledger.py` carry the choice; `Lease cap!B22` is the business-use cell in the workpaper, and it drives fuel and maintenance as well. With 109,929.95 as the list price the ratio would be 40.67%.

Source: `~/obsidian/obsidian-me/personal/business-vehicle/data/vehicle.json`, lease section.

## Excluded, and why

| Item | Amount | Reason |
|---|---:|---|
| Oct 10, 2025 CRA credit | 4,960.50 | Refund of overpaid 2024-25 HST. Saira's Aug 14, 2025 balance sheet shows 34,282.00 prepaid against 35,121.50 owed; the Sep 15, 2025 payment of 5,800.00 overpaid the 839.50 balance by exactly this amount |
| May 28, 2026 CRA credit | 4,644.90 | T2 2025 income tax refund plus interest |
| Sep 15, 2025 payment | 5,800.00 | Applied to 2024-25 (above). The ledger tags it 2025-26 by date only |
| Aug 21, 2026 MIR deposit | 8,542.80 | Received after Aug 14; next period by date received |
| Credit Valley hospital on the card | 1,221.00 | Jul 27, 2026 (1,200.00 + 21.00): personal, charged to the corporate card by mistake (Umar, Sep 23). No ITC; reduces the amount owed to Umar. Halton Health Care parking (78.25, 2025) is business and claimed |
| Vercel domains, Feb 4, 2026 (chequing) | 48.89 ITC | Receipt on file: Vercel Inc., California, US$302.50 for four domains, no GST/HST charged. Paid by the business debit Mastercard (card 1475), 424.94 CAD. Deductible, no ITC. Billed to a personal account name |
| Paddle / TablePlus, Sep 22, 2025 | — | Receipt shows RT9999, the simplified regime. Not claimable |
| Other US software (Anthropic, Z.AI, OpenAI) | — | Non-resident suppliers charge no HST |
| Insurance, residential rent | — | Exempt supplies |

## For Saira to decide

1. **By receipt or by invoice.** MIR pays two weeks in arrears. Her 2024-25 return counted deposits by date received, and this one does the same. The Aug 22, 2025 and Aug 21, 2026 boundary deposits are both 8,542.80, so switching to invoice date changes nothing.
2. **Lease list price.** 99,500.00 (car + factory options) or 109,929.95. Workpaper `Lease cap!B12`.
3. **s.173 on the vehicle benefit.** The corporation claims ITCs on a car the shareholder can use personally. Business use is claimed at 80% (Umar's estimate; he stated 95% on Aug 20, 2026) and no mileage log exists. The 2025 standby charge and operating benefit carry an s.173 remittance in the return that includes the last day of February 2026, which is this one. Line 104 is 0 until she sets it.
4. **iFly Calgary, Jul 11, 2026, 319.76.** Claimed as travel (ITC 36.79). Indoor skydiving: business entertainment or personal?
5. **Rogers credit.** Rogers ended Apr 2026; the May 22 bill is a 148.78 credit and the Jun 22 bill repeats it. Counted once.
6. **s.174 on mileage.** Umar was paid mileage on his own car from Aug 15 to Sep 30, 2025. Not claimed.
7. **Instalments for 2026-27.** Net tax this period is 23,595.34, over the 3,000 threshold. A quarter is 5,898.84; the 6,500 rhythm covers it.

## Documents still missing

After the Valet PDFs (Sep 23), the ITCs sheet flags three lines:

| Date | Merchant | Amount | ITC | Status |
|---|---|---:|---:|---|
| 2025-11-07 | Shell C20702 | 92.71 | 8.54 | paper receipt missing |
| 2026-05-01 | Valet Car Wash | 45.19 | 4.16 | no AutoBilling email that month |
| 2026-06-23 | Petro-Canada Etobicoke | 100.00 | 9.20 | paper receipt missing |

The previous accountant's invoice (1,440.75, ITC 165.75) is on file with Umar and deliberately not shared. Also without receipts: 14 purchases under $30 (ITC 12.15) and Claude Mar 27, 2026 (140.00, no ITC). Valet receipts carry no GST/HST registration number (5 × 5.20 HST, ITC 4.16 each at 80%).

Package audit Sep 23: 354 files, 263 MB; 319 of 406 ITC-sheet rows link to a file in the package, none broken; every PDF and image opens; line 106 equals the ITCs sheet total.

## The 2025 T2 director-account adjustment and HST

The previous accountant removed the draft shareholder loan by recognising $41,357 of director-funded expenses (so the corporation owes Umar $13,357, S100 line 2780), including a $5,332 "Other expenses" balancing figure (S125 line 9270). None of that changes this return:

- HST follows purchases and invoices, not how payments to Umar were labelled. The $5,332 balancing figure has no invoices, so no ITC.
- Director-funded items from Aug 15 on are already here (phone, internet) or carry no HST (rent, insurance, mileage, the $12 annual return).
- The Lexus service (1,247.34, Sep 20, 2025) and car-wash memberships were for Umar's own car, for which mileage was paid; claiming both would double count, so no ITC. (The 2025 T2 appears to have deducted both.)
- Possible upside: personal-card business items Jan to Aug 14, 2025 (Marriott 980.04, office bag, caps, parking, meals) may not have been in the 2024-25 return. About 148 of unclaimed ITCs could go on this return; question for Saira in the workpaper.

## Outside this return

The filed 2025 T2 (previous accountant) deducted the lease in full: 12,000.04 (traceability map, GIFI 9281). Under s.67.3 the deductible share for Sep 30 to Dec 31, 2025 is roughly 2,400, and the down payment should have been spread over the 36-month term. The over-deduction is about 9,600, or about 1,170 of tax. Whether to adjust is Umar's call with Saira.
