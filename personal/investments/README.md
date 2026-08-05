---
title: Investments
tags: [personal/investments]
created: 2026-07-13
updated: 2026-08-05
status: active
type: personal
personal: investments
---

# Investments

> **Being rebuilt on PDF statements (started 2026-08-05).** The page described below is built from the transaction **CSVs** and states everything at cost, because those exports carry no market price. A replacement reading the monthly **PDF** statements is under construction in `app/`: it recovers market value, book cost, the month-end FX rate, the RRSP first-60-days split, and Wealthsimple's own money-weighted returns.
>
> Reconciled so far: summing the eleven investment accounts from their June 2026 PDFs gives $241,739.67 against the app's $242,019.61 — a 0.12% gap, explained as one private-markets holding whose valuation was not yet final that month.
>
> Design: [spec](docs/superpowers/specs/2026-08-04-investments-rebuild-design.md) · [phase 1 plan](docs/superpowers/plans/2026-08-04-investments-ingest.md)

Personal finance second brain built from Wealthsimple monthly statements. A bun/TypeScript pipeline turns the raw exports into a normalized datastore and renders one filter driven "Ledger" page.

## Page

- [The Ledger](notes/index.html) — a three pillar dashboard (Contributions and Room, Growth, Tax this year) plus a Detail section, scoped by a progressive account and date filter.
- [[rrsp-room]] — the RRSP deduction limit and available contribution room from the latest notice of assessment, which is what the room bar measures against.

The Ledger's fourth section projects thirty years forward: registered contributions, government grants, room remaining, and value at cost, with editable return and indexation rates. It is a scenario, not a forecast, and it says so on the page. The projection knows the statutory endings — the FHSA stops at its $40,000 lifetime cap and closes in 2039, the RESP stops at $50,000, the CESG at $7,200 — so the lines terminate for a stated reason rather than running flat for three decades.

The statements record what was paid, not what holdings are worth today, so every figure is stated at cost, never at market value. Growth shows net deposits, the true money put in including transfers, not just contributions coded to a registered account. It also shows portfolio at cost, the adjusted cost base plus cash, and the gain beyond deposits, which is portfolio at cost minus net deposits: a cost basis figure, not a market value gain. The Contributions and Room section still uses registered contributions on their own, since CRA contribution room is tracked against coded contributions, not net deposits. Inflow and outflow on the cash flow chart mean external money only, deposits and transfers in versus transfers and withdrawals out, not trading activity. The tax figures are a rough estimate for planning only, not for filing. The page is fully self contained: Chart.js and flatpickr are bundled into the HTML at build time, so it opens offline with no CDN calls.

## Rebuild

Drop new statement CSVs into the source directory, then from `scripts/`:

    bun run build

Regenerates `data/datastore.json`, `data/analytics.json`, and `notes/index.html`. Real account numbers are never stored; accounts show as kind, name, and a short id.

## Develop

    bun install        # once
    bun run check      # biome + tsc + bun test
    bun test           # tests only

The pipeline lives in `scripts/src/` and runs `parse` → `classify` → `mask` → `datastore` → `analytics` → `render`, driven by `build.ts`. `src/client/` is the browser code embedded in the page (filter, charts, sections); it is bundled at build time, not loaded from a CDN. Styling is `personal/_assets/personal.css` (hand maintained, self hosted fonts). The real name list is `scripts/redactions.json` (gitignored; copy from `redactions.example.json`).
