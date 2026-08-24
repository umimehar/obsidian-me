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

Personal finance second brain built from Wealthsimple's monthly PDF statements. A bun/TypeScript pipeline reads 220 statements into a masked datastore and an analytics payload, and a local React dashboard renders it.

The CSV pipeline that came before this was deleted on 2026-08-24, along with the single rendered `notes/index.html` page it built. It stated every figure at cost, because the transaction exports carry no market price. Keeping both meant two parsers answering the same question differently, which is the failure this rebuild exists to fix.

## What the statements give that the CSVs did not

Market value and market price per holding, with the exchange already resolved. Book cost, stated rather than derived. The month-end conversion rate, printed as `$1 USD = $1.421000 CAD`. Contributions split into first 60 days and rest of year, which is the split an RRSP deduction claim needs. The account type in plain text, rather than guessed from a filename.

Summing the eleven investment accounts from their June 2026 statements gives $241,739.67 against the app's $242,019.61. The $279.94 residual is one private-markets holding whose valuation was not final that month, not a missing account.

## Pages

- [[rrsp-room]], the RRSP deduction limit and available room from the latest notice of assessment, which is what the room bars measure against.

## The dashboard

`app/` is a Vite + React + TypeScript app, run locally, read only. Six hash-synced tabs: overview, growth, wrappers, tax, projections, reconciliation. Charts are hand-built SVG on `d3-scale` rather than a chart library.

Every figure is stated at market value and at book cost, both from the statements. Gain or loss is the difference, and it appears on every group card in all three lenses and on the portfolio headline: $241,739.67 against a book cost of $223,675.08, a gain of $18,064.59.

The projections tab runs thirty years forward over a ported copy of the old engine, with goal cards and a room runway table beside it. It is a scenario, not a forecast, and it says so on the page. The statutory endings are known, so the lines terminate for a stated reason: the FHSA stops at its $40,000 lifetime cap in 2028 and the account closes in 2039, the RESP fills $50,000 in 2044, and the CESG tops out at $6,650 of its $7,200 cap because the beneficiary ages out before the contributions that would claim the rest.

Reconciliation is a tab rather than a build failure. A wrong number that is visible beats a clean dashboard that is off with no way to find out why.

## Rebuild

Drop new PDF statements into the gitignored source directory, then from `app/`:

    bun run build

Regenerates `data/datastore.json`, `data/analytics.json`, and `data/reconciliation.json`. Source PDFs stay outside the vault; only masked derived data is committed, so account numbers and the owner's address never enter git history.

## Develop

    bun install        # once
    bun run check      # biome + tsc + bun test
    bun run contrast   # WCAG AA sweep in Chromium, both themes
    bun run dev        # the dashboard, locally

`bun run check` is the per-commit gate and runs in about ten seconds. `bun run contrast` needs a browser (`bunx playwright install chromium` once) and takes about fifteen; it renders the real app, drives every tab, both themes, all three overview lenses and a hover on every chart, then measures what is actually painted. Run it before shipping anything that changes a colour, a size or a weight.

Styling is Radix Themes. The real name list is `app/redactions.json`, gitignored; copy `redactions.example.json` and fill it in.
