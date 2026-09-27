---
title: App checkpoints, and what they are for
tags: [personal/investments, reference]
created: 2026-08-31
updated: 2026-08-31
status: active
type: reference
personal: investments
---

# App checkpoints

A checkpoint is a reading taken off the Wealthsimple app's own screen on a given date, recorded before the matching statements exist. The data lives in `data/checkpoints.json`; this note says why.

Everything else in this project is derived from PDF statements. That makes the whole pipeline one long chain of inference from one source, and a chain like that can be internally consistent and still wrong. A checkpoint is the outside number: it comes from Wealthsimple rather than from any parsing this project does, so it is the one figure a parsing defect cannot also move.

Checkpoints are never an input. Nothing reads `checkpoints.json` into the build, and no figure on the dashboard comes from it. It exists to be compared against.

## Reconciling one

When the statements for a checkpoint's period arrive:

1. Import them (`bun run build && bun run analytics && bun run goldens`).
2. Compare the checkpoint's group figures against the same period's, mapping the app's grouping onto the account lens first. The app's grouping is not the registration lens, and a naive group-by-group comparison double counts Crypto.
3. Work through the entry's `openQuestions`. Each one names what to check, not what the answer is.
4. Set `reconciledAgainst` to the period, and write what the gap turned out to be.

A checkpoint that reconciles is worth as much as one that does not. It is the only evidence the pipeline's totals match reality rather than merely matching each other.

## 2026-08-31, 16:57

Seven groups totalling $250,543.54, part way through August 2026. The corpus ends at 2026-07, so this is a month ahead of it and the two are not the same date.

Two gaps are already visible and neither is explained yet.

The RRSP group reads $38,339.64 across three accounts against this project's $52,634.47 at 2026-07, also three accounts. That is $14,294.83 in a month, which market movement does not cover. Dropping the spousal RRSP from this project's side leaves $36,816.20, still $1,523.44 off, so "the app counts the spousal account elsewhere" does not explain it on its own.

Business investing shows two accounts where this project tracks one. The larger, $55,067.47, is plausibly the tracked corporate account after a month. The smaller, $5,038.29 at +0.77% all time, looks like an account no statement has ever arrived for.

Account names are masked in the JSON the same way every other name in this project is. The `(self)` qualifier on the second business account is kept, because it is what tells the two apart.
