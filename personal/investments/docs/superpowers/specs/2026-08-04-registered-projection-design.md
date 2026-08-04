---
title: Thirty Year Registered Contribution Projection
tags: [personal/investments, spike]
created: 2026-08-04
updated: 2026-08-04
status: active
type: spike
personal: investments
---

# Thirty Year Registered Contribution Projection

## Problem

The Ledger page reports only what has already happened. It answers "how much room did I use this year" but not "where does this end up if I keep going". The owner wants a thirty year forward view across the registered accounts, assuming contributions continue at the maximum: TFSA to its annual limit, FHSA at $8,000, RRSP to its limit, RESP at the CESG-matched amount.

Three premises in the original request do not survive contact with the data:

- **The FHSA cannot run for thirty years.** Lifetime contributions are already $24,000 against a $40,000 statutory cap, so contributions end after 2028. The account itself must close by the end of 2039, fifteen years after opening.
- **The TFSA limit is not a flat $7,000.** It is indexed and published rounded to the nearest $500.
- **"Maxing the RRSP limit" means two different numbers.** Year one is the assessed room of $70,752 (carry-forward included, $37,752 still unused). Every later year is only that year's accrual.

A thirty year horizon also pulls three statutory deadlines inside the window that a ten year horizon would never have reached: FHSA closure, the RESP lifetime cap, and the RRSP age-71 cutoff. Ignoring any of them materially inflates the result.

## Decisions

Settled with the owner during brainstorming. Recorded with the trade-off accepted, because several were chosen against the recommendation.

| Decision | Choice | Consequence accepted |
| --- | --- | --- |
| Horizon | 30 years | 31 rows, the first partial |
| What to project | Contributions, room remaining, and projected value | One yearly model, several readouts |
| RRSP room accrual | The indexed CRA annual maximum | Assumes earned income near $188,000; the 2025 NOA earned $25,561, so room likely runs about $8,000/yr high |
| Limit indexation | An input, default 2% | CRA tracks CPI; the input allows other scenarios |
| Investment return | An input, default 8% | Nominal, not real |
| FHSA contributions | Stop at the $40,000 lifetime cap | About $8,000/yr of continued saving is not modelled anywhere |
| FHSA at closure (2039) | Balance is withdrawn for a home purchase and leaves the projection | Owner expects to buy by then; the balance and its future compounding drop out |
| RRSP last contribution year | An input, default 2067 (stop date April 2068) | Falls outside a 30 year window, so it never binds today; the mechanism exists so a longer horizon stays correct |
| RESP | Capped at the $50,000 lifetime limit, balance keeps compounding | Withdrawal for school is not modelled, so late years overstate |
| Placement | A new section on the Ledger page | Stays one self-contained file |
| Start year | Finish the current year to its limit, then thirty full years | Derived from the data, never a literal |
| Account filter | Respected | Room is a per-person figure, so a partial selection needs a visible warning |

## The model

One pure engine produces a row per group per year. Every readout derives from it; there is no second calculation path.

### Room granted

- **TFSA** — indexed, published rounded to the nearest $500.
- **RRSP** — indexed, published rounded to the nearest $10.
- **FHSA** — statutory and **not indexed**: $8,000/yr, $40,000 lifetime.
- **RESP** — no annual limit in law; the projection contributes $2,500/yr because that is the amount attracting the full 20% CESG, subject to the $50,000 lifetime cap.

Indexation compounds an **unrounded** base and rounds only for publication. Compounding the rounded figure is wrong and silently pins the TFSA at $7,000 forever, because $7,000 × 1.02 rounds back to $7,000. This was caught in a prototype and is the single most likely bug to reintroduce.

### Contribution

`contribution = min(assumption, room available)`, per group:

- **TFSA** — that year's granted room. Carry-forward is **not** modelled, because the owner's total unused TFSA room is not derivable from statement data. Under a max-out assumption this only matters if past years were underfunded.
- **FHSA** — `min(8000, 40000 − lifetime to date)`, and zero after the closure year regardless.
- **RRSP** — year one is the unused assessed room from `ASSESSED_ROOM`; later years are that year's granted room; zero after the last contribution year.
- **RESP** — `min(2500, 50000 − lifetime to date)`. The CESG grant is 20% of the contribution, capped at $500/yr and $7,200 lifetime, so it stops in 2041.

### Lifecycle events

- **FHSA closure (2039)** — after that year's growth and contribution are applied, the entire FHSA balance leaves the projection as a tax-free home purchase withdrawal. The row records the amount withdrawn. It does **not** roll into the RRSP.
- **RRSP last contribution year (2067)** — contributions stop; the balance keeps compounding. Outside the current window.

### Value

`value(y) = value(y−1) × (1 + return) + contributions(y)`, applied per group, then lifecycle events.

Contributions arrive at year end and earn no return in their own year. This is the conservative convention and must be stated on the page.

The opening balance is **portfolio at cost** (ACB plus cash) for the scoped accounts, because the project has no market prices. Every projected value inherits that understatement.

### Reference output

Start $139,462 at cost, 8% return, 2% indexation. Abridged; the implementation must reproduce every row.

