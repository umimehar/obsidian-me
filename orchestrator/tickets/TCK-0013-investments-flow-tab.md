---
title: "TCK-0013 — Money flow: the Flow tab"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0013
status: ready
project: system
ticket_type: feature
assigned_device: any
claimed_by: null
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

- [ ] `#flow/<period>` round trips for year, month and range; malformed periods fall back to all time
- [ ] Tiles match the goldens through `formatCurrency`/`formatShare`; `expectNoCoarseForm` over text and `aria-label` paths mutated independently
- [ ] Unticking chequing turns payroll into Moved from another account; drill down rows carry no description
- [ ] Narrow layout shows two ranked lists and no Sankey; missing statements named, never $0
- [ ] `bun run contrast` sweeps the Flow tab, hovers the largest band and fails if none was hovered; AA pass on all nine tabs
- [ ] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

## Context

Plan: `personal/investments/docs/superpowers/plans/2026-09-29-money-flow.md`, Ticket E (Tasks 8 and 9). Spec: `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read `personal/investments/CLAUDE.md` first. Owner decisions 2026-09-29: new Flow tab after This month, chequing is a hub node, PSA and savings ETFs are a cash equivalent node excluded from the invested rate.

## Worklog

- 2026-09-29 — Created from the money flow plan; owner asked to run it end to end with `/obsidian-loop`.
