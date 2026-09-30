---
title: "TCK-0014 — Money flow: design pass"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0014
status: done
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
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

- [x] `/impeccable critique` findings recorded in the worklog and each addressed or explicitly declined with a reason
- [x] Radix Themes, jade accent, slate gray kept; no gradient, no new font; prose sentence case with no hyphens
- [x] `bun run check`, `bun run build:ui`, `bun run contrast` clean
- [x] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

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
- 2026-09-29 — Implemented by a Sonnet subagent in `108b528`, `f070548`, `be8170c`. The critique was done by hand against screenshots in both themes at 1152, 800 and 390px; the impeccable skill itself was not run interactively. Fixed: column 0 leader lines crossing their node, the tall contributions list (now one row below the tiles), a scroll hint when the Sankey scrolls in its own region, a windowed flows table and drill down with sticky headers and a measured "Scroll for more." hint, thinned month labels at 390px, and a destination chart palette whose closest pair is CIEDE2000 16.83 (an exhaustive search over every 8 colour set of the 17 Radix scales, jade, red and grays excluded because they carry meaning on this tab, found nothing better). `bun run contrast` now fails on any two intersecting Sankey labels, and on zero labels measured, at 1152, 800 and 660px plus 2026 by account at 800px.
- 2026-09-29 — Review round 1 FAIL (palette too close, table gave no sign it scrolled, expanded drill down untouched, `Sankey()` 114 lines, overlap guard could pass on nothing). Round 2 FAIL (the table estimated 33px rows against real 36px ones and hid the last row on short periods). Round 3 PASS: 12 periods at two widths, hint matched real overflow in every case.
- 2026-09-29 — Later, not blocking: uneven month label spacing after thinning; a gap when the contributions row wraps at 800px; no empty state message for a period with no flows (2023-06).
- 2026-09-29 — Gates: `bun run check` 1921 tests, 0 fail; `bun run build:ui` clean; `bun run contrast` AA pass, worst light 4.61, dark 7.50. No data or goldens changed.