| Year | TFSA | FHSA | RRSP | RESP | CESG | Cumulative in | Value | Event |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2026 | — | — | 37,752 | — | — | 37,752 | 188,371 | |
| 2027 | 7,000 | 8,000 | 34,490 | 2,500 | 500 | 90,242 | 255,931 | |
| 2028 | 7,500 | 8,000 | 35,180 | 2,500 | 500 | 143,922 | 330,085 | FHSA cap reached |
| 2029 | 7,500 | 0 | 35,880 | 2,500 | 500 | 190,302 | 402,872 | |
| 2035 | 8,500 | 0 | 40,410 | 2,500 | 500 | 486,672 | 1,000,113 | |
| 2039 | 9,000 | 0 | 43,740 | 2,500 | 500 | 703,542 | 1,475,770 | FHSA closed, 128,732 withdrawn |
| 2045 | 10,000 | 0 | 49,250 | 2,450 | 0 | 1,058,592 | 2,774,270 | RESP lifetime cap reached |
| 2050 | 11,500 | 0 | 54,380 | 0 | 0 | 1,374,532 | 4,445,857 | |
| 2056 | 12,500 | 0 | 61,240 | 0 | 0 | 1,796,432 | 7,568,588 | |

Totals: $1,796,432 contributed, $128,732 withdrawn for a home in 2039, $7,568,588 ending value, about $4,178,397 in today's money at 2% inflation. CESG runs 15 years and totals $7,200.

## Architecture

`src/client/projection.ts`, new, pure, no DOM and no `node:` imports:

```ts
export interface ProjectionInputs {
  startYear: string;
  years: number;                        // 30
  returnRate: number;
  indexRate: number;
  opening: Record<string, number>;      // group -> portfolio at cost
  contributedToDate: Record<string, number>;
  rrspAssessedRemaining: number;
  fhsaCloseYear: string;
  rrspLastYear: string;
}
export interface ProjectionYear {
  year: string;
  contributions: Record<string, number>;
  grant: number;
  roomRemaining: Record<string, number>;
  cumulativeIn: number;
  value: number;
  withdrawn: number;                    // FHSA home purchase, 0 otherwise
  notes: string[];
}
export function projectYears(inputs: ProjectionInputs): ProjectionYear[];
```

Statutory constants (`FHSA_ANNUAL`, `FHSA_LIFETIME`, `RESP_LIFETIME`, `RESP_ANNUAL_FOR_GRANT`, `CESG_RATE`, `CESG_ANNUAL_MAX`, `CESG_LIFETIME`, rounding increments) sit beside the existing `CONTRIBUTION_LIMITS` in `analytics.ts` and are imported, so there is one home for CRA figures.

Rendering lives in `sections.ts` beside the other pillars. The two rate inputs wire like the existing tax-rate input: editing recomputes the projection from the last-rendered inputs and never triggers a full section or chart rerender.

`scopeYear` supplies the start year, so nothing is hardcoded to 2026.

The URL contract in `url.ts` gains nothing. The rates are a display preference, not scope.

## What the page must say

Each of these materially changes how the numbers should be read.

1. The opening balance is cost basis, not market value, so every projected value is understated.
2. RRSP room assumes the CRA annual maximum, which needs earned income near $188,000.
3. FHSA contributions stop at the lifetime cap, and the account closes in 2039 with its balance withdrawn for a home. Saving beyond the cap is not modelled.
4. The return is nominal. At 2% inflation the 2056 figure is roughly $4.18M in today's money, not $7.57M.
5. RESP withdrawal for school is not modelled, so the late years overstate.
6. When the account selection is partial, room figures are not meaningful, because room is assessed per person.
7. Thirty years of compounding is a scenario, not a forecast. Small changes in the return input swing the result by millions.

## Testing

`projection.test.ts`, table-driven against pure functions:

- Indexation compounds the unrounded base: TFSA must step 7,000 → 7,500 → 8,000 → 8,500, not stay flat.
- TFSA rounds to $500, RRSP to $10.
- FHSA caps mid-window, stays at zero afterwards, and emits its note once.
- FHSA is never indexed, at any index rate.
- FHSA closure zeroes the balance in the close year, records `withdrawn`, and the balance never reappears.
- RRSP year one uses the assessed remainder, later years the granted room, zero past the last contribution year.
- RESP stops at the $50,000 lifetime cap, including the partial final year.
- CESG stops at the $7,200 lifetime grant and never exceeds 20% of the contribution.
- A zero return makes value equal opening plus cumulative contributions minus withdrawals exactly.
- A zero index rate holds every limit flat.
- The full reference table reproduces to the dollar.
- Degenerate inputs: zero years yields an empty array; an empty scope yields zero opening; a close year before the start year does not produce a negative balance.

Mutation-check the indexation base, the FHSA cap, and the FHSA closure, since all three are silent-wrongness bugs rather than crashes.

## Out of scope

- Market value anywhere in the projection. The data cannot support it.
- Withdrawals other than the FHSA home purchase; no RRSP deduction timing, RRIF minimums, or tax on withdrawal.
- Redirecting FHSA or RESP overflow into other accounts. Explicitly declined.
- Rolling the FHSA into the RRSP at closure. The owner expects a home purchase instead.
- Per-person splitting of room. The registered accounts all draw on one person's room today.
- Persisting the rate inputs in the URL.
