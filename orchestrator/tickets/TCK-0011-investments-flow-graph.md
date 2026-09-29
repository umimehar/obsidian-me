---
title: "TCK-0011 — Money flow: graph, summary and goldens"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0011
status: claimed
project: system
ticket_type: feature
assigned_device: any
claimed_by: mac-studio
auto_ok: false
triage: manual
priority: p1
effort: medium
depends_on: [TCK-0010]
created_by: umar
session: 84ef9f69-04a1-4e04-b797-30b71ca694d2
---

# TCK-0011 — Money flow: graph, summary and goldens

## Goal

Turn `flows.json` into a balanced four column graph for any period, group by and account selection, plus the summary tiles' figures, with headline flows for 2025, 2026 and all time pinned in `data/goldens.json`.

## Acceptance criteria

- [ ] All eleven link rules and the mirror rule implemented as the plan states; the balance assertion throws naming the node
- [ ] Every month, every year and all time balance on the corpus for all five group bys (test)
- [ ] Summary, `missingAccounts` and `depositsByDestination` tested per rule
- [ ] Goldens gain `flows` computed by calling the production functions; the diff is read and the 2025, 2026 and all time headline recorded in the worklog
- [ ] An independent check that 2b74 2026-05 inflows equal that statement's own `paidIn.deposits`
- [ ] The five mutations in Task 5 Step 5 each go red and are restored with `git diff --quiet`
- [ ] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

## Context

Plan: `personal/investments/docs/superpowers/plans/2026-09-29-money-flow.md`, Ticket C (Task 5). Spec: `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read `personal/investments/CLAUDE.md` first. Owner decisions 2026-09-29: new Flow tab after This month, chequing is a hub node, PSA and savings ETFs are a cash equivalent node excluded from the invested rate.

## Worklog

- 2026-09-29 — Created from the money flow plan; owner asked to run it end to end with `/obsidian-loop`.
