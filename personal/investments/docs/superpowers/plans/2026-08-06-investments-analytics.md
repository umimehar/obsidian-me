---
title: "Investments phase 2a: the analytics layer"
tags: [personal/investments, plan]
created: 2026-08-06
updated: 2026-08-06
status: active
type: spike
personal: investments
---

# Investments Analytics Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the masked datastore into a monthly timeline per account, plus the rollups, room, grant, income and return figures the dashboard needs, with every number traceable to something a statement states.

**Architecture:** One new directory, `app/src/analytics/`, reading `data/datastore.json` and writing `data/analytics.json`. Pure functions over `Statement[]`; no I/O outside the emitter. The UI (phase 2b) consumes only `analytics.json` and never re-derives.

**Tech Stack:** Bun, TypeScript strict, Biome, `bun test`.

**Spec:** `docs/superpowers/specs/2026-08-04-investments-rebuild-design.md`

**Scope:** Phase 2a of the rebuild. Phase 2b is the React app. Phase 3 is projections.

## Global Constraints

- Bun; never npm. TypeScript strict with `noUncheckedIndexedAccess`; zero `tsc` errors. No `any`, no non-null assertions. Biome line width 100.
- Cognitive complexity at or under the configured 15; `bun run check` clean before every commit.
- **Never write a real account number, name or address into a tracked file.** Thirteen identifier leaks occurred in phase 1, every one a real value used as an illustration. Use `ACCT0001CAD`, `Jane Doe`, `Springfield`.
- **Never use `\b` in a `git grep` pattern** — it is silently ignored and always reports clean.
- **Prove every check can fail** before trusting a zero. Six checks in phase 1 were structurally incapable of failing.

## The rule that shapes this layer

**Read what the statement states; derive only what it does not.** The CSV pipeline this replaces had to infer contributions from transaction codes and got RRSP wrong by $8,000. These statements print the answer:

- **Contributions** are stated on 104 statements — 85 as a year-to-date figure, 19 split into first-60-days and rest-of-year. A month's contribution is the **delta between consecutive year-to-date figures**, resetting each January. Never sum transaction codes to get this.
- **Cash movements** are stated on 171 statements as a `paidIn` / `paidOut` breakdown (deposits, proceeds from sales, dividends, interest, stock lending, fees, taxes, cost of investments, withdrawals).
- **Market value and book cost** are stated per holding and per asset class.
- **Returns** are stated on 21 PERFORMANCE statements as money-weighted rates.
- **Grants** are `GRANT` and `CLB` activity credits — $550 across 3 rows in this corpus.

Where a figure must be derived, say so in a comment and name what it is derived from.

## File Structure

```
app/src/analytics/
  types.ts        Timeline, AccountSeries, Rollup, RoomLine, TaxSummary, ReturnSeries
  series.ts       per account per month: value, cost, deposits, contributions, grants
  rooms.ts        CRA constants, assessed room, per-wrapper room and grant lines
  income.ts       income by type, realized gains, the tax estimate
  returns.ts      stated money-weighted rates plus derived period returns
  rollup.ts       the three grouping lenses over one account set
  build.ts        assemble and write analytics.json
```

`store/registry.ts` already supplies `AccountRecord` with `kind`, `style`, `purpose` and `inTotals`. `truth.ts` supplies observed app figures. `corrections.ts` supplies acknowledgements.

---

### Task 1: Timeline types and the monthly series

**Files:** Create `app/src/analytics/types.ts`, `app/src/analytics/series.ts`, `app/src/analytics/series.test.ts`

**Produces:** `interface MonthPoint { period, marketValue, bookCost, cashBalance, deposits, withdrawals, contributions, grants }`; `interface AccountSeries { maskedId, shortId, kind, style, purpose, inTotals, months: MonthPoint[] }`; `buildSeries(statements, accounts): AccountSeries[]`.

- [ ] **Step 1: Write the failing test.** Assert that for a two-month synthetic account, `marketValue` and `bookCost` come from each month's `portfolio`, `cashBalance` from the CAD cash block's `closing`, and `deposits` from `paidIn.deposits`. Assert a month with no BROKERAGE statement is absent rather than zero-filled.
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Implement.** One `MonthPoint` per `(account, period)` from the BROKERAGE statement; skip PERFORMANCE (it duplicates its twin) and handle CASH separately since it has no portfolio.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Corpus gate.** Throwaway script over the real datastore: every `inTotals` account's latest `marketValue` must equal what `bun run build` reports, and the sum must equal $241,739.67 at 2026-06. Report the numbers; delete the script.
- [ ] **Step 6: `bun run check`, commit.**

