---
title: Lessons from giving investment and tax advice
tags: [personal/investments, reference]
created: 2026-10-02
updated: 2026-10-02
status: active
type: reference
personal: investments
---

# Lessons from giving investment and tax advice

One rule per mistake, each caught by the owner or by review on 2026-10-01. Endeavor scoped, so they live here rather than in `knowledge/lessons.md`.

### get this year's income before any bracket or deduction math (2026-10-02)

Why:
- The notice of assessment describes last year. Its 18% room figure implied $142,006 of 2025 income, which produced a $25,000 RRSP deduction sweet spot. The 2026 pay stub ($170,275 by Sep 30, about $235,000 for the year) moved it to $53,500.

ALWAYS ask for the current year's pay stub or expected income before recommending a deduction amount, a bracket target or a T1213. State the income figure the advice rests on.

### look up the fee schedule of the exact account type (2026-10-02)

Why:
- I applied the self directed USD account's 1.5% conversion fee to direct indexing. Direct indexing is CAD funded and converts at 0% to 0.05%, so the advice to use Norbert's gambit was wrong.

NEVER carry a fee from one Wealthsimple product to another. Search the product's own page (direct indexing, Automated Investing, self directed, managed) before quoting a cost.

### check room before routing money to a registered account (2026-10-02)

Why:
- I suggested buying gold in the TFSA. The TFSA was maxed for 2026, which `data/analytics.json` `rooms.2026` already said (used 7,000 of 7,000).

ALWAYS read `rooms.<year>` for the TFSA, RRSP and FHSA before suggesting a purchase or transfer into one.

### recompute a subagent's tax figure from the statements before trusting it (2026-10-02)

Why:
- The first build of the tax tabs passed every gate and still carried three defects: book cost already in CAD converted a second time ($37,765.51 shown as $52,365.66), the superficial loss rule checked one of its two conditions (112 flags, really 31), and $5,590.06 of conversion volume presented as a cost. Each was found by recomputing one figure by hand from `data/datastore.json`.

ALWAYS spot check at least one headline figure per new tax section against the raw statements before calling it done; a green suite proves the code agrees with its own tests, not with the CRA.

Related: [[2026-10-01-allocation-and-rrsp-plan]] · [[README]]
