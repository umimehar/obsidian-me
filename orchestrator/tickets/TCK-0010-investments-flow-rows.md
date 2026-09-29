---
title: "TCK-0010 — Money flow: classify rows and pair transfers"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0010
status: claimed
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0009]
created_by: umar
session: 84ef9f69-04a1-4e04-b797-30b71ca694d2
---

# TCK-0010 — Money flow: classify rows and pair transfers

## Goal

Every statement row that moves cash becomes a masked flow row with a category, transfers between the owner's accounts are paired, every cash block reconciles, and `bun run analytics` writes `data/flows.json`.

## Acceptance criteria

- [ ] Chequing months with BROKERAGE and CASH count once (fixture test)
- [ ] Every rule in the plan's Task 2 table has a test, including the throws for an unknown code and a nonzero LOAN
- [ ] `matchTransfers` pairs exact dates first then up to 3 days, never within one account, never across currencies, one to one
- [ ] Every cash block in the corpus has residual 0 (test), and `flows.json` carries no description (test) and is current against the datastore (test)
- [ ] `bun run check`, `bun run build:ui` clean; mutation proofs from Tasks 3 and 4 recorded in the worklog
- [ ] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

## Context

Plan: `personal/investments/docs/superpowers/plans/2026-09-29-money-flow.md`, Ticket B (Tasks 2 to 4). Spec: `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read `personal/investments/CLAUDE.md` first. Owner decisions 2026-09-29: new Flow tab after This month, chequing is a hub node, PSA and savings ETFs are a cash equivalent node excluded from the invested rate.

## Worklog

- 2026-09-29 — Created from the money flow plan; owner asked to run it end to end with `/obsidian-loop`.
