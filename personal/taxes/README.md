---
title: "Taxes — 15248132 Canada Inc. (XYZ Bytes) and personal"
tags: [personal/taxes]
created: 2026-09-23
updated: 2026-10-07
status: active
type: personal
personal: taxes
---

# Taxes

Corporate tax for 15248132 Canada Inc. (o/a XYZ Bytes, BN 795920958) and personal tax for Umar, from incorporation on 14 August 2023 onward. This folder is the source of truth for every figure, decision, deadline and event. The receipts, statements and slips themselves stay in `~/Documents/Taxes`, the evidence store. Nothing there is ever deleted.

## Pages

Open the HTML in a browser. Links to evidence files use `file://`, which Obsidian's own viewer may block.

- [Where things stand](notes/index.html). The three tax clocks, what needs doing and by whom, coming deadlines. **Start here.**
- [Timeline](notes/timeline.html). Everything that happened, newest first, filterable by corporation or personal.
- [Year by year](notes/year-2026.html). One page per calendar year: the story, the returns, the numbers, the paperwork.
- [Returns filed](notes/filings.html). Every T2, HST, T1, T4 and remittance, with the lines on each.
- [Rules we follow](notes/rules.html). Decisions in force, such as home office rent at 30% and the Mercedes at 80%, and what each replaced.
- [People](notes/people.html). The corporation's identifiers, accountants, clients, staff.
- [Documents](notes/documents.html). Searchable list of every file in `~/Documents/Taxes`.
- [Glossary](notes/glossary.html). Tax words in plain language.
- [[tracking]]. Deadlines and open items as a checklist.
- [[log/2026-09-23]], [[log/2026-10-07]]. Session logs.

## How it is organised

```
personal/taxes/
├── README.md            this index
├── tracking.md          deadlines and open items, markdown checklist
├── log/                 one note per working session
├── data/                the datastore, the only place to edit facts
│   ├── meta.json        identifiers and the overview's opening text
│   ├── timeline.json    every dated event, with sources
│   ├── decisions.json   rules; a newer rule on the same subject supersedes the old one
│   ├── filings.json     every return and remittance
│   ├── years/YYYY.json  one file per calendar year (story and figures)
│   ├── open-items.json  what is waiting and on whom
│   ├── entities.json    people and organisations
│   ├── glossary.json    plain definitions, auto-linked on every page
│   └── documents.json   generated catalog of ~/Documents/Taxes (do not edit)
├── notes/               generated HTML pages (do not edit)
├── scripts/             the renderer and the catalog builder (bun + TypeScript)
└── workpapers/          the former ~/Documents/Taxes/_claude_workspace: working notes,
                         parsed statements, Python parsers, reports, emails, payroll
```

## Updating

```
cd scripts
bun install
bun run catalog     # after adding files to ~/Documents/Taxes
bun run build       # after editing anything in data/; refuses to build on bad data
bun run check       # lint, typecheck, tests, and the identifier leak scan
uv run --with openpyxl python sync_workpapers.py   # copy _claude_workspace in, masked
```

Adding a year: create `data/years/2027.json` and add its returns to `filings.json`. The year page, the nav and the three clocks pick it up.

Changing a rule: add a new entry to `decisions.json` with the same `subject` and mark the old one `"status": "superseded"` with `superseded_by`. The build refuses two active rules on one subject. Never delete the old one; the history is the point.

Every fact carries `sources`: a path relative to `~/Documents/Taxes`, `session:<uuid>` for a Claude session, `memory:<file>`, or `vault:<path>`.

## Masking

SINs are stored as `****`. Card and bank account numbers keep the last four digits only. The BN, HST and payroll account numbers stay in full because they are business identifiers. The unmasked originals stay in `~/Documents/Taxes`.

Two checks enforce this. `bun run build` refuses SIN-shaped numbers in `data/`. `bun run leaks` (part of `bun run check`) scans every file under this folder, xlsx cells included, for card numbers (by Luhn checksum, also inside bank transfer references), account numbers, SIN-shaped numbers, and any value listed in `scripts/.known-identifiers`. That file holds the real SINs and account numbers, is gitignored, and exists only on the device that created it; create it on a new device before relying on the scan.

## Workpapers

`workpapers/` is a masked copy of `~/Documents/Taxes/_claude_workspace`, made by `scripts/sync_workpapers.py`. As of 7 October 2026 another session still works in `_claude_workspace` (the Mercedes personal-use memo), so rerun the sync after changes there; it is safe to repeat. Changes made in the vault copy:

- SINs, card numbers (including the ones embedded in `TF000…` transfer references) and the chequing number are masked, in text files and in xlsx cells.
- The debit statement parser matches any BMO account number shape instead of the hardcoded one. Its output is byte-identical on the 2026 statements.
- The receipt scripts read parsed data from `workpapers/` instead of `_claude_workspace`.
- Those scripts are listed in `VAULT_OWNED` in the sync script, which never overwrites them.

Read `workpapers/INDEX.md` with care: its "T2 2025 filed" table carries Claude's pre-filing reconciliation, not the filed return. The filed figures are on [Returns filed](notes/filings.html).

## Related

- [[personal/business-vehicle/README|business-vehicle]]. The corporate Mercedes lease, business use and lease HST.
- [[personal/investments/README|investments]]. RRSP, TFSA, FHSA and the corporate investment account.
