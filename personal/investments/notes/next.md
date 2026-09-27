---
title: Parked work
tags: [personal/investments, reference]
created: 2026-08-31
updated: 2026-08-31
status: active
type: reference
personal: investments
---

# Parked work

Things deliberately not done, with enough context to pick each one up cold. Delete an entry when it ships.

## Spouse accounts, and what they change

The owner said on 2026-08-31 that his spouse's accounts are coming. That is not just more accounts: it changes what a portfolio total means, and three parked items below all resolve differently once it lands. Do those together, not before.

Today the model has exactly one owner. `EXCLUDED_KINDS` holds `SpousalRRSP` out of the total because the owner contributes to it but does not own it, and that is the only concession to a second person anywhere in the pipeline. There is no notion of whose account an account is.

The decision to make first, before writing anything: does the dashboard report **one person's** net worth with the spouse's money excluded, **a household's** with everything summed, or **both**, switchable the way the year filter and the lens toggle already are? A switch is the honest answer if the owner wants both, and it costs a scope dimension rather than a rewrite. Note that CRA room is always per person, so the wrappers and tax views stay per person whatever the totals do.

Once an owner dimension exists, the spousal RRSP stops being a special case: it is simply the spouse's account, held out of his view and counted in hers.

## The spousal card charts nothing

`buildPortfolioSeries` skips accounts with `inTotals: false`, so the spousal RRSP's card states its real $15,818.27 and then says "No value history" and "No market value to compare against book cost". The figure is right, the card contradicts itself.

Fixing it means letting a group card build its series over its own accounts regardless of `inTotals`. That is right for the spousal account, which has five months of real market values, and wrong for the three chequing accounts, whose statements state no market value at all and which the "No figure" wording already handles correctly.

Left alone because the spouse-accounts decision above governs it: if the spousal account moves into a household view it stops being excluded, and this disappears on its own.

## The projection credits spousal contributions to the wrong person

`contributedThisYear.RRSP` is $36,000, of which $15,200 went to the spousal account. The engine reduces the owner's room by the full $36,000, which is correct, and compounds the whole $36,000 into a balance that excludes the spousal account, which is not: that money grows in her account.

The start year is unaffected, because room used is room used. It is the projected years that overstate. Fixing it properly means separating "consumes room" from "adds value" in `engine.ts`, which the project CLAUDE.md flags as the file to read carefully before touching.

Also governed by the spouse decision: in a household view the money is not going anywhere, and the two halves net out.

## The second business account

The 2026-08-31 app checkpoint shows a Business investing account this project has never seen a statement for, at $5,038.29. Confirmed by the owner as opened in August 2026. Nothing to do until its first statement arrives; it will need a label and a purpose in `src/store/registry.ts`. Tracked as an open question in `data/checkpoints.json`.

## The loss colour has no real-data coverage

Every account showed a gain at 2026-07, so `GOLDENS.lossGroups` is empty and the only thing standing between a broken loss colour and a green suite is one fixture test in `Overview.test.tsx`. `bun run contrast` has the same blind spot for the same reason. Nothing to fix; it resolves itself the next month an account is down, and the goldens will say so.
