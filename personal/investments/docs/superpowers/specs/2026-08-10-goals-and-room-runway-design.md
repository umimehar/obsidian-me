---
title: "Investments phase 3: goal tracking and room runway"
tags: [personal/investments, decision]
created: 2026-08-10
updated: 2026-08-10
status: active
type: decision
personal: investments
---

# Investments phase 3: goal tracking and room runway

The last two features from the rebuild spec's Predictions section. Both render inside the existing Projections tab, both read the rows `projectYears` already returns, and both are judged against the rate the reader can see on screen.

## What already exists, and why that decides the shape

`ProjectionsView.tsx:229` holds the rate in a `useState` and passes it into a `projectYears` memo at line 234. Everything phase 3 needs is one prop-drill away from that state, so goals and runway rendered as siblings inside this view read the live rate with no context, no store, and no lifting. Owner decision 2026-08-10: both features live here rather than in a seventh tab.

`ProjectionYear` carries `contributions`, `grant`, `roomRemaining`, `cumulativeIn`, `cumulativeGrant`, `withdrawn`, `value` and `notes`, one row per year. `ProjectionInputs` carries `fhsaCloseYear`, `cesgLastYear` and `rrspLastYear`. Between them, every runway figure is a read rather than a new derivation. Nothing in this phase touches `engine.ts`, whose byte-identity against `scripts/src/client/projection.ts` is checked by diff.

## Goals

### The config

`app/src/goals/config.ts`, keyed and reviewed the way `LABELS` and `PURPOSES` in `store/registry.ts` are: owner-declared, never derived from a document. A goal names a scope, a target and a target year.

```ts
type GoalScope =
  | { kind: "portfolio" }
  | { kind: "groups"; groups: readonly ProjectionGroup[] }
  | { kind: "purpose"; purpose: Purpose };
```

All three scopes, per the owner's answer on 2026-08-10. One resolver turns any scope into a set of accounts, so a `portfolio` goal and a `groups` goal naming every group cannot disagree about what they cover.

Two goals ship, both with statutory targets:

| id | scope | target | by |
|---|---|---|---|
| `house` | purpose `house` (e2ec) | $40,000 | 2028 |
| `education` | groups `["RESP"]` | $50,000 | 2042 |

No retirement or growth goal ships. Their targets are personal figures no statement states and the owner has not supplied one, and a goal card renders a verdict, so inventing a target would manufacture a verdict. Adding one later is a row in this table.

The education goal's 2042 rests on `DEFAULT_RESP_BIRTH_YEAR = 2025` in `inputs.ts`, a documented default rather than an owner-confirmed birth year. It drives `cesgLastYear` (birth year plus 17) already, so the goal inherits an assumption the projection was making anyway. The card names the year's source.

### What a card answers

Three figures, all at the live rate:

The projected value of the goal's covered accounts in the target year, read out of the row whose `year` matches. The gap against the target. And, where there is a gap, the additional monthly contribution that closes it.

That third figure is solved on the engine's own convention, which is the point of solving it rather than reaching for a spreadsheet formula: `engine.ts` grows the opening balance, then lands contributions at year end where they earn nothing in their own year. A closed-form future-value inversion that assumes start-of-year contributions returns a smaller number than the projection would actually need, and the card would then contradict the chart beside it. The solve mirrors the engine's convention exactly, and a test asserts the solved contribution, fed back through the engine, lands within a cent of the target.

Room bounds the answer. Where the solved contribution exceeds the room the projection reports as available across those years, the card says so rather than printing a figure CRA would refuse. This matters most on the FHSA, whose $8,000 annual and $40,000 lifetime caps make "just contribute more" impossible past a point.

### Coverage, which is the honest part

A scope can name accounts the projection does not cover. `projectedAccounts` in `inputs.ts` covers TFSA, RRSP, FHSA, RESP and Corporate kinds only, so a `purpose: "growth"` goal, spanning d77c, 9710, 1f9a, 2c62 and e2d6, would forecast two of five accounts.

Every card states its covered subset against its scope's real total, the way the projection line already reconciles its $180,941.35 against the portfolio's $241,739.67. A goal resolving to zero projected accounts renders as unprojectable and says why. It never renders $0, which is a real figure and would be a false one here.

## Room runway

One table, derived from the same `ProjectionYear[]` the chart draws, read structurally rather than by matching the engine's `notes` strings. Those strings are prose for a reader; parsing them would make a rendered sentence load-bearing and would break silently the first time one is reworded.

| Bound | Derived from |
|---|---|
| FHSA $40,000 lifetime cap | first row where `roomRemaining.FHSA` reaches 0 |
| FHSA closure | `fhsaCloseYear`, 2039, fifteen years after e2ec's first statement at 2024-12 |
| RESP $50,000 lifetime cap | first row where `roomRemaining.RESP` reaches 0 |
| CESG $7,200 | first row where `cumulativeGrant` reaches the cap, and `cesgLastYear` |
| RRSP last accrual year | `rrspLastYear`, 2068 |
| TFSA | no lifetime cap, stated in those words |

The FHSA needs both of its rows visible together. Contributions stop at the cap in 2028 and the account itself ends in 2039, and those are unrelated facts that a single "FHSA deadline" row would blur into one. The TFSA row exists for the same reason a Cash account stays visible and excluded: a wrapper missing from the table reads as an oversight, while a wrapper stating it has no cap reads as an answer.

Every year in this table moves with the rate, because a higher return fills a lifetime cap sooner. The table is inside the rate control's blast radius and re-derives with it, which is the same guarantee the goals carry.

## Testing

The corpus is the gate. Every figure asserted against the committed `data/analytics.json`, with the real number reported. A hand-built fixture is right only where the corpus provably cannot reach a case, and the report has to say which case and why. Phase 2c's task 8 set the standard: it protected the $450 RESP trap by fixture and stated outright that the corpus could not kill it.

Every rendered figure and every drawn mark reddened by some test. Not "every test is reddened by some mutation", which is the easy direction and which shipped three charts drawable at half height with a fully green suite. Any mark carrying a magnitude is anchored to its own axis tick through `chartTestSupport.ts`'s `tickY`, never to a sibling mark, since a uniform scale error preserves every ratio between siblings.

Tooltip, `aria-label` and any live announcement come from one formatting call. Six defects of that shape have shipped here: $241,740 for $241,739.67, 20% for 20.4%, 2% for 1.6%, 47% for 46.641%. The axis formatters are for gridlines and nothing else.

A browser pass closes the phase. Five times in this build a browser found what a diff could not, including seventeen `h1` elements and a legend swatch clipped so the mark teaching "derived" was itself unreadable. `bun run contrast` on all six tabs in both themes, plus Playwright over the new view with keyboard and pointer.

## Non-goals

Storing a past projection to compare a prior forecast against what happened. It needs persistence this local read-only tool does not have, and it stays deferred.

A per-goal return rate. The owner chose one rate, judged at runtime, so that no goal is ever judged against a number the reader cannot see.

Any change to `engine.ts` or its 31-row fixture.

## Open

The TFSA assessed contribution room. Without it the TFSA line falls back to the generic annual maximum with a correctly null `remaining`, and 2025 renders $25,000 used against a $7,000 maximum with no signal, which the phase 2c review already flagged as an owner decision. When the figure arrives it goes into `ASSESSED_ROOM` in `analytics/rooms.ts` with a comment recording its source and date, matching RRSP 2025 and 2026, and it needs an `analytics.json` regeneration. It is its own task and it blocks nothing here.
