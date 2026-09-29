---
title: "TCK-0012 — Money flow: Sankey layout and chart"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0012
status: done
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0011]
created_by: umar
session: 84ef9f69-04a1-4e04-b797-30b71ca694d2
---

# TCK-0012 — Money flow: Sankey layout and chart

## Goal

A hand rolled Sankey layout and an accessible, keyboard operable Sankey component in the app's design language.

## Acceptance criteria

- [x] `layoutSankey` tests: shared scale, widths sum to node heights, labels at least 28 apart and inside the box, spanning links
- [x] Node labels and link names each from one formatter call; tooltip text equals `aria-label`
- [x] Enter and Space pin a band, Escape clears; accessible summary lists the five largest flows
- [x] No new dependency; `bun run check`, `bun run build:ui` clean; mutation proofs recorded
- [x] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

## Context

Plan: `personal/investments/docs/superpowers/plans/2026-09-29-money-flow.md`, Ticket D (Tasks 6 and 7). Spec: `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read `personal/investments/CLAUDE.md` first. Owner decisions 2026-09-29: new Flow tab after This month, chequing is a hub node, PSA and savings ETFs are a cash equivalent node excluded from the invested rate.

## Worklog

- 2026-09-29 — Created from the money flow plan; owner asked to run it end to end with `/obsidian-loop`.
- 2026-09-29 — Implemented by a Sonnet subagent in `ddd055f`, `9b936c4`, `a02c1e8`, `a3f0243`. Hand rolled layout, no new dependency.
- 2026-09-29 — Review round 1 FAIL on legibility: labels drawn on the bands with both margins empty, column 2 and 3 labels printing over each other, the bottom row clipped, nodes overflowing the box through the minimum height floor, a holding view 18,084 units tall (411 holdings), tab order not by column, five untested behaviours. Round 2 PASS: two line labels in the margins with a halo, leader lines for displaced labels, holdings capped at the 12 largest plus Other holdings (rowIds and values proven equal to the uncapped union), Chromium measured zero overlaps and zero out of bounds labels in 2026 by account type, 2026 by account, all time by holding and the latest month, both themes. 17 reviewer mutations, all red.
- 2026-09-29 — Carried to TCK-0014: column 0 leader lines start at the node's right edge and cross the node.
- 2026-09-29 — Gates: `bun run check` 1784 pass, 14 skip, 0 fail; `bun run build:ui` clean.
