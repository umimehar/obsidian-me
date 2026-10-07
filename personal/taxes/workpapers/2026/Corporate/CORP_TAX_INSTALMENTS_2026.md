# 2026 Corporate Tax Instalments — basis and position

**Decision: paying on the current-year estimate method, deliberately.**
Recorded Aug 3, 2026.

## The two schedules

CRA gave a required schedule with the T2 2025 assessment, computed from 2025 tax
payable ($13,368):

| Date | Required |
|---|---:|
| May 31, 2026 | $4,011 (catch-up for Jan–May) |
| Jun 30 – Dec 31, 2026, monthly | $1,337 |
| **2026 total** | **$13,370** |

Actual payments through Aug 3, 2026, per bank statement:

| Date | Paid |
|---|---:|
| Mar 31 | $900.00 |
| Apr 14 | $1,500.00 |
| Apr 30 | $900.00 |
| Jun 1 | $900.00 |
| Jun 30 | $900.00 |
| Jul 31 | $900.00 |
| **Total** | **$6,000.00** |

Against the required schedule that is $685 behind at Jul 31, tracking to roughly
$10,500 by Dec 31 versus $13,370 required.

## Why this is fine

A corporation may base instalments on **estimated current-year tax** instead of
prior-year tax (ITA s.157). Instalment interest applies only if actual 2026 tax
ends up above what was paid in.

2026 is expected to carry materially higher expenses than 2025, so prior-year
tax overstates the liability. Current position from the workbook:

| | |
|---|---:|
| 2026 income after expenses (Jan 1 – Aug 4) | $40,559.03 |
| Estimated tax at 12.2% SBD | ~$4,948 |
| Instalments paid to date | $6,000.00 |
| **Already ahead by** | **~$1,052** |

Note: the workbook computes at 12.3%; the T2 2025 was filed at **12.2%** SBD
(9% federal + 3.2% Ontario). The 0.1% makes the workbook's estimate slightly
conservative — fine for a cushion, worth aligning eventually.

## Revised 3 August 2026 — the cushion is thinner than it looked

The figures above use the workbook's "income after expenses" ($40,559 at Aug 4).
That is a **cash-flow** number: it subtracts GST remittances, corp tax
instalments and credit card settlements, none of which are expenses, and it
covers only seven months of revenue.

Rebuilt on a full-year basis — contracted MIR revenue less actual operating
expenses:

| | |
|---|---:|
| Revenue net of HST, full year (actual + forecast) | $209,160.00 |
| Less CRA refund misfiled as revenue | −$4,644.90 |
| Operating expenses booked to 4 Aug | −$47,559.92 |
| Committed operating expenses Aug–Dec | −$26,053.45 |
| **Before credit card spend** | **$130,901.73** |

At 2025's card run rate ($2,953/mo → $35,440/yr), taxable income lands near
**$95,461**, tax near **$11,646**, against **$10,500** of instalments —
a **$1,146 shortfall** that attracts instalment interest.

## Updated again — credit card statements loaded, 3 Aug 2026

The card is not the shelter it was assumed to be. Seven 2026 statements show net
spend of **$10,555.16** to 28 Jul, a run rate of **$1,507.88/month** against
**$2,953.36/month** in 2025 — roughly half. Deductible portion (meals at 50%,
fines excluded) projects to **$14,703.67** for the year.

| | |
|---|---:|
| Before credit card spend (above) | $130,901.73 |
| Less corporate card, deductible | −$14,703.67 |
| **Before director-funded expenses** | **$116,198.06** |

The swing variable is no longer the card. It is **director-funded expenses** —
home office rent, phone, insurance, personal-card business spend — which
totalled **$41,357 in 2025** and are entirely uncaptured for 2026.

| Director-funded | Taxable income | Tax at 12.2% | vs $10,500 |
|---:|---:|---:|---:|
| $0 | $116,198 | $14,176 | +$3,676 short |
| **$11,134 — tracked today** | **$105,064** | **$12,818** | **+$2,318 short** |
| $20,000 | $96,198 | $11,736 | +$1,236 short |
| **$30,132** | **$86,066** | **$10,500** | **break-even** |
| $41,357 (2025 level) | $74,841 | $9,131 | −$1,369 refund |

As of Aug 3, 2026 three recurring items are tracked — home insurance, phone and
internet, and 30% of rent — worth **$11,133.96** for the year. That leaves about
**$19,000** to find before the instalments are covered. Mileage and personally
funded vehicle costs are the obvious source; they were most of the $41,357 in
2025. See `DIRECTOR_FUNDED_EXPENSES.md`.

**Action:** track the personal-card and home-office costs for 2026. If they run
at last year's level there is nothing to do. If they are materially lower, top up
instalments before Dec 31 — roughly $735/month extra covers the worst case.

## The number that actually matters

Interest starts only if 2026 tax payable exceeds total instalments.

Instalments of $10,500 at 12.2% cover taxable income up to **$86,065.57**.
Working back, that needs credit card spend to average **$3,736.35/month**
across 2026 — $44,836 for the year.

2025 ran $2,953/month. So unless 2026 card spend is materially higher than last
year, expect a shortfall and interest on it.

**Two ways out.** Load the 2026 card statements and find out what the real
figure is — that settles it. Or top up instalments before Dec 31; an extra
$250/month from August covers the projected gap.

The dashboard's Forecast tab has a live slider for this: move card spend and the
tax line, the balance owing and the verdict all recompute.

## Watch items

- $49,000 of Wealthsimple transfers in 2026 are an **asset move, not an
  expense**. They must not reduce taxable income. The workbook adds them back
  via `L248` on the master.
- The May 28 credit of $4,644.90 (`CANADA RIT/RIF`) is the T2 2025 refund plus
  interest — refund was assessed at $4,592. It is currently sitting in the
  revenue columns and inflates 2026 income by that amount. Back it out for the
  T2 income statement.
- **Not** a shareholder loan. Rather than book the excess of the $28,000 cash
  paid to Umar over his reimbursable expenses as a loan, Ejaz recognised the
  full $41,357 of director-funded costs across the S125 expense lines — "some
  in miscellaneous expenses and some in other expenses". The result is
  Schedule 100 line 2780: **$13,357 due TO the shareholder/director**, a
  liability of the corporation. No loan receivable exists, ITA s.15(2) is not
  engaged, and there is no repayment deadline. Umar can draw the $13,357
  tax-free whenever he likes — it reduces cash, not income. Working shown in
  `../../2025/Corporate/T2_2025_FILED_AUDIT_PROTECTION.md` §5a.
