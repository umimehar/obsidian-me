---
title: "TCK-0013 — Money flow: the Flow tab"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0013
status: done
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0012]
created_by: umar
session: 84ef9f69-04a1-4e04-b797-30b71ca694d2
---

# TCK-0013 — Money flow: the Flow tab

## Goal

A Flow tab after This month with period, group by and account controls, summary tiles, the Sankey, a destination chart, a flows table and a row drill down.

## Acceptance criteria

- [x] `#flow/<period>` round trips for year, month and range; malformed periods fall back to all time
- [x] Tiles match the goldens through `formatCurrency`/`formatShare`; `expectNoCoarseForm` over text and `aria-label` paths mutated independently
- [x] Unticking chequing turns payroll into Moved from another account; drill down rows carry no description
- [x] Narrow layout shows two ranked lists and no Sankey; missing statements named, never $0
- [x] `bun run contrast` sweeps the Flow tab, hovers the largest band and fails if none was hovered; AA pass on all nine tabs
- [x] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

## Context

Plan: `personal/investments/docs/superpowers/plans/2026-09-29-money-flow.md`, Ticket E (Tasks 8 and 9). Spec: `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read `personal/investments/CLAUDE.md` first. Owner decisions 2026-09-29: new Flow tab after This month, chequing is a hub node, PSA and savings ETFs are a cash equivalent node excluded from the invested rate.

## Worklog

- 2026-09-29 — Created from the money flow plan; owner asked to run it end to end with `/obsidian-loop`.
- 2026-09-29 — Implemented by a Sonnet subagent in `dadc371`, `6c571e9`, `d9251ec`, `e6b6ae5`, `6d44128`, `505c29c`, `f643375`. Note: `dadc371` alone does not typecheck (the tab id lands before its panel), so it is not a bisect point.
- 2026-09-29 — Review round 1 FAIL: Sankey labels painted at 9.93px, destination chart with no legend and 3.8px axis text on a phone, "US-$" signs, "−$0.00" tiles and an empty view for a year outside the corpus, about 150 tickers in the notes, figures split mid number at 390px, a clipped flows table, a drill down far off screen, a wrong account filter label, two casts. Round 2 FAIL: laying out at the measured width made labels collide below 1100px, the pinned readout hid the pinned node's label, HISU.U and PSU.U (a US savings fund and a US cash fund) counted as equities, a cramped phone drill down. Coordinator pre-review fix: the default view needed a horizontal scroll with the whole right column hidden; long names now wrap and the width estimate is calibrated in Chromium. Round 3 PASS.
- 2026-09-29 — Figures moved by classing HISU.U and PSU.U as cash equivalents: 2026 invested $144,508.82 → $144,420.23, left in cash −$18,285.69 → −$18,197.11; all time invested $226,201.98 → $226,113.40, left in cash $17,687.92 → $17,776.50; 2025 unchanged; rates unchanged at one decimal.
- 2026-09-29 — Gates: `bun run check` 1890 pass, 14 skip, 0 fail; `bun run build:ui` clean; `bun run contrast` AA pass on nine tabs, a flow band hovered in both themes. Measured: labels 12px, zero overlaps at 800, 1152 and 1440 across five group bys and three periods, no page horizontal scroll at any width.
- 2026-09-29 — Open with the owner: registry labels carry hyphens ("Non-registered 2c62", "TFSA (self-directed)") against the page prose rule; they are owner reviewed data shown on every tab.
