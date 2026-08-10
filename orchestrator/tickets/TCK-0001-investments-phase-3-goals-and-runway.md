---
title: "TCK-0001 — Investments phase 3: goal tracking and room runway"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-08-10
updated: 2026-08-10
type: ticket
id: TCK-0001
status: ready
project: system
ticket_type: feature
assigned_device: any
claimed_by: null
auto_ok: false
triage: manual
priority: p2
effort: large
depends_on: []
created_by: umar
session: null
---

# TCK-0001 — Investments phase 3: goal tracking and room runway

## Goal

Build the two remaining features from the investments spec's Predictions section: goal tracking and room runway. Both render inside the existing Projections tab of the app at `personal/investments/app/`, reading the ported projection engine's rows, and both are judged at runtime against the projection view's live rate control so moving the slider re-judges every goal.

This is the endeavor's phase 3. Phases 1, 2a, 2b and 2c are complete at 037fe60 with 1054 tests passing. The endeavor is [[personal/investments/README|personal/investments]]; this ticket exists because a personal endeavor is journal-only and carries no board of its own, so agent-executed work on it becomes a central-board ticket that references it.

**Effort note.** `effort: large` exceeds `orchestrator/control.md`'s `max_effort: medium`. That bound governs what an unattended run may take on; this ticket is owner-directed interactively in session, and the owner asked for the phase end to end. Flagged rather than downgraded, because calling a multi-task phase "medium" to fit a gate would be the misreport the bound exists to prevent.

## Acceptance criteria

- [ ] A design spec committed at `personal/investments/docs/superpowers/specs/`, owner-reviewed.
- [ ] An implementation plan committed at `personal/investments/docs/superpowers/plans/`, executed with `superpowers:subagent-driven-development` — one implementer per task, then a reviewer.
- [ ] Goals config supports all three scopes: whole portfolio, registration groups, and purpose. Owner-reviewed table, not derived from any statement.
- [ ] Each goal card states the projected value in its target year, the gap against target, and the additional monthly contribution that closes a gap, solved on the engine's own year-end convention so the card and the chart cannot disagree.
- [ ] A goal whose scope names accounts the projection does not cover discloses the covered subset against the scope's real total. A goal resolving to zero projected accounts renders unprojectable, never $0.
- [ ] Room runway table derived structurally from `ProjectionYear[]` (never by parsing the engine's `notes` strings): FHSA $40,000 cap and its separate 2039 closure, RESP $50,000 cap, CESG $7,200 and its last claimable year, RRSP last accrual year 2068, TFSA stated as having no lifetime cap.
- [ ] Every rendered figure and every drawn mark reddened by some test. Any bar or line anchored to its own axis tick via `chartTestSupport.ts`'s `tickY`, never to a sibling mark.
- [ ] Tooltip, `aria-label` and any live announcement come from one formatting call. Six precision defects of this shape have shipped.
- [ ] Assertions run against the committed `data/analytics.json` with real numbers reported, except where the corpus provably cannot reach a case, which must be stated.
- [ ] `bun run build` before `bun run check`, both clean. `bun run contrast` clean on all six tabs in both themes.
- [ ] Browser pass with Playwright over the new view, both themes, keyboard and pointer.
- [ ] Log entry written in `personal/investments/log/`, and the endeavor README and `hot.md` updated.

## Context

Read in this order before touching code:

1. [[personal/investments/docs/superpowers/specs/2026-08-04-investments-rebuild-design|the rebuild design]] — the design and every data finding.
2. `.superpowers/sdd/2026-08-06-investments-charts-and-projections/progress.md` — the phase 2c ledger, carrying the deferred triage and the reasoning behind every ruling. Two sibling ledgers cover phases 1, 2a and 2b.
3. [[personal/investments/log/2026-08-06|the 2026-08-06 log]] — phase 2c and the three data defects it found.
4. `personal/investments/CLAUDE.md` — everything below its banner describes the deleted CSV pipeline and several findings are false of the PDF pipeline.

Owner decisions carried in from the phase 3 brainstorm, 2026-08-10:

- Goal scope is flexible: portfolio, groups and purpose all supported.
- Goals are judged at runtime against the live rate control, not a per-goal configured rate.
- Both features live inside the Projections tab. No seventh tab, no state lifting.

Verified figures the work must not move: total $241,739.67 at 2026-06 across all three lenses. RRSP 2025 $15,000 of an assessed $60,191 leaving $45,191; RRSP 2026 $33,000 of $70,752 leaving $37,752. TFSA 2025 $25,000, TFSA 2026 $7,000. FHSA $24,000 of a $40,000 lifetime cap. RESP $3,000 of $50,000 with CESG $550 of $7,200. Projection defaults to 6% by owner decision; the rate fitted from 37 months is 24.84% and renders beside it with its window as the caveat.

Environment hazards that have each cost real work: never source anything from `/tmp`; `cp` is aliased to `cp -i` and zsh `noclobber` is set, so both silently refuse rather than erroring and every restore must be verified by checksum or diff, never by exit code; run `bun run build` before `bun run check`, never after; `git grep` silently ignores `\b`; the leak gate at `.superpowers/sdd/2026-08-04-investments-ingest/leak-gate.sh <range>` has two known false-positive classes, log-decade axis constants and hex colours with alpha. Never dispatch two implementers onto the same file, and tell every subagent explicitly to finish with SendMessage.

Do not delete `scripts/` — `scripts/src/client/projection.ts` is the byte-identity reference the ported engine is checked against.

## Open

**TFSA assessed room, owner input outstanding.** The TFSA line falls back to the generic annual maximum and `remaining` is correctly null. When the owner supplies the assessed figure it goes into `ASSESSED_ROOM` in `app/src/analytics/rooms.ts` the way RRSP 2025 and 2026 are, with a comment recording its source and date. It changes rendered figures and needs an `analytics.json` regeneration, so it is its own task, not a drive-by edit. Not a blocker for the rest of phase 3.

## Worklog

- 2026-08-10 — Ticket created at the owner's request in an interactive session, after a phase 3 brainstorm settled goal scope, the rate basis and placement. Written by agent:mac-studio; origin is the owner, which is what `created_by` records. Placed straight into Ready because the owner's explicit in-session instruction is the human triage gate the kanban contract describes.
