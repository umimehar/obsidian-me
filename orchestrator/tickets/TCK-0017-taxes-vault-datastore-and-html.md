---
title: "TCK-0017 — Taxes endeavor: datastore, timeline, document catalog and HTML pages"
tags: [ticket, project/system, type/feature, personal/taxes]
created: 2026-10-07
updated: 2026-10-07
type: ticket
id: TCK-0017
status: review
project: system
ticket_type: feature
assigned_device: any
claimed_by: personal-macbook
auto_ok: false
triage: manual
priority: p1
effort: large
depends_on: []
created_by: umar
session: 8e9c47d2-227a-4e86-bde2-7e06ae3d8f65
human_review_required: true
---

# TCK-0017 — Taxes endeavor: datastore, timeline, document catalog and HTML pages

## Goal

`personal/taxes` becomes the single source of truth for every corporate (15248132 Canada Inc., o/a XYZ Bytes) and personal tax fact, decision and event from incorporation (2023-08-14) to today, readable as styled HTML. Receipts, invoices and statements stay in `~/Documents/Taxes` as the evidence store; the vault catalogs every file and links to it.

## Owner decisions (2026-10-07)

- Evidence files (839 MB, 1,047 files) stay in `~/Documents/Taxes`. The vault holds data, history and HTML, plus a catalog of every file with a `file://` link.
- Board and tickets for tax work. Placed at `personal/taxes` with central board tickets, per the vault rule that `projects/` is for code.
- SIN masked as `****`. BN and HST account numbers kept in full. Bank and card account numbers masked.
- Vault becomes the source of truth. `_claude_workspace` notes, parsed data, scripts and reports move into the vault. `~/Documents/Taxes/CLAUDE.md` becomes a short pointer. Nothing in `~/Documents/Taxes` is deleted.

## Acceptance criteria

- [x] `data/` JSON datastore: entities, filings, years, timeline, decisions (with supersession), open items, document catalog
- [x] Every fact in `~/Documents/Taxes/CLAUDE.md`, `_claude_workspace/**/*.md`, the existing taxes log, the four Claude session transcripts and the Claude project memory is captured or deliberately recorded as superseded
- [x] Document catalog covers every file under `~/Documents/Taxes` (count matches `find`), with category, year and link
- [x] Renderer (bun + TS, same pattern as business-vehicle) builds every HTML page from `data/`; `bun run check` clean
- [x] HTML pages on `personal/_assets/personal.css`, readable at phone width (the shared Ledger stylesheet is light only; no dark theme added)
- [x] `_claude_workspace` migrated into the vault with masking applied; no unmasked SIN or bank account numbers in the diff
- [x] Thin `README.md`, `tracking.md`, today's log; `hot.md` updated
- [x] Reviewed by an Opus subagent

## Context

Owner request 2026-10-07: keep all tax history, timeline and data in the vault for personal and corporate taxes, structured to scale year over year, HTML-first.

## Worklog

- 2026-10-07 — Created at the owner's request.
- 2026-10-07 18:15 — Claim and start landed in one commit (2e1ec98): the claim commit hit a transient index.lock from the obsidian-git plugin.
- 2026-10-07 18:40 — Four extraction agents (transcripts, written notes, official PDFs, spreadsheets) and a curator built data/; disputes checked against bank statements.
- 2026-10-07 18:55 — Opus review: ~60 figures tie to sources. Found a full card number inside TF000 transfer references and the chequing number in an xlsx (uncommitted); fixed with scripts/sync_workpapers.py and a leak scan in bun run check. A parallel session (f6541557) added the Mercedes personal-use offset; folded in (owed to Umar $16,111.98, 2026 gap ~$4,743).
- 2026-10-07 19:05 — Owner asked for a lighter UX; answer-first pass on every page (overview 3,640px to ~1,400px, To do page, folded detail, clocks explain a return in place).
- 2026-10-07 19:10 — Evidence: `bun run check` → biome clean, tsc clean, 53 pass 0 fail, "no SINs, card or account numbers found"; `bun run build` → 13 pages; catalog 991 files; no page scrolls sideways at 390px. Feature commit c400708. Human review: open personal/taxes/notes/index.html.
