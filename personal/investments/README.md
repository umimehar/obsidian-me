---
title: Investments
tags: [personal/investments]
created: 2026-07-13
updated: 2026-07-20
status: active
type: personal
personal: investments
---

# Investments

Personal finance second brain built from Wealthsimple monthly statements. A bun/TypeScript pipeline turns the raw exports into a normalized datastore plus live prices, and renders one filter driven "Ledger" page.

## Page

- [The Ledger](notes/index.html) — a three pillar dashboard (Contributions and Room, Growth, Tax this year) plus a Detail section, scoped by a progressive account and date filter.

The tax figures are a rough estimate for planning only, not for filing. The page is fully self contained: Chart.js and flatpickr are bundled into the HTML at build time, so it opens offline with no CDN calls.

## Rebuild

Drop new statement CSVs into the source directory, then from `scripts/`:

    bun run build

Regenerates `data/datastore.json`, `data/analytics.json`, `data/prices.json`, and `notes/index.html`. Real account numbers are never stored; accounts show as kind, name, and a short id.

## Develop

    bun install        # once
    bun run check      # biome + tsc + bun test
    bun test           # tests only

The pipeline lives in `scripts/src/` and runs `parse` → `classify` → `mask` → `datastore` → `analytics` → `prices` → `render`, driven by `build.ts`. `prices.ts` fetches live market prices for held symbols from the Yahoo Finance chart endpoint, caching the last known price in `data/prices.json` and falling back to cost basis when a live quote is unavailable. `src/client/` is the browser code embedded in the page (filter, charts, sections); it is bundled at build time, not loaded from a CDN. Styling is `personal/_assets/personal.css` (hand maintained, self hosted fonts). The real name list is `scripts/redactions.json` (gitignored; copy from `redactions.example.json`).
