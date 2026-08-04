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

The Ledger page reports only what has already happened. It answers "how much room did I use this year" but not "where does this end up if I keep going". The owner wants a thirty year forward view across the registered accounts, contributing at the maximum.

Four premises in the original request do not survive contact with the data:

- **The FHSA cannot run thirty years.** Lifetime contributions are already $24,000 against a $40,000 statutory cap, so contributions end after 2028. The account itself must close by the end of 2039.
- **The TFSA limit is not a flat $7,000.** It is indexed and published rounded to the nearest $500.
- **"Maxing the RRSP limit" means two different numbers.** Year one is the unused assessed room ($37,752). Later years are that year's accrual.
- **$5,000/yr into the RESP forfeits grant.** It exhausts the $50,000 lifetime room by 2035, before the CESG has time to accrue, losing about $1,700. More precisely: the catch-up actually available is **$450**, claimable this year with $2,250 more. After that, grant room never exceeds $500 in a year, so $2,500/yr captures the full $7,200 and a $5,000 rate would only waste room.

## Facts established from the data

Not assumptions. Each was read out of `data/datastore.json` and must be derived, not hardcoded.

| Fact | Value | Source |
| --- | --- | --- |
| FHSA opened | 2024-12-03 | `accounts[].first_activity` — fixes closure at end of 2039 |
| RESP opened | 2026-01-08 | `accounts[].first_activity` |
| RESP contributed to date | $3,000 | `CONTRIB` $2,550 **plus** `TRANSFER_IN`/`DEP` $450 |
| CESG received to date | $550 | three `GRANT` transactions ($500, $10, $40) |
| RRSP assessed room 2026 | $70,752 | `ASSESSED_ROOM`, from the 2025 NOA |
| RRSP used 2026 | $33,000 | `contrib` across the four RRSP accounts |
| RESP beneficiary birth year | 2025 | **Owner-supplied, not in any statement.** Stored as `RESP_BENEFICIARY_BIRTH_YEAR` beside `ASSESSED_ROOM` in `analytics.ts`, with a comment naming it as owner input. Drives `cesgRoomAccrued` and `cesgLastYear` |

Two of these are traps. RESP contributions counted for the $50,000 lifetime cap **must include deposits coded `TRANSFER_IN`**, not just `CONTRIB` — using `contrib` alone undercounts by $450. And CESG received is a real `GRANT` transaction type, so it is derivable rather than assumed.

Note that $550 of grant against $3,000 contributed is 18.3%, not 20%: roughly $50 of grant on the 2026-06-29 deposit had not yet been paid as of the last statement. When it lands, `cesgReceived` becomes about $600 and the start-year row shifts. This is expected and is why the figure is derived from `GRANT` rows on every build rather than frozen.

The $550 of CESG already received exceeds the $500 basic annual maximum, which confirms catch-up room is live (the beneficiary was born in 2025, a year before the account opened).

## Decisions

Settled with the owner. Recorded with the trade-off accepted, because several were chosen against the recommendation.

| Decision | Choice | Consequence accepted |
| --- | --- | --- |
| Horizon | 30 years | 31 rows: the partial start year plus 30 |
| What to project | Contributions, grants, room remaining, and value | One yearly model, several readouts |
| RRSP room accrual | The indexed CRA annual maximum | Assumes earned income near $188,000; the 2025 NOA earned $25,561, so room likely runs about $8,000/yr high |
| Limit indexation | Input, default 2% | |
| Investment return | Input, default 8% | Nominal, not real |
| FHSA contributions | Stop at the $40,000 lifetime cap | Continued saving beyond it is not modelled |
| FHSA at closure (2039) | Withdrawn for a home purchase, leaves the projection | Balance and its future compounding drop out |
| RRSP last contribution year | Input, default 2068 | Owner turns 71 in 2068, so the last contribution date is 31 Dec 2068. There is no 60-day spillover into 2069. Outside the window, so it never binds today |
| RESP rate | Derived: contribute what claims all grant available that year, floored at $2,500, ceilinged at $5,000 | Captures the full $7,200 and never wastes room. The $5,000 ceiling does not bind in practice |
| RESP after the $50,000 cap | Contributions stop, balance keeps compounding | Withdrawal for school is not modelled, so late years overstate |
| Placement | New section on the Ledger page | Stays one self-contained file |
| Start year | Derived from `scopeYear`, never a literal | Rolls forward without edits |
| Account filter | Respected | Room is per-person, so a partial selection needs a visible warning |