---

### Task 2: Contributions from stated year-to-date figures

**Files:** Modify `series.ts`, `series.test.ts`

**Consumes:** Task 1. **Produces:** populated `MonthPoint.contributions`, plus `AccountSeries.contributionsByYear` and the first-60-days split where stated.

**The trap:** contributions are cumulative within a calendar year and reset each January. A month's figure is `ytd(this month) − ytd(previous month)`, except January where it is `ytd` itself. A missing month makes the next delta cover two months — that is correct, not a bug, but it must be recorded so the UI does not attribute it to one month.

- [ ] **Step 1: Write the failing tests.** A three-month run where ytd goes 1000 → 2500 → 2500 yields 1000, 1500, 0. A January reset yields the January ytd. A gap yields a delta spanning the gap, flagged. The 60-day split is preserved verbatim where the statement gives it, never derived.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, confirm pass.** Mutation-verify: break the January reset, watch that test redden.
- [ ] **Step 5: Corpus gate.** Total 2026 RRSP-family contributions across the real data. The CSV system reported $33,000 for 2026 and $15,000 for 2025 after its `PE` fix. Report what this gives and explain any difference rather than adjusting to match — the old figure was itself corrected once.
- [ ] **Step 6: `bun run check`, commit.**

---

### Task 3: Room and grants

**Files:** Create `app/src/analytics/rooms.ts`, `rooms.test.ts`

**Produces:** `interface RoomLine { group, year, used, limit, assessed, remaining }`; `buildRoomLines(series, year)`; grant tracking for RESP.

Carry over from the system being replaced, which had these corrected once already:

- `CONTRIBUTION_LIMITS` — the generic CRA annual maximum per wrapper per year.
- `ASSESSED_ROOM` — this person's actual room from a notice of assessment, carry-forward included. RRSP 2026 is $70,752 (45,191 unused at end of 2025 plus 25,561 earned). Where an assessed figure exists it wins, and the line is marked `assessed` so the UI can label it and drop the carry-forward caveat.
- **No OVER flag against the annual maximum.** Unused room carries forward, so a full bar is not an over-contribution. Against assessed room the comparison is real but still not a filing figure.
- RESP: the $50,000 lifetime contribution cap and the $7,200 lifetime CESG cap. Grant received comes from `GRANT` and `CLB` activity credits, never assumed.
- Spousal RRSP contributions count against the **contributor's** room, so the RRSP group rolls up the self-directed, managed and spousal accounts but reports the spousal line separately.

- [ ] **Step 1: Write the failing tests**, including: assessed room overriding the annual maximum for the year it covers; no leak into an adjacent year; the fallback when no assessed figure exists; grant received summed from activity, not assumed.
- [ ] **Step 2-4: Fail, implement, pass.** Mutation-verify the assessed-room override.
- [ ] **Step 5: Corpus gate.** Report every wrapper's 2026 and 2025 room line against the real data.
- [ ] **Step 6: `bun run check`, commit.**

---

### Task 4: Income, realized gains and the tax estimate

**Files:** Create `app/src/analytics/income.ts`, `income.test.ts`

**Produces:** `interface IncomeSummary { interest, eligibleDividends, foreignIncome, realizedGains }`; `buildIncome(series, statements, year, scope)`; `estimateTax(income, rrspContributed, rate)`.

- Income splits by type and currency: interest, Canadian eligible dividends (CAD `DIV`), foreign income (USD `DIV`), from activity rows.
- Realized gains are sell proceeds minus average cost, **taxable accounts only**.
- `Corporate` is **excluded** from the personal tax estimate. Investment income inside a corporation is taxed in the corporation and only reaches the owner when dividended out. Getting this wrong previously inflated 2026 eligible dividends from $202 to $645, so there is a test asserting the corporate account contributes nothing.
- Registered accounts (TFSA, RRSP, SpousalRRSP, FHSA, RESP) contribute no taxable income.
- The estimate subtracts RRSP **actually contributed** this year, not unused room. It ships with a visible not-for-filing disclaimer and is never presented as a filing figure.

