---
title: "TCK-0012 — Money flow: Sankey layout and chart"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0012
status: claimed
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

- [ ] `layoutSankey` tests: shared scale, widths sum to node heights, labels at least 28 apart and inside the box, spanning links
- [ ] Node labels and link names each from one formatter call; tooltip text equals `aria-label`
- [ ] Enter and Space pin a band, Escape clears; accessible summary lists the five largest flows
- [ ] No new dependency; `bun run check`, `bun run build:ui` clean; mutation proofs recorded
- [ ] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

## Context

Plan: `personal/investments/docs/superpowers/plans/2026-09-29-money-flow.md`, Ticket D (Tasks 6 and 7). Spec: `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read `personal/investments/CLAUDE.md` first. Owner decisions 2026-09-29: new Flow tab after This month, chequing is a hub node, PSA and savings ETFs are a cash equivalent node excluded from the invested rate.

## Worklog

- 2026-09-29 — Created from the money flow plan; owner asked to run it end to end with `/obsidian-loop`.
