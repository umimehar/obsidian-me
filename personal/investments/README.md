---
title: Investments
tags: [personal/investments]
created: 2026-07-13
updated: 2026-07-14
status: active
type: personal
personal: investments
---

# Investments

Personal finance second brain built from Wealthsimple monthly statements. A bun/TypeScript pipeline turns the raw exports into a normalized datastore and renders one filter-driven "Ledger" page.

## Page

- [The Ledger](notes/index.html) — filter by account and date across every figure and chart.

## Rebuild

Drop new statement CSVs into the source directory, then from `scripts/`:

    bun run build

Regenerates `data/datastore.json`, `data/analytics.json`, and `notes/index.html`. Real account numbers are never stored; accounts show as kind, name, and a short id.

## Develop

    bun install        # once
    bun run check      # biome + tsc + bun test
    bun test           # tests only

The pipeline lives in `scripts/src/` (`parse` → `classify` → `mask` → `datastore` → `analytics` → `render`, driven by `build.ts`). `src/ledger.js` is the browser client embedded in the page. Styling is `personal/_assets/personal.css` (hand-maintained, self-hosted fonts). The real name list is `scripts/redactions.json` (gitignored; copy from `redactions.example.json`).
