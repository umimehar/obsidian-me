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

- [ ] `personal/business-vehicle/` scaffolded per vault convention: `README.md` (`type: personal`, `personal: business-vehicle`), `log/2026-08-19.md`
- [ ] Source documents committed under `docs/` (lease, insurance, service, warranty)
- [ ] Every fact from the 9 source PDFs and the 4 service invoice images extracted into `data/vehicle.json`
- [ ] Account, bank/PAD and policy numbers masked to last four in the JSON and every rendered page
- [ ] `scripts/` Bun project renders six pages: index, lease, insurance, service, compliance, fleet-history
- [ ] Every page carries the same nav header linking all six, current page marked
- [ ] Render helpers unit-tested (currency, dates, prepaid-maintenance drawdown, lease countdown); tests pass
- [ ] Typecheck and lint clean
- [ ] Spec and plan files deleted at the end (owner's instruction)

## Context

Owner brief: auto insurance shopping handoff summary (Desjardins renewal 2026-10-01 at $9,657, up 14.8%; four brokers contacted 2026-08-19; conviction disclosure to correct; letter of experience outstanding).

Source documents: `~/Downloads/merce/` — lease agreement (FCLP Classic addendum), detailed lease agreement, lease pricing, payment receipts, Platinum Auto Plus agreement, prepaid maintenance, plus `insurance docs/` (2025-10-01 policy, 2026-10-01 renewal, Mercedes insurance form). Four photographed pages of Mercedes-Benz Mississauga service invoice 1137630 dated 2026-08-12 at 14,035 km.

Design approved in session before this ticket was opened. Approach B of three: JSON source of truth plus Bun render script, rejected one-big-page and one-page-per-document.

## Worklog
