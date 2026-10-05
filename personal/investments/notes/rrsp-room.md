---
title: RRSP deduction limit and contribution room
tags: [personal/investments, reference]
created: 2026-08-04
updated: 2026-10-01
status: active
type: reference
personal: investments
---

# RRSP deduction limit and contribution room

Transcribed from the notice of assessment for the 2025 tax year. This is the figure the Ledger page's RRSP room bar measures against, held in `ASSESSED_ROOM` in `scripts/src/analytics.ts`. It is not the generic CRA annual maximum, which for 2026 is $33,810.

## 2026 available contribution room: $70,752

Unused room at the end of 2025:

| Description | Amount |
| --- | ---: |
| RRSP deduction limit for 2025 | 60,191 |
| Minus: employer's PRPP contributions for 2025 | 0 |
| Minus: allowable RRSP contributions deducted for 2025 | 15,000 |
| **Equals: unused room at the end of 2025** | **45,191** |

Additional limit earned in 2025:

| Description | Amount |
| --- | ---: |
| 18% of 2025 earned income, to a maximum of $33,810 | 25,561 |
| Minus: 2025 pension adjustment (PA) | 0 |
| Minus: 2025 prescribed amount for connected persons | 0 |
| **Equals: additional limit earned in 2025** | **25,561** |

2026 deduction limit:

| Description | Amount |
| --- | ---: |
| Unused room at the end of 2025 | 45,191 |
| Plus: additional limit earned in 2025 | 25,561 |
| Minus: 2026 net past service pension adjustment (PSPA) | 0 |
| Plus: 2026 pension adjustment reversal (PAR) | 0 |
| **Equals: RRSP deduction limit for 2026** | **70,752** |
| Minus: unused contributions previously reported and available to deduct for 2026 | 0 |
| **Available contribution room for 2026** | **70,752** |

## Position

Contributions for 2026 reached $42,000 by 2026-10-01 per the owner, leaving $28,752. The 2025 NOA deducted $15,000, which is the $12,000 and $3,000 the statements show for that year.

## 2026 plan

Contribute about $53,500 and deduct exactly that on the 2026 return: estimated income of about $235,000 then lands at the $181,440 top of the 44.97% bracket, so the whole deduction saves 48% to 50%. The remaining room carries to 2027. Reasoning and the payroll schedule are in [[2026-10-01-allocation-and-rrsp-plan]].

## Maintenance

Update `ASSESSED_ROOM` and this note when the next notice of assessment arrives. Leaving it stale means the bar silently reverts to the annual maximum for the new year, which understates room by the carry-forward.

Related: [[README]]
