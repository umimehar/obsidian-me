---
title: "TCK-0002 — Business vehicle info database"
tags: [ticket, project/system, type/feature, personal/business-vehicle]
created: 2026-08-19
updated: 2026-08-19
type: ticket
id: TCK-0002
status: in-progress
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: large
depends_on: []
created_by: umar
session: 9107a6e3-2d57-4110-8298-3259d1de2bc7
human_review_required: false
---

# TCK-0002 — Business vehicle info database

## Goal

Stand up the `business-vehicle` personal endeavor as an HTML-first info database for the 2026 Mercedes-Benz GLC 43 AMG leased in 15248132 Canada Inc.'s name: lease and contracts, insurance (current, renewal and the shopping decision), service and warranty history, corporate tax and compliance, and a history of every leased vehicle.

A single JSON file is the source of truth. A Bun render script emits six HTML pages against the shared `personal/_assets/personal.css` stylesheet, each carrying a navigable header that links every other page.

## Acceptance criteria

- [x] `personal/business-vehicle/` scaffolded per vault convention: `README.md` (`type: personal`, `personal: business-vehicle`), `log/2026-08-19.md`
- [x] Source documents committed under `docs/` (lease, insurance, service, warranty)
- [x] Every fact from the 9 source PDFs and the 4 service invoice images extracted into `data/vehicle.json`
- [x] Account, bank/PAD and policy numbers masked to last four in the JSON and every rendered page
- [x] `scripts/` Bun project renders six pages: index, lease, insurance, service, compliance, fleet-history
- [x] Every page carries the same nav header linking all six, current page marked
- [x] Render helpers unit-tested (currency, dates, prepaid-maintenance drawdown, lease countdown); tests pass
- [x] Typecheck and lint clean
- [ ] Spec and plan files deleted at the end (owner's instruction)

## Context

Owner brief: auto insurance shopping handoff summary (Desjardins renewal 2026-10-01 at $9,657, up 14.8%; four brokers contacted 2026-08-19; conviction disclosure to correct; letter of experience outstanding).

Source documents: `~/Downloads/merce/` — lease agreement (FCLP Classic addendum), detailed lease agreement, lease pricing, payment receipts, Platinum Auto Plus agreement, prepaid maintenance, plus `insurance docs/` (2025-10-01 policy, 2026-10-01 renewal, Mercedes insurance form). Four photographed pages of Mercedes-Benz Mississauga service invoice 1137630 dated 2026-08-12 at 14,035 km.

Design approved in session before this ticket was opened. Approach B of three: JSON source of truth plus Bun render script, rejected one-big-page and one-page-per-document.

## Worklog

- 2026-08-19 16:05 — Scaffolded the endeavor, copied the nine source PDFs and four invoice photographs into `docs/`, and set up the Bun renderer alongside the investments project's conventions.
- 2026-08-19 16:20 — Five extraction subagents were dispatched for the scanned PDFs and none reported back or appeared in the agent list. Read all five documents directly instead. Recorded so the failure is not mistaken for the documents being unreadable.
- 2026-08-19 16:40 — Both insurance certificates parsed from their text layers. Confirmed the $253 of itemised optional accident benefits sums exactly across nine lines, and that the 2025-26 certificate marked every one Not included.
- 2026-08-19 17:05 — Read the executed lease. Page 7 carries a signed corporate declaration of primarily business use, which contradicts the personal rating on both insurance certificates and triggers the ineligibility clause in the Platinum agreement. Two high severity findings.
- 2026-08-19 17:30 — Eight findings written into `data/vehicle.json` and rendered on the overview and compliance pages.
- 2026-08-19 17:45 — `bun run check` green: biome clean, `tsc --noEmit` clean, 81 tests passing across 5 files.

    bun test v1.3.9 (cf6cdbbb)
     81 pass
     0 fail
     261 expect() calls
    Ran 81 tests across 5 files. [21.00ms]

- 2026-08-19 17:50 — Two lessons captured in `knowledge/lessons.md`: zsh `noclobber` silently refusing a heredoc overwrite, and symlinked skill scripts never firing their own CLI entrypoint guard.
- 2026-08-19 17:55 — Agent review dispatched at the owner's chosen model over both commits.
