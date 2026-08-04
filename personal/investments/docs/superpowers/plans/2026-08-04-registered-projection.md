---
title: Registered Projection Implementation Plan
tags: [personal/investments, spike]
created: 2026-08-04
updated: 2026-08-04
status: active
type: spike
personal: investments
---

# Registered Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thirty year forward projection of registered contributions, government grants, room remaining, and projected value as a new section on the Ledger page, driven by editable rate inputs.

**Spec:** `docs/superpowers/specs/2026-08-04-registered-projection-design.md`. The committed fixture at `scripts/src/client/__fixtures__/projection-reference.json` is the regression baseline and must reproduce row for row.

**Architecture:** A new pure `src/client/projection.ts` computes the model. `analytics.ts` owns the CRA constants and emits them on the ledger payload. `sections.ts` renders a fourth pillar.

## Global Constraints

- Work from `personal/investments/scripts/` for all `bun` commands.
- TypeScript strict; zero `tsc` errors; zero Biome warnings; `bun run check` must pass.
- Line length 100; named exports only; no `any`; no non-null assertions; functions under 100 lines with complexity <= 8.
- `src/client/` is browser-only: never import `node:` modules there, and never import **values** from `analytics.ts`. CRA figures reach the client on the ledger payload, the way `limits` and `assessed_room` already do.
- The page stays a single self-contained offline file. No CDN references.
- Never hardcode a year. Start year comes from `scopeYear`; FHSA closure and RESP/CESG dates are derived from account `first_activity` or supplied as inputs.
- Money is carried unrounded year to year and rounded only for display.

## Dependency order

Task 2 depends on Task 1's constants; Task 3 depends on Task 2's types. That chain is **serial**, correcting an earlier claim that it was parallelisable.

Genuinely concurrent: **Task 1** and **Task 4a** (static markup in `render.ts`) touch disjoint files and can run together. **Task 7a** is file-disjoint too, but it documents the RESP rule, so it runs after Task 2 rather than racing it. Everything else is serial. Tasks 4b and 5 both edit `sections.ts` and must not run concurrently.

## Task 1 — CRA constants on the ledger payload

- [ ] Add to `src/analytics.ts`, exported beside `CONTRIBUTION_LIMITS`: `FHSA_ANNUAL = 8000`, `FHSA_LIFETIME = 40000`, `RESP_LIFETIME = 50000`, `RESP_GRANT_TARGET = 2500`, `RESP_CATCHUP_TARGET = 5000`, `RESP_BENEFICIARY_BIRTH_YEAR = 2025` (owner-supplied, not in any statement — comment it as such, beside `ASSESSED_ROOM`), `CESG_RATE = 0.2`, `CESG_ANNUAL_BASIC = 500`, `CESG_ANNUAL_MAX = 1000`, `CESG_LIFETIME = 7200`, `TFSA_ROUNDING = 500`, `RRSP_ROUNDING = 10`.
- [ ] Comment why FHSA and RESP are absent from the indexed set: their limits are statutory and do not index.
- [ ] Emit them as `ledger.registered_rules`, mirroring how `limits` is emitted. Extend the `Ledger` interface and every test fixture that constructs a ledger.
- [ ] `bun run check` clean.

## Task 2 — The projection engine (TDD)

- [ ] Write `src/client/projection.test.ts` FIRST, covering every case in the spec's Testing section. Tests must fail before the implementation exists.
- [ ] Create `src/client/projection.ts` with `ProjectionInputs`, `ProjectionYear`, and `projectYears` exactly as typed in the spec.
- [ ] Indexation compounds an unrounded base; rounding applies only to the published figure. Known trap — the TFSA 7,000 → 7,500 → 8,000 → 8,500 test guards it.
- [ ] Year one tops up from `contributedThisYear`; it does not contribute a full limit.
- [ ] Row count: `years: 30` yields 31 rows, `years: 0` yields 1.
- [ ] FHSA never indexes, caps at $40,000 lifetime, and zeroes from `fhsaCloseYear` even if the cap was never reached.
- [ ] FHSA closure zeroes the balance, records `withdrawn`, and the balance never reappears.
- [ ] RRSP year one uses `rrspAssessedRemaining`; later years granted room; zero past `rrspLastYear`.
- [ ] The RESP target is **derived** per the spec formula (claim all available grant, floor $2,500, ceiling $5,000), not a hardcoded rate schedule. Capped by the $50,000 lifetime including a partial final year.
- [ ] CESG is bounded by 20% of contribution, the annual cap **minus grant already received in the start year**, accrued grant room, remaining lifetime, and `cesgLastYear`.
- [ ] `cumulativeIn` excludes the grant; `cumulativeGrant` is separate.
- [ ] `roomRemaining` follows the spec's per-group definition, subtracts `contributedThisYear` plus the top-up in the start year, and is never negative.
- [ ] `projectYears` receives the CRA figures via `ProjectionInputs.rules`; it defines no constants of its own.
- [ ] Assert the three statutory invariants (FHSA to exactly $40,000, RESP to exactly $50,000, CESG to exactly $7,200).
- [ ] Keep `projectYears` under the complexity limit — extract a per-group helper rather than one branchy loop.
- [ ] The committed fixture reproduces row for row.
- [ ] `bun run check` clean.