## The model

One pure engine produces a row per year. Every readout derives from it; there is no second calculation path.

### Row count

`years: 30` yields **31 rows**: the partial start year plus 30 full years. `years: 0` yields **1 row**, the partial start year alone. There is no input that yields an empty array.

### Room granted

- **TFSA** — indexed, published rounded to the nearest $500.
- **RRSP** — indexed, published rounded to the nearest $10.
- **FHSA** — statutory, **not indexed**: $8,000/yr, $40,000 lifetime.
- **RESP** — no annual limit in law; $50,000 lifetime.

Indexation compounds an **unrounded** base and rounds only for publication. Compounding the rounded figure is wrong and silently pins the TFSA at $7,000 forever, because $7,000 × 1.02 rounds back to $7,000. This was caught in a prototype and is the likeliest bug to reintroduce.

Known limitation: the unrounded base is seeded from today's *published* figure ($7,000 TFSA, $33,810 RRSP), not CRA's true internal base (the TFSA's real unrounded 2026 value is nearer $7,160). The model therefore lags actual published limits by up to a year. This is stated on the page rather than fixed, because CRA's internal base is not verifiable from any source this project has. Separately, the RRSP limit indexes to average wage growth, not CPI, so one shared index input is an approximation for it.

### Contribution

Year one tops up to the limit from what was already contributed *this calendar year*; later years contribute the full amount.

- **TFSA** — `limit − contributedThisYear` in year one, then the granted limit. Carry-forward is **not** modelled: total unused TFSA room is not derivable from statement data.
- **FHSA** — `min(8000 − contributedThisYear, 40000 − lifetime)`, and zero after the closure year regardless.
- **RRSP** — year one is `rrspAssessedRemaining`; later years the granted room; zero after `rrspLastYear`.
- **RESP** — the target is **derived, not a hardcoded rate**:

  ```
  claimable = min(CESG_ANNUAL_MAX − grantReceivedThisYear, grantRoom, CESG_LIFETIME − received)   // 0 past cesgLastYear
  target    = min(RESP_CATCHUP_TARGET, max(claimable / CESG_RATE, RESP_GRANT_TARGET − contributedThisYear))
  contribution = max(0, min(target, 50000 − lifetime))
  ```

  This contributes exactly enough to claim every grant dollar available, never less than the $2,500 base, never more than the $5,000 ceiling, and never more than the lifetime cap allows. When the grant is exhausted it settles at $2,500/yr, filling the remaining room.
- **CESG** — `min(20% × contribution, CESG_ANNUAL_MAX − grantReceivedThisYear, grantRoom, 7200 − received)`, and zero after `cesgLastYear`. The `7200 − received` bound uses **total lifetime** received — the pre-projection $550 plus cumulative grant during the projection — which is what makes 2039 grant only $200 rather than $500. The annual cap subtracts grants **already received in the start year** — in 2026 that is $550, leaving $450 claimable. Grant room accrues $500/yr from the beneficiary's birth year and is reduced by grants received. Zero after the year the beneficiary turns 17 (2042).

### Lifecycle events

- **FHSA closure (2039)** — after that year's growth and contribution are applied, the whole FHSA balance leaves the projection as a tax-free home purchase withdrawal, recorded on the row. It does **not** roll into the RRSP. The legal trigger is the earliest of the 15th-anniversary year, the year the holder turns 71, and the year after the first qualifying withdrawal; `fhsaCloseYear` must be set to the expected purchase year when that is earlier.
- **RRSP last contribution year** — contributions stop, balance keeps compounding.

### Value

Per group: `value(y) = value(y−1) × (1 + return) + contributions(y) + grant(y)`, then lifecycle events.

Contributions arrive at year end and earn no return in their own year. This is the conservative convention and must be stated on the page.

The opening balance is **portfolio at cost** (ACB plus cash) for the scoped accounts, because the project has no market prices. Every projected value inherits that understatement.

### `cumulativeIn` excludes the grant

Government grant money is not a contribution and does not count toward the $50,000 cap. `cumulativeIn` and `cumulativeGrant` are separate fields and must be presented as separate series.

### The fixture

The full 31-row reference output is committed at `scripts/src/client/__fixtures__/projection-reference.json` and is the regression baseline. It was generated from these exact inputs:

```json
{
  "startYear": "2026", "years": 30, "returnRate": 0.08, "indexRate": 0.02,
  "opening":              { "TFSA": 50338, "FHSA": 30619, "RRSP": 54936, "RESP": 3569 },
  "contributedThisYear":  { "TFSA": 7000, "FHSA": 8000, "RRSP": 33000, "RESP": 3000 },
  "lifetimeContributed":  { "FHSA": 24000, "RESP": 3000 },
  "cesgReceived": 550, "cesgRoomAccrued": 1000,
  "rrspAssessedRemaining": 37752, "roomBase": { "TFSA": 7000, "RRSP": 33810 },
  "fhsaCloseYear": "2039", "rrspLastYear": "2068", "cesgLastYear": "2042"
}
```

Abridged, for review:

| Year | TFSA | FHSA | RRSP | RESP | CESG | Cumulative in | Value | Event |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2026 | — | — | 37,752 | 2,250 | 450 | 40,002 | 191,071 |  |
| 2027 | 7,000 | 8,000 | 34,490 | 2,500 | 500 | 91,992 | 258,847 |  |
| 2028 | 7,500 | 8,000 | 35,180 | 2,500 | 500 | 145,172 | 333,234 | FHSA lifetime cap reached |
| 2032 | 8,000 | — | 38,080 | 2,500 | 500 | 333,562 | 667,461 |  |
| 2039 | 9,000 | — | 43,740 | 2,500 | 200 | 699,292 | 1,482,813 | FHSA closed, 128,732 withdrawn; CESG max reached |
| 2044 | 10,000 | — | 48,290 | 2,250 | — | 991,692 | 2,520,806 | RESP lifetime cap reached |
| 2056 | 12,500 | — | 61,240 | — | — | 1,788,782 | 7,585,958 |  |

Totals: $1,788,782 contributed, $6,650 further grant (lifetime $7,200), $128,732 withdrawn in 2039, $7,585,958 ending value, about $4,187,987 in today's money at 2% inflation.

Comparison is on values rounded for display, carried unrounded year to year. An implementation that rounds each year's balance will diverge.

The fixture declares **integer** opening balances totalling $139,462, while the live ledger derivation carries cents ($139,461.37). That $0.63 compounds at 8% over thirty years into roughly a $3 difference in the final value. This is expected: the fixture is a unit-test artifact pinned to its own declared inputs, and the engine reproduces those to the cent. Do not "fix" the engine to close the gap, and do not regenerate the fixture from live data — its whole value is being a fixed baseline.

## Architecture

`src/client/projection.ts`, new, pure, no DOM and no `node:` imports:

```ts
export interface ProjectionInputs {
  startYear: string;
  years: number;
  returnRate: number;
  indexRate: number;
  opening: Record<string, number>;
  contributedThisYear: Record<string, number>;
  lifetimeContributed: Record<string, number>;
  cesgReceived: number;
  cesgRoomAccrued: number;
  rrspAssessedRemaining: number;
  // The UNROUNDED room base per group at startYear (TFSA and RRSP only), the
  // seed indexation compounds from. Not derivable from any other field:
  // contributedThisYear is money already put in, and rrspAssessedRemaining is
  // the NOA figure used only for the year-one contribution. Populated from
  // `ledger.limits[group][startYear]`, since projection.ts may not import
  // values from analytics.ts.
  roomBase: Record<string, number>;
  fhsaCloseYear: string;
  rrspLastYear: string;
  cesgLastYear: string;
  // The CRA figures, read off `ledger.registered_rules`. Passing them in is what
  // keeps analytics.ts the single home for statutory numbers; projection.ts must
  // not define its own copies.
  rules: RegisteredRules;
}
export interface ProjectionYear {
  year: string;
  contributions: Record<string, number>;
  grant: number;
  roomRemaining: Record<string, number>;
  cumulativeIn: number;
  cumulativeGrant: number;
  withdrawn: number;
  value: number;
  notes: string[];
}
export function projectYears(inputs: ProjectionInputs): ProjectionYear[];
```

`roomRemaining` is **lifetime** room left where a lifetime cap exists and that year's unused annual room otherwise: FHSA `40000 − lifetime` (zero from the closure year), RESP `50000 − lifetime`, RRSP `granted − contributed` for the year, TFSA the same. In the start year the annual figures subtract `contributedThisYear` **plus** that year's top-up, so TFSA 2026 reads 0, not 7,000. It is never negative.

**Constants ship through the ledger payload** as `registered_rules`, the way `limits` and `assessed_room` already do, and reach the engine via `ProjectionInputs.rules`. No client file imports values from `analytics.ts` today, and CLAUDE.md records that the client keeps its own local types. `analytics.ts` owns the CRA figures and emits them; `projection.ts` reads them off the ledger.

Rendering lives in `sections.ts` beside the other pillars. Rate inputs wire like the existing tax-rate input: editing recomputes the projection from the last-rendered inputs and never triggers a full section or chart rerender.

The chart shows three visually distinct series: **contributions**, **government grants**, and **growth**, stacked, each its own colour, so grant money is never mistaken for the owner's own.

`url.ts` gains nothing. The rates are a display preference, not scope.

## What the page must say

1. The opening balance is cost basis, not market value, so every projected value is understated.
2. RRSP room assumes the CRA annual maximum, which needs earned income near $188,000.
3. FHSA contributions stop at the lifetime cap; the account closes in 2039 with its balance withdrawn for a home.
4. The return is nominal. At 2% inflation the 2056 figure is roughly $4.19M in today's money, not $7.59M.
5. RESP withdrawal for school is not modelled, so late years overstate.
6. Indexed limits are seeded from published figures, so they may lag the real ones by about a year.
7. When the account selection is partial, room figures are not meaningful, because room is assessed per person.
8. Thirty years of compounding is a scenario, not a forecast. Small changes to the return input swing the result by millions.

## Testing

`projection.test.ts`, table-driven against pure functions.

Statutory invariants, which catch prototype error rather than merely pinning behaviour:

- Projected FHSA contributions plus $24,000 equal exactly $40,000.
- Projected RESP contributions plus $3,000 equal exactly $50,000.
- Projected grant plus $550 equals exactly $7,200.

Rules:

- Indexation compounds the unrounded base: TFSA steps 7,000 → 7,500 → 8,000 → 8,500, not flat.
- TFSA rounds to $500, RRSP to $10; FHSA never indexes at any index rate.
- Year one tops up from `contributedThisYear` rather than contributing the full limit.
- FHSA closure zeroes the balance, records `withdrawn`, and it never reappears.
- FHSA closing *before* its cap year is reached still zeroes contributions from the closure year.
- RRSP year one uses the assessed remainder; zero past `rrspLastYear`.
- The RESP target is derived from claimable grant: it claims all available grant, never drops below $2,500, never exceeds $5,000, and stops at the lifetime cap including the partial final year.
- The start-year CESG annual cap subtracts grant already received that year ($1,000 − $550 = $450 claimable in 2026).
- CESG never exceeds 20% of contribution, $1,000/yr, remaining lifetime, or `cesgLastYear`.
- `cumulativeIn` excludes the grant.
- Zero return: value equals opening plus cumulative contributions plus grants minus withdrawals, exactly.
- Zero index rate holds every limit flat.
- `years: 0` yields one row; `years: 30` yields 31.
- The committed fixture reproduces row for row.

Mutation-check the indexation base, the FHSA cap, and the FHSA closure: all three are silent-wrongness bugs rather than crashes.

## Out of scope

- Market value. The data cannot support it.
- Withdrawals other than the FHSA home purchase; no RRIF minimums, deduction timing, or tax on withdrawal.
- Redirecting FHSA or RESP overflow elsewhere. Explicitly declined.
- Rolling the FHSA into the RRSP at closure. The owner expects a home purchase.
- Additional CESG (the income-tested 10-20% top-up) and the Canada Learning Bond.
- Per-person splitting of room.
- Persisting the rate inputs in the URL.
