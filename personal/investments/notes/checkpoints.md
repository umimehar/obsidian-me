---
title: App checkpoints, and what they are for
tags: [personal/investments, reference]
created: 2026-08-31
updated: 2026-10-01
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

### Reconciled against 2026-08, on 2026-09-26

It matches. The 2026-08 statements total $250,450.58 against the $250,543.54 visible in the app, $92.96 apart (0.04%), and every account is within 0.3%.

The gap is pricing, not parsing. The statements price several ETFs a few cents away from the 2026-08-31 closing trade, and the app values at the close. Repricing every holding at that day's close explains the new business account to the cent (HXQ $117.33 on the statement, $117.54 at the close, times 23 shares is the whole $4.83) and the FHSA to within two cents. What remains elsewhere is $12.17 or less, which the app's live exchange rate would move on the accounts holding USD.

Both earlier gaps are closed. The second business account is `8297`, opened 2026-08-24, now registered as Corporate. The RRSP group matches this project's two counted RRSP accounts to $1.94, with the spousal account outside both. The per-account table is in `checkpoints.json` under `reconciliation`.

WSE401 is priced at $10.23 on the August statement, still flagged pending. The June reconciliation predicted a finalised NAV of $10.2254 from the $279.94 residual.

## 2026-09-26, 22:22

The RRSP group only: $39,738.35 across three accounts, at the Friday 2026-09-25 close. Not yet comparable to anything, because the corpus ends at 2026-08.

It settles what the app's three RRSP accounts are. The owner's RRSP ($18,743.25) and the Private Market Fund ($20,995.10) make up the group total to the cent. The spouse's RRSP ($19,109.65) is listed beside them and left out of the total, which is how this project treats `97ab`. There is no empty third account.

The Private Market Fund is `d6d9`. Its statements call it "Managed RRSP Account", which is why it was labelled "RRSP (managed)" until 2026-09-26; it is labelled after the app now.

## 2026-10-01, evening

The app's own headline this time, $268,461.48 (+$29,516.10, +12.35% this year; +$34,328.33, +14.66% all time), plus all seven groups and the cross account Holdings table for 12 symbols, at the 2026-10-01 close. The headline includes chequing: the seven groups sum to $268,126.43, and adding chequing's $338.26 lands within $3.21 of it. Compare this project's total against $268,126.43. The app's Household net worth, $257,368.28, sits $11,093.20 below its own headline and is not explained yet. Recorded against 2026-09 because that is the owner's intent, but it is one trading day after the September statements, so expect a day of price and FX movement in every account.

Two things will differ from the September statements for a known reason. 2c62 sold all its GOLD on 2026-10-01; the statement carries GOLD at its Sep 30 price where the app shows $4,432.46 of pending cash. And any payroll deposit or recurring buy dated 2026-10-01 is in the app and not in a statement that ends Sep 30.

The Holdings table prints USD rows in USD (CHPX 9.8491 at $102.16 is $1,006.18), so compare those against the statement's USD market value, not its CAD total.

Also visible here and worth checking on import: PSA has left the TFSA, Loblaw has left the FHSA, and 2c62 no longer holds META, L or QQC.
