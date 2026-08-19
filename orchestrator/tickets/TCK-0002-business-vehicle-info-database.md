---
title: "TCK-0002 — Business vehicle info database"
tags: [ticket, project/system, type/feature, personal/business-vehicle]
created: 2026-08-19
updated: 2026-08-19
type: ticket
id: TCK-0002
status: review
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
human_review_required: true
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
- [x] Spec and plan files deleted at the end (owner's instruction)

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
- 2026-08-19 18:20 — The agent reviewer never returned, exactly as the five extraction subagents did not. The subagent lane produced no output in this session. Rather than self close on an unperformed review, `human_review_required` is set and the ticket moves to Review.
- 2026-08-19 18:25 — Verified independently instead. Arithmetic cross checked against the source documents: monthly payment times term reconciles to the stated $63,000.36, both insurance certificates' coverage and endorsement lines sum exactly to their stated totals of $8,410 and $9,657, the nine itemised optional accident benefits sum to $253, and the kilometre headroom of 965 km follows from 15,000 earned against 14,035 driven. That pass found two real defects, both fixed: `maximumDeductibleComputed` was stored rounded down at $5,222.99 against a true $5,222.9975, and the 58% residual was labelled as a percentage of the list price when it is the lessor's residual factor ($58,580 is 53.3% of total list, 58.9% of sale price).
- 2026-08-19 18:35 — Rendered every page in headless Chrome and read the screenshots. Found a third defect: the change column mapped increases to `.neg` (muted grey) and savings to `.pos` (accent), so on a page about a premium rising $1,247 the only figures drawing the eye were two small savings. Extracted into `src/delta.ts` with tests and inverted.
- 2026-08-19 18:40 — Prose checked against the owner's style rules. Removed dash punctuation from the README page list, the log title and the tracking intro. The remaining instances of "comprehensive" are the insurance coverage of that name, not the banned adjective.
- 2026-08-19 18:45 — Final state: `bun run check` green, 85 tests across 6 files, biome and `tsc --noEmit` clean. Spec and plan deleted per the owner's instruction.

## What a human reviewer should check

The agent review did not happen, so these are unverified by a second pair of eyes:

1. The two high severity findings both rest on reading page 7 of `docs/lease/lease-agreement-detailed.pdf` as a binding declaration of business use. That reading drives the recommendation to change the insurance rating, which is a consequential call.
2. Whether the vault's masking policy is satisfied by masking the insurance policy number to `****XTW6` while committing the source PDFs unmasked.
3. Whether the tax positions on the compliance page are framed correctly as questions for an accountant rather than as advice.
