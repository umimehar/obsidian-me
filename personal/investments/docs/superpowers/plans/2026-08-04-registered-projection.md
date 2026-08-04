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

**Goal:** Add a thirty year forward projection of registered contributions, room remaining, and projected value as a new section on the Ledger page, driven by two editable rate inputs.

**Spec:** `docs/superpowers/specs/2026-08-04-registered-projection-design.md`. The reference table there is the fixture; the implementation must reproduce it to the dollar.

**Architecture:** A new pure `src/client/projection.ts` computes the model. `sections.ts` renders it as a fourth pillar. Statutory constants live with the existing `CONTRIBUTION_LIMITS` in `analytics.ts`.

## Global Constraints

- Work from `personal/investments/scripts/` for all `bun` commands.
- TypeScript strict; zero `tsc` errors; zero Biome warnings; `bun run check` must pass.
- Line length 100; named exports only; no `any`; no non-null assertions; functions under 100 lines with complexity <= 8.
- `src/client/` is browser-only: never import `node:` modules there.
- The page stays a single self-contained offline file. No CDN references.
- Never hardcode the current year. It comes from `scopeYear`.
- Contribution limits are CRA figures and belong in `analytics.ts`, not scattered.

## Task 1 — Statutory constants

- [ ] Add to `src/analytics.ts`, exported beside `CONTRIBUTION_LIMITS`: `FHSA_ANNUAL = 8000`, `FHSA_LIFETIME = 40000`, `RESP_ANNUAL_FOR_GRANT = 2500`, `RESP_LIFETIME = 50000`, `CESG_RATE = 0.2`, `CESG_ANNUAL_MAX = 500`, `CESG_LIFETIME = 7200`, `TFSA_ROUNDING = 500`, `RRSP_ROUNDING = 10`.
- [ ] Comment why FHSA is absent from the indexed set: its limits are statutory and do not index.
- [ ] `bun run check` clean.

## Task 2 — The projection engine (TDD)

- [ ] Write `src/client/projection.test.ts` FIRST, covering every case in the spec's Testing section. Tests must fail before the implementation exists.
- [ ] Create `src/client/projection.ts` with `ProjectionInputs`, `ProjectionYear`, and `projectYears` exactly as typed in the spec.
- [ ] Indexation compounds an unrounded base; rounding applies only to the published figure. This is the known trap — the test for TFSA stepping 7,000 → 7,500 → 8,000 → 8,500 guards it.
- [ ] FHSA never indexes and self-terminates at the lifetime cap, emitting its note once.
- [ ] RRSP year one uses `rrspAssessedRemaining`; later years use granted room; zero past `rrspLastYear`.
- [ ] RESP stops at the $50,000 lifetime cap, including the partial final year.
- [ ] CESG stops at the $7,200 lifetime maximum and never exceeds 20% of the contribution.
- [ ] FHSA closure zeroes the balance in `fhsaCloseYear`, records it as `withdrawn`, and it never reappears.
- [ ] Keep `projectYears` under the complexity limit — extract a per-group helper rather than one large branchy loop.
- [ ] The spec's full reference table reproduces to the dollar.
- [ ] `bun run check` clean.

## Task 3 — Derive the inputs from the ledger

- [ ] Add to `src/client/series.ts` a function returning the projection inputs for the current scope: opening portfolio at cost per registered group, contributed-to-date per group, and the RRSP assessed remainder for the scope year.
- [ ] Opening balance per group reuses the existing forward-fill convention (last non-null `acb` plus `cash` at window end); do not write a second one.
- [ ] Group mapping reuses `REGISTERED_GROUPS`; ManagedTFSA shares the TFSA group.
- [ ] The RRSP assessed remainder is `assessed_room[RRSP][year] − contrib used`, floored at zero, and falls back to the annual maximum when no NOA figure exists.
- [ ] Unit test it, including an empty scope and a scope with no registered accounts.
- [ ] `bun run check` clean.

## Task 4 — Render the section

- [ ] Add the section shell to `src/render.ts`: heading, the two rate inputs, a table host, a chart canvas, and the caveat list. Follow the existing pillar markup and class conventions.
- [ ] Render in `src/client/sections.ts`: a year-by-year table (year, per-group contributions, CESG, cumulative in, room remaining, value) and a stacked chart of contributions with the value line.
- [ ] Print all seven statements from the spec's "What the page must say".
- [ ] Show the FHSA line terminating at the cap, and the 2039 closure withdrawal, each with its reason rather than a silent zero. Same for the RESP lifetime cap.
- [ ] Show a warning when the account selection is partial, since room is per-person.
- [ ] `bun run check` clean.

## Task 5 — Wire the rate inputs

- [ ] Editing either rate recomputes only the projection from the last-rendered inputs. It must not trigger a full section or chart rerender, matching how `wireTaxRateInput` and `setCurrentTax` already work.
- [ ] Defaults: return 8%, indexation 2%.
- [ ] Clamp and validate: reject non-numeric, negative, and absurd values rather than rendering NaN.
- [ ] Test the recompute path.
- [ ] `bun run check` clean.

## Task 6 — Verify end to end

- [ ] `bun run build`, then confirm in a real browser that the section renders, the table matches the spec fixture, and both inputs recompute live.
- [ ] Confirm the account filter drives the projection and the partial-selection warning appears.
- [ ] Mutation-check the indexation base, the FHSA cap, and the FHSA closure: break each, confirm the suite fails, restore.
- [ ] Masking guard on the regenerated page: SIN/card pattern returns zero, no name from `redactions.json` appears.
- [ ] `bun run check` clean, full suite green.

## Task 7 — Document

- [ ] Add a CLAUDE.md section covering the projection's assumptions, the unrounded-base rule, the FHSA cap and closure, and the RESP lifetime cap, so the traps are recorded.
- [ ] Update the README to mention the projection section.
- [ ] Log the work in `log/2026-08-04.md`.

## Parallelisation

Tasks 1, 2, and 3 are independent of Task 4's markup and can run concurrently. Tasks 4 and 5 both touch `sections.ts` and must be serialised against each other. Task 6 depends on everything.
