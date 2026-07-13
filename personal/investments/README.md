---
title: Investments
tags: [personal/investments]
created: 2026-07-13
updated: 2026-07-13
status: active
type: personal
personal: investments
---

# Investments

Personal finance and investments second brain built from Wealthsimple monthly statements. A reusable pipeline masks the raw exports into a normalized datastore and renders analysis pages.

## Pages

- [Overview](notes/index.html)
- [Growth](notes/growth.html)
- [Contributions](notes/contributions.html)
- [Cash flow](notes/cash-flow.html)
- [Income](notes/income.html)
- [Holdings](notes/holdings.html)

## Rebuild

Drop new statement CSVs into the source directory, then from `scripts/`:

    uv run python build.py

Regenerates `data/datastore.json`, `data/analytics.json`, and the pages. Real account numbers are never stored; masked ids only.
