---
title: "Business vehicle info database — implementation plan"
tags: [personal/business-vehicle, plan]
created: 2026-08-19
updated: 2026-08-19
status: active
type: spike
personal: business-vehicle
---

# Business vehicle info database — implementation plan

## Phase 1 — Extraction (in flight)

Five subagents read the scanned PDFs (detailed lease, pricing worksheet, payment receipts, Platinum Auto Plus, prepaid maintenance) and return strict JSON with account numbers masked. The two insurance policies and the MBFS insurance agreement were parsed directly from their text layers. The four service invoice pages were read from the owner's photographs.

## Phase 2 — Data assembly

Merge every extraction into `data/vehicle.json` against the schema in the design. Record contradictions between the owner's brief and the documents rather than silently preferring either.

## Phase 3 — Renderer, test first

1. `scripts/src/format.ts` — currency, dates, month countdown, percentage. Tests first.
2. `scripts/src/drawdown.ts` — prepaid maintenance consumption and warranty windows. Tests first.
3. `scripts/src/nav.ts` — the shared header, marking the current page. Tests first.
4. `scripts/src/pages/*.ts` — one module per page, each a pure function from data to HTML.
5. `scripts/src/build.ts` — reads the JSON, writes six files into `notes/`.

## Phase 4 — Endeavor wiring

`README.md` index with wikilinks to every page, `log/2026-08-19.md` recording the session, and the `tracking.md` deadlines table.

## Phase 5 — Verification

Run tests, typecheck, lint. Render and confirm each page carries the full six-item nav, contains no placeholder token, and that no unmasked account number appears anywhere under `data/` or `notes/`.

## Phase 6 — Close

Agent review at the owner's chosen model, fix findings, delete this plan and the design spec, commit, move the ticket to Done.
