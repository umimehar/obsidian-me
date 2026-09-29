---
title: "TCK-0010 — Money flow: classify rows and pair transfers"
tags: [ticket, project/system, type/feature, personal/investments]
created: 2026-09-29
updated: 2026-09-29
type: ticket
id: TCK-0010
status: done
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

- [x] Chequing months with BROKERAGE and CASH count once (fixture test)
- [x] Every rule in the plan's Task 2 table has a test, including the throws for an unknown code and a nonzero LOAN
- [x] `matchTransfers` pairs exact dates first then up to 3 days, never within one account, never across currencies, one to one
- [x] Every cash block in the corpus has residual 0 (test), and `flows.json` carries no description (test) and is current against the datastore (test)
- [x] `bun run check`, `bun run build:ui` clean; mutation proofs from Tasks 3 and 4 recorded in the worklog
- [x] Reviewed by an Opus subagent that recomputes the flows it touches from `data/datastore.json` independently and mutation tests the code; up to 3 review rounds, then human review

## Context

Plan: `personal/investments/docs/superpowers/plans/2026-09-29-money-flow.md`, Ticket B (Tasks 2 to 4). Spec: `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read `personal/investments/CLAUDE.md` first. Owner decisions 2026-09-29: new Flow tab after This month, chequing is a hub node, PSA and savings ETFs are a cash equivalent node excluded from the invested rate.

## Worklog

- 2026-09-29 — Created from the money flow plan; owner asked to run it end to end with `/obsidian-loop`.
- 2026-09-29 — Implemented by a Sonnet subagent in `e6e4507`, `da6eb76`, `f032db8`, `5e9d4a5`. flows.json: 7,402 rows, 704 movement rows, 249 pairs (0 lagged), 206 unpaired legs, 255 cash blocks, all with residual 0, 1.93 MB. Asset class table seeded from the datastore: WSE401, WSE401P, WSE300P private markets; ZAG, ZFL, ZCS, ZCB, ZHY, ZUAG.F fixed income; PSA and savings ETFs cash equivalents; BTC, ETH crypto.
- 2026-09-29 — Opus review round 1 FAIL: all 15 crypto BUY rows ($1,300.39) had an empty symbol because their descriptions read "Purchase of ... BTC", so they would have shown as equities. Fixed with a fallback pattern; also out legs now try transfer codes before WD, so 2b74's 2026-01-14 TRFOUT −700 pairs instead of the same day WD. Round 2 PASS: independent reclassification of all 7,402 rows and repairing match exactly; 16 reviewer mutations, all red except narrowing the crypto pattern to "Purchase" only (no "Sale of" row exists in the corpus; a fixture test is added in TCK-0011).
- 2026-09-29 — Unpaired legs treated as crossing the Wealthsimple boundary: 156 in, +$253,609.43; 50 out, −$15,088.08. Largest: 2b74 payroll (AFT_IN $28,249.99, DEP override $30,550.47, CASH payroll $12,406.00), 8cd3 outside bank $63,666.00, corporate business $55,000.00, d77c and 9710 early TFSA contributions $15,961.62, e2ec FHSA $15,000.00. Two that may be internal, left unpaired by the rule: 8cd3 TRFOUTTF −200 on 2026-01-21 against 2b74 CONT +200 on 2026-01-15 (six days, credit first); d77c −$1,030.75 on 2023-07-14.
- 2026-09-29 — Browser note for the next ticket: `classify.ts` imports `registry.ts`, which loads `mask.ts` and `node:crypto`; UI code must import only `flows/types.ts`, `assetClass.ts` and the pure graph modules.
- 2026-09-29 — Gates: `bun run check` 1689 pass, 14 skip, 0 fail; `bun run build:ui` clean.
