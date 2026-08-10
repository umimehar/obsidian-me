---
title: Government Tenders
tags: [personal/govt-tenders]
created: 2026-08-10
updated: 2026-08-10
status: active
type: personal
personal: govt-tenders
---

# Government Tenders

Bidding on Canadian public sector website and digital services work. Federal, provincial, municipal, academic.

## Pages

- [Market and strategy](notes/strategy.html) — what the market actually looks like, where the work lives, what disqualifies you before anyone reads your proposal.
- [Latest digest](notes/latest-digest.html) — the most recent scan, regenerated on every run.
- [[tracking]] — bids in flight, outcomes, qualification status.

## The one thing to know

The CanadaBuys search for "website" returns 242 open notices. Ten are about a website. The rest matched the word in body text and are snow removal, window cleaning and mosquito testing contracts. Never browse that search by hand.

## Digest

Monday, Wednesday and Friday at 08:12 local, by email. Built and scheduled by the `tender-digest` skill in the `dev` vault at `config/claude/skills/tender-digest/`.

    node ~/obsidian/obsidian-dev/config/claude/skills/tender-digest/run-digest.mjs gather   # print, send nothing
    node ~/obsidian/obsidian-dev/config/claude/skills/tender-digest/run-digest.mjs run      # send now

State lives in `data/`: `seen.json` is what has already been emailed, `runs.jsonl` is one line per run. Logs are at `~/Library/Logs/tender-digest/scan.log`.

## Where you actually bid

CanadaBuys mirrors the provincial systems but does not accept submissions for them. Every notice links out to its source portal. Register on all of these once:

| Portal | Covers |
|---|---|
| BC Bid | BC provincial, crowns, municipalities, universities |
| Alberta Purchasing Connection | Alberta provincial and municipal |
| MERX | mixed public sector, including Manitoba and some universities |
| bids&tenders | many Ontario and Atlantic municipalities |
| Biddingo | Ontario broader public sector |
| CanadaBuys with SAP Ariba | federal only |
