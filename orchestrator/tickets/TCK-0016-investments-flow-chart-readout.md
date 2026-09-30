---
title: "TCK-0016 — Money flow: taller chart and a structured band readout"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0016
status: in-progress
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0015]
created_by: umar
session: 84ef9f69-04a1-4e04-b797-30b71ca694d2
---

# TCK-0016 — Money flow: taller chart and a structured band readout

## Goal

The Flow Sankey is about 640px tall at desktop width, and hovering or focusing a band shows a structured readout card instead of the two line sentence box.

## Acceptance criteria

- [ ] At 72rem the Sankey's height is at least 640px for the default view (2026, account type); denser group bys may grow taller as today; the narrow fallback is unchanged
- [ ] The readout card, owner approved layout: a row with the band's colour swatch and "Source → Destination"; the amount large; "N% of all money in"; a divider; "N% of <source>" and "N% of what reached <destination>"; "N statement rows · click to see them" (or "From the statements' cash balances" for cash and unreconciled bands)
- [ ] Every figure from one formatCurrency or formatShare call; the band's aria-label and the live announcement carry the same strings as the card, in the same order
- [ ] The card never covers the hovered band's two node labels and stays inside the chart region and the viewport, flipping side near edges; keyboard focus on a band shows the same card
- [ ] Both themes: Radix tokens only (panel background, shadow, gray text steps, the band's own colour for the swatch); `bun run contrast` measures the card's text and passes AA
- [ ] `bun run check`, `bun run build:ui`, `bun run contrast` clean
- [ ] Reviewed by an Opus subagent; up to 3 review rounds, then human review

## Context

Owner request 2026-09-29 after seeing the live tab: the chart felt short (420px) and the readout plain. Owner chose the structured card over a compact two line box, and about 640px over 800px or a node count formula. Share of source is the band's value over its source node's value; share of destination is over the destination node's value.

Also carried from the TCK-0015 review: a failing `toBeNull()` on a rendered Flow tab dumps the whole page (a 105 MB log that looks like a hang) despite `DEBUG_PRINT_LIMIT`; make such assertions readable (for example `expect(el === null).toBe(true)`) or fix the limit so failures stay short.

## Worklog

- 2026-09-29 — Created at the owner's request; queued after TCK-0015, which touches the same tab.