- [ ] **Step 1: Write the failing tests**, including one asserting a corporate account's dividends do not reach the personal estimate, and one asserting a TFSA's do not either.
- [ ] **Step 2-4: Fail, implement, pass.** Mutation-verify the corporate exclusion.
- [ ] **Step 5: Corpus gate.** Report 2026 income by type against the real data. Reference: the old system reported $202 of eligible dividends for 2026 after its corporate fix.
- [ ] **Step 6: `bun run check`, commit.**

---

### Task 5: Returns

**Files:** Create `app/src/analytics/returns.ts`, `returns.test.ts`

**Produces:** `interface ReturnPoint { period, statedMwr, periodReturn }`; `buildReturns(series, statements)`.

- **Stated** money-weighted rates come from PERFORMANCE statements. Remember `0.00%` means "not applicable" for a horizon shorter than the account's life and is already parsed to `null` — never treat it as a measured zero.
- **Derived** period return, for accounts with no PERFORMANCE statement: `(endValue − startValue − netDeposits) / startValue`, stated as approximate because it ignores the timing of flows within the month.
- Never blend the two. Label each point with its source so the UI can say which it is showing.

- [ ] **Step 1: Write the failing tests**, including one asserting a null stated rate is not coerced to 0.
- [ ] **Step 2-4: Fail, implement, pass.**
- [ ] **Step 5: Corpus gate.** Report the stated since-inception rate for each account that has one, and the derived rate for one that does not.
- [ ] **Step 6: `bun run check`, commit.**

---

### Task 6: The three grouping lenses

**Files:** Create `app/src/analytics/rollup.ts`, `rollup.test.ts`

**Produces:** `type Lens = "registration" | "account" | "purpose"`; `rollup(series, lens): Rollup[]`.

One account set, three groupings — not three page trees.

- **registration** — TFSA, RRSP (self-directed + managed + spousal), FHSA, RESP, NonRegistered, Corporate, Cash.
- **account** — all 14, flat.
- **purpose** — from `AccountRecord.purpose`, defaulting to `unassigned` until the owner fills it in. An `unassigned` bucket must render rather than vanish.

Cash accounts appear in every lens but never contribute to a total, matching the spec's "present but excluded" decision.

- [ ] **Step 1: Write the failing tests**, including one asserting a Cash account appears in the lens output with `inTotals: false` and contributes zero to the total, and one asserting the three lenses sum to the same grand total.
- [ ] **Step 2-4: Fail, implement, pass.** Mutation-verify the cash exclusion.
- [ ] **Step 5: `bun run check`, commit.**

---

### Task 7: Emit `analytics.json` and gate on the corpus

**Files:** Create `app/src/analytics/build.ts`, `app/src/analytics/build.integration.test.ts`; add a `bun run analytics` script

**Produces:** `data/analytics.json`.

- [ ] **Step 1: Implement the emitter.** Read `data/datastore.json`, assemble series, rooms, income, returns and all three lenses, write `data/analytics.json`.
- [ ] **Step 2: Integration test over the real datastore**, skipping cleanly when it is absent. Assert: 14 accounts; the 2026-06 `inTotals` market value totals $241,739.67 within a cent; the three lenses agree on the grand total; no account appears in more than one registration group; every account carries a purpose, defaulting to `unassigned`.
- [ ] **Step 3: Leak gate.** `analytics.json` is committed. Sweep it with `grep -E` over `git show HEAD:<path>` for account codes, bare digit runs of 7 or more, postal codes, the SIN and card shapes, and every token of every configured name. Prove the sweep can fail by running it against known-present content first.
- [ ] **Step 4: `bun run check`, run `bun run analytics`, commit both the code and the generated file.**

---

## Definition of done

- `bun run analytics` writes `data/analytics.json` from the datastore with no manual step.
- 2026-06 market value totals $241,739.67; the three lenses agree; every figure traces to a stated statement value or a commented derivation.
- `analytics.json` passes the leak sweep.
- `bun run check` clean.

## Deferred

- **Phase 2b:** the React app — the three lenses as a toggle, per-wrapper views, hand-built SVG charts on `d3-scale`, Motion transitions. Invoke `design-taste-frontend` before any UI code.
- **Phase 3:** port the projection engine, fitted returns from the stated money-weighted rates, goal tracking, room runway.
- **Owner inputs still needed:** purpose tags per account, and goal targets. Both default safely until supplied.
