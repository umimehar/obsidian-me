---
title: "Business vehicle info database — design"
tags: [personal/business-vehicle, spec]
created: 2026-08-19
updated: 2026-08-19
status: active
type: spike
personal: business-vehicle
---

# Business vehicle info database — design

## Purpose

One place that answers, without opening a PDF: what this vehicle costs the company per month, what is covered and until when, what is due next, and what is still outstanding on the insurance shopping decision. Scope covers the current 2026 Mercedes-Benz GLC 43 AMG and every leased vehicle before or after it.

## Architecture

`data/vehicle.json` is the single source of truth. Every fact extracted from the source documents lands there once. A Bun script in `scripts/` reads that file and renders six static HTML pages into `notes/`, each linking the shared stylesheet at `../../_assets/personal.css`. Nothing is fetched at view time; the data is inlined at render time, so the pages open from the filesystem and inside Obsidian.

Rejected alternatives: a single dashboard page (the insurance comparison alone needs three tables and would drown the rest), and one page per source document (mirrors the filing cabinet rather than the questions actually asked).

## Data model

Top level keys in `data/vehicle.json`:

- `meta` — schema version, generation timestamp, source document manifest with a `sensitive` flag per file
- `parties` — driver, corporation, lessor, dealer, insurer, brokers
- `fleet[]` — one entry per leased vehicle, `status: current | returned | ordered`. Each carries `identity`, `lease`, `protection[]`, `insurance[]`, `service[]`
- `insuranceShopping` — brokers contacted, quotes received, coverage comparison, open questions, next actions
- `compliance` — business versus personal use, mileage, HST and CCA treatment

`fleet[]` is an array from day one so the history page needs no reshaping when an earlier or later vehicle is added.

## Pages

Six pages in `notes/`, every one carrying the same header nav listing all six with the current page marked:

| File | Answers |
|---|---|
| `index.html` | Monthly cost of the vehicle, what is due next, what is outstanding |
| `lease.html` | Term, payments, residual, buyout, end of lease exposure, FCLP waiver limits |
| `insurance.html` | 2025-26 versus 2026-27 line by line, endorsement glossary, broker tracker, quote scorecard, open questions |
| `service.html` | Invoice history, prepaid maintenance drawdown, warranty windows, next service due |
| `compliance.html` | Business use percentage, mileage, HST/ITC and CCA treatment |
| `fleet-history.html` | Every leased vehicle, current and returned |

## Masking

Source PDFs are committed unmasked at the owner's explicit instruction. Everything derived from them masks bank, PAD, and finance account numbers to their last four digits (`****1234`), per the vault's sensitive information policy. The renderer carries no unmasking path.

## Testing

Render helpers are unit tested before the templates exist: currency formatting, date arithmetic, prepaid maintenance drawdown, lease month countdown, and the nav builder that marks the current page. The build is verified by rendering all six pages and asserting each contains the full nav and no placeholder tokens.

## Out of scope

Any live data feed, any quote received after 2026-08-19, and prior leased vehicles, for which no documents exist yet. The schema holds their shape; the data arrives later.