## Task 3 — Derive the inputs from the ledger

- [ ] Add to `src/client/series.ts` a function returning `ProjectionInputs` for the current scope.
- [ ] Opening balance per group reuses the existing forward-fill convention (last non-null `acb` plus `cash` at window end). Do not write a second one.
- [ ] Group mapping reuses `REGISTERED_GROUPS`; ManagedTFSA shares the TFSA group.
- [ ] **RESP lifetime contributed counts every dollar into the account regardless of `raw_type`**, not just `contrib`. Under CRA rules any money landing in an RESP is a contribution except an RESP-to-RESP transfer. Using `contrib` alone undercounts by $450 against the $50,000 cap.
- [ ] **CESG received comes from `GRANT` transactions**, which exist in the data. Do not assume it.
- [ ] `rrspAssessedRemaining` is `assessed_room[RRSP][year] − contrib used`, floored at zero. When no NOA figure exists, fall back to the **annual maximum minus contrib used**, also floored at zero — not the bare maximum, which would double-count consumed room.
- [ ] `fhsaCloseYear` is the FHSA account's `first_activity` year plus 15.
- [ ] Derive `contributedThisYear` per group and `lifetimeContributed` for FHSA and RESP.
- [ ] `cesgReceived` sums `GRANT` transactions; `cesgRoomAccrued` is `500 × (startYear − RESP_BENEFICIARY_BIRTH_YEAR + 1)`; `cesgLastYear` is birth year plus 17.
- [ ] Unit test it: an empty scope, a scope with no registered accounts, and the deposit-inclusive RESP total.
- [ ] `bun run check` clean.

## Task 4a — Section markup (concurrent with Task 1)

- [ ] Add the section shell to `src/render.ts`: heading, rate inputs, table host, chart canvas, caveat list host. Follow existing pillar markup and class conventions.
- [ ] `bun run check` clean.

## Task 4b — Render the projection

- [ ] Render in `src/client/sections.ts`: a year-by-year table (year, per-group contributions, grant, cumulative in, cumulative grant, room remaining, value) and a stacked chart.
- [ ] The chart shows **contributions, government grants, and growth as three visually distinct series**, each its own colour, so grant money is never read as the owner's own.
- [ ] Print all eight statements from the spec's "What the page must say".
- [ ] Surface each lifecycle note on its row: FHSA cap, FHSA closure with the withdrawn amount, RESP cap, CESG max. Never a silent zero.
- [ ] Show a warning when the account selection is partial, since room is per-person.
- [ ] `bun run check` clean.

## Task 5 — Wire the rate inputs (serial after 4b)

- [ ] Editing a rate recomputes only the projection from the last-rendered inputs, matching how `wireTaxRateInput` and `setCurrentTax` already work. No full section or chart rerender.
- [ ] Defaults: return 8%, indexation 2%.
- [ ] Clamp: return to 0-20%, indexation to 0-10%. Reject non-numeric and out-of-range rather than rendering NaN.
- [ ] Test the recompute path and both clamp boundaries.
- [ ] `bun run check` clean.

## Task 6 — Verify end to end

- [ ] `bun run build`, then confirm in headless Chrome that the section renders, the table matches the fixture, and both inputs recompute live.
- [ ] Confirm the account filter drives the projection and the partial-selection warning appears.
- [ ] Mutation-check the indexation base, the FHSA cap, and the FHSA closure: break each, confirm the suite fails, restore.
- [ ] Masking guard on the regenerated page: SIN/card pattern returns zero, no name from `redactions.json` appears.
- [ ] `bun run check` clean, full suite green.

## Task 7a — Prose docs (run after Task 2 settles the RESP rule)

- [ ] Add a CLAUDE.md section covering the projection's assumptions and every trap: the unrounded-base rule, the FHSA cap and closure, the RESP lifetime cap, that RESP contributions include deposits, and that CESG received is a `GRANT` transaction.
- [ ] Update the README to mention the projection section.

## Task 7b — Log

- [ ] Log the work in `log/2026-08-04.md`.
