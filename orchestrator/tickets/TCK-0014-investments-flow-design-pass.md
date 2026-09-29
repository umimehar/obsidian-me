---
title: "TCK-0014 — Money flow: design pass"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0014
status: ready
project: system
ticket_type: feature
assigned_device: any
claimed_by: null
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0013]
created_by: umar
session: 84ef9f69-04a1-4e04-b797-30b71ca694d2
---

# TCK-0014 — Money flow: design pass

## Goal

An impeccable critique and polish pass over the Flow tab in both themes at 72rem and phone width.

## Acceptance criteria

- [ ] `/impeccable critique` findings recorded in the worklog and each addressed or explicitly declined with a reason
- [ ] Radix Themes, jade accent, slate gray kept; no gradient, no new font; prose sentence case with no hyphens
- [ ] `bun run check`, `bun run build:ui`, `bun run contrast` clean
- [ ] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

## Context

Carried from the TCK-0013 review, for this pass:
- `bun run contrast` should fail when two `[data-flow-label]` boxes intersect: the text width factor (`CHAR_WIDTH_FACTOR` 0.525 in `sankeyLayout.ts`) can drift with no test catching it, since happy-dom has no fonts.
- The contributions list under the Paid in tile makes the tile row tall and leaves the other tiles empty below their figure.
- The pinned band readout sits above the chart; check it reads well with the hover readout.
- At 800px the Sankey scrolls in its own region with no visible hint that it scrolls.
- The expanded drill down can list 1,057 rows; the flows table has 58 to 64 rows. Both are long for a summary view.
- The destination chart's month labels run together at 390px.


Carried from the TCK-0012 review: column 0 leader lines start at the node's right edge (`edgeX = n.x1` in `Sankey.tsx` `NodeLabels`) and cross the node; start them at `n.x0`.


Plan: `personal/investments/docs/superpowers/plans/2026-09-29-money-flow.md`, Ticket F (Task 10). Spec: `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read `personal/investments/CLAUDE.md` first. Owner decisions 2026-09-29: new Flow tab after This month, chequing is a hub node, PSA and savings ETFs are a cash equivalent node excluded from the invested rate.

## Worklog

- 2026-09-29 — Created from the money flow plan; owner asked to run it end to end with `/obsidian-loop`.
