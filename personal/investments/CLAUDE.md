# Investments project — instructions for Claude Code

Personal finance dashboard built from Wealthsimple's monthly **PDF statements**. A bun/TypeScript pipeline in `app/` turns 231 statements into a masked datastore, an analytics payload and a reconciliation report; a local React app renders them. Read this before changing analytics, parsing, or any number shown on screen.

## Importing a month

The source folder holds only the month being imported; the owner deletes it afterwards, and the previous months' PDFs are never needed.

```
mkdir -p ~/Downloads/monthly_pdf_statements
cp ~/Downloads/<this month's PDFs>/*.pdf ~/Downloads/monthly_pdf_statements/
cd app && bun run build && bun run analytics && bun run goldens && bun run cards && bun run tracker
bun run check          # must be clean
bun run contrast       # only if a colour, size, weight or badge changed
```

`build` fails with ENOENT when the folder is missing entirely, hence the `mkdir -p`. `STATEMENTS_DIR=<folder>` points it anywhere else.

Then read the `data/goldens.json` diff. That single file is where every figure the tests pin lives, so the diff IS the month's change: a total that moved the wrong way, a contribution that landed in the wrong wrapper, a rate that jumped, all of it in one reviewable place. Commit the `data/*.json` files and `tracking.md` together.

### Statement coverage

`bun run tracker` writes `tracking.md` and `data/coverage.json` from the datastore: per account, the first and latest month and any month missing since the first; per month, how many open accounts reported; and the latest month where every open account has a statement. The dashboard's Data tab renders the JSON. `tracker.test.ts` fails `bun run check` when either file is stale against the datastore, so an import that skips the command cannot land green.

A new account needs a label and a purpose in `src/store/registry.ts`, and a `KIND_OVERRIDES` entry if it is corporate: a corporate account's statement reads "Non-Registered Cash Account" exactly like a personal one. `8297`, opened 2026-08, is the second.

A month counts as covered when any statement exists for it. Since 2026-07 the three chequing accounts send only a CASH statement where they used to send BROKERAGE and CASH; both carry the closing balance, so that is not a gap.

`bun run build --rebuild` discards the archive and re-parses every PDF from scratch. It needs every PDF present, and it is for one case only: a parser change, where carrying stale parses forward is exactly wrong.

### The archive, and why the PDFs are no longer needed

`data/datastore.json` is the archive. Its masked statements are the complete parsed form of every statement, so `store/archive.ts` merges freshly parsed months over them and the build never has to see a PDF twice.

Before 2026-08-31 the build rebuilt everything from `~/Downloads/monthly_pdf_statements/` on every run, which made that folder load bearing for three years of history while living outside the vault and outside any backup. It was in fact lost, and the 2026-07 import began by asking the owner to restore it.

`maskAccountNo` is idempotent for this reason: an archived statement's account number is already `acct_...`, and hashing the hash would silently file every carried month under a second masked id. `build.integration.test.ts` proves the property that matters, over the real corpus rather than a fixture: one month's PDFs plus the archive produce the same 231 statements and the same 14 account records as parsing all 235 PDFs.

Two things the merge deliberately does not do. A re-imported month overwrites its archived twin, because the document outranks the cache. An amended version lands beside its original rather than on top of it, because `dedupeToLatestVersion` and `checkSupersession` both need the pair.

One consequence worth knowing: `ingest` findings describe the files present in that run, so a byte-identical duplicate PDF that is not in this month's folder stops being reported. The statements are unaffected.

## What this replaced

The CSV pipeline that preceded this lived in `scripts/` and rendered `notes/index.html`. **Both were deleted on 2026-08-24**, after the rebuild shipped every feature the spec's Predictions section called for. Its findings are gone with it and most were true only of the CSVs: no market value in the data, a currency field contaminated with ticker symbols, account kind inferred from a filename. None of those is true here. If you find a note repeating one, it is describing a pipeline that no longer exists.

`app/src/projection/engine.ts` was a byte-identical port of the old `scripts/src/client/projection.ts`. That was verified for the last time immediately before the deletion, both files at `bf1d3342afd4f8a44f6a60c219058e94df5fbd5e`, and the reference is now gone, so the check cannot be run again. The engine's own inline comments carry the five traps that cost real debugging, indexation compounding an unrounded base above all. Read them before touching it.

## The dashboard app's gates (`app/`)

Two commands, and they are deliberately not one.

- `bun run check` — biome, `tsc --noEmit`, `bun test`. The per-commit gate. It must stay clean and it runs in about twelve seconds over 1264 tests.
- `bun run contrast` — renders the dashboard in Chromium on all eight tabs in both themes and **measures** the WCAG AA contrast of every rendered run of text against the opaque colour actually painted behind it. About fourteen seconds, and it needs a browser: `bunx playwright install chromium` once, then `bun run contrast`. Run it before shipping anything that changes a colour, a font size, a font weight, or adds a badge, a callout or a chart label.

It is out of `bun run check` on purpose. Folding a browser launch and a dev server into the gate that runs on every commit trades ten seconds for twenty-five, on every commit, to catch a class of regression that only a colour change can cause. The cost is that a colour change with no `bun run contrast` behind it can land green; that is what the line above exists to prevent.

`src/ui/App.a11y.test.tsx` asserts that every soft badge carries `highContrast`. That is a **proxy**, and its own comment says so: happy-dom resolves no stylesheet, so no ratio is computable there. It catches the prop being deleted. It cannot catch a Radix accent scale shifting a step, or a new badge in a colour nobody swept. `bun run contrast` is the check that can, and the two are not redundant.

The colour arithmetic lives in `src/tools/contrast/color.ts` and `audit.ts` and is unit tested; only `collect.ts` runs in the page, and it measures nothing — it reports computed strings so the maths stays testable without a browser. Radix paints most surfaces in alpha steps (`--gray-a2`, `--jade-a3`) and every SVG chart label in `--gray-a11`, so reading one parent's `background-color` gives a translucent colour and a wrong answer; the ancestor chain is composited instead. Large text is 24px, or 18.66px at weight 700 — not 18.66px at any weight, which would drop the requirement from 4.5 to 3.0 and pass real failures.

### Corpus figures live in `data/goldens.json`, not in the tests

Importing 2026-07 failed 145 tests across 31 files. Every one of them pinned a figure from the previous corpus as an inline literal: `latest period is 2026-06`, `grand total is 241739.67`, `220 statements`, `Book value $223,675.08`. None was a code regression. All 145 were simply last month's numbers.

They now come from `data/goldens.json`, regenerated only by `bun run goldens`. Two properties make that safe rather than circular. `src/tools/goldens.ts` computes each figure by calling the SAME production function the test reads it with, so a golden can never encode a figure the pipeline does not produce. And the file moves only when the command is run, so a code regression still reddens the suite exactly as before. Verified by mutation: rounding `latestGroupGain`'s gain to whole dollars fails 12 tests across three layers.

The limit is real and worth stating. A regression that lands in the pipeline and is blessed by a `bun run goldens` run in the same breath is invisible. Regenerate goldens in a commit that changes DATA, and read the diff.

Three tests could not simply be re-pointed at a golden, because the July data removed the state they exercised:

- The corpus held no per-account loss at all after 2026-07. RRSP (managed) at `-$3.16` and Crypto at `-$45.04` both turned positive. `GOLDENS.lossGroups` now records whichever losses exist, and the assertion runs over that list, so a loss appearing or disappearing is a goldens diff rather than a red test.
- Crypto stopped being a single-statement account when 2026-07 gave it a second. Both the sparkline's lone-marker case and `plottedCount`'s zero case now cut the real account back to its first month.
- `expectNoCoarseForm` needs both rounding directions covered. Which figures round up and which round down changes every month, so `Overview.test.tsx` asserts that both directions are present among the figures it checks rather than naming which is which.

**The loss colour now has no real-data coverage.** The fixture test in `Overview.test.tsx` is the only thing standing between a broken loss colour and a green suite, and `bun run contrast` has the same blind spot for the same reason: it can only sweep colours something on the page actually paints.

### A gate only proves what it visits

For a whole build phase `bun run contrast` reported "AA pass, worst light 4.67" while structurally unable to see two things. It sampled the text present at sweep time and never hovered, so **no chart readout was measured once**. And it opened only the default lens of a three-lens view, so the loss colour, which only the account lens paints, was never swept.

Both holes were silent by construction: an unvisited state yields no sample, no sample yields no failure, and no failure is distinguishable from a pass. Corrected 2026-08-24. It now hovers every chart on every tab and visits all three lenses, samples carry the state they were taken in, and the run fails outright if the hover path reaches nothing or a lens goes unswept. 3606 runs of text, up from 2876.

Ask what **states** a gate reaches, not what pages. A chart below the fold is one such state: the pointer only moves within the viewport, so charts must be scrolled into view or they are silently never hovered.

## The precision rule, and the defect class this project has fought hardest

Eight instances have shipped of one defect: a figure announced coarser than the figure rendered beside it. $241,740 for $241,739.67. 20% for 20.4%. 2% for 1.6%. 47% for 46.641% and 25% for 24.921%, the last two on the room bars, fixed 2026-08-24.

The visible text, the `aria-label`, any live announcement and any tooltip come from **one** formatting call. `formatCurrency`, `formatShare` and `formatRate` in `src/ui/format.ts` are the only formatters allowed near a rendered figure; the axis formatters in `charts/plot.ts` are for gridlines and nothing else.

### Gains are green and losses red, everywhere

`GroupGainLine`, both tooltips and the tax view's realized line all use jade for a gain and red for a loss. `CostGapChart`'s below-the-line bars were amber and are now red, for the same reason: a bar below the line is book cost ahead of market value, which is a loss rather than a warning about a goal. `GoalsPanel` keeps jade/amber on purpose, because a shortfall against a target you set is a different thing from a loss against cost.

A tone is stated by the caller that knows the figure, never inferred from the formatted string at render time. Reading a minus sign back out of text to pick a colour is a second, independent reading of the very number being coloured.

Tone is colour and nothing else. It never reaches the spoken sentence: the sign in the text already says it, and an announced "gain" would be a second copy of that fact.

`readoutSuffix` in `Tooltip.tsx` builds the readout clause every chart appends to its `aria-label`. Each chart had its own copy of that join, which was harmless while a line was always a string and rendered `[object Object]` the moment one carried a tone, in the accessible name and the live region: the two copies no sighted reader ever sees. One function now, and `Tooltip.test.tsx` fails if it regresses.

`bun run contrast` hovers each chart at 0.1, 0.5 and 0.9 of its width rather than only the centre, and **fails the run if either tone never rendered**. The centre alone samples one month per chart, and a readout's colour depends on which month is hovered; the portfolio chart's seven loss months (2023-07, 2023-09, 2023-10, 2025-03, 2025-04, 2025-05, 2026-03) were never visited. Measured: jade 4.66 and red 5.21 in light, 9.56 and 8.35 in dark. The toned tooltip figure at 12px is now the tightest text in the app.

A gain or loss against a base is TWO statements of one fact, so it has its own formatter: `formatGainWithShare(gain, base)` prints `+$16,638.34 (+7.12%)` from a single call. A caller that formatted the percentage itself would be the ninth instance of the defect above. It is used by `GroupGainLine` (the headline and every group card), the `ValueOverTime` tooltip's gain row, and `costGapTooltipLines`.

Both halves carry an explicit sign. In greyscale or forced-colours mode the characters are the only channel left, and `(10.00%)` beside `-$100.00` reads as a gain.

A zero or negative base prints the dollars alone with no bracket. That is not tidiness: the corpus opens at 2023-06 with two accounts holding a real $0.00 of book cost, where a percentage is a division by zero, and `Infinity%` is not a figure the data supports.

The gain in the `ValueOverTime` tooltip is **cumulative** to the hovered month, market value less book cost as at that month, not the change over it. Same quantity `CostGapChart` draws, same one the headline prints for the latest month.

Two rules that follow from how the guards themselves failed:

- **Mutate each rendering path independently, never a shared variable.** A shared-variable mutation proves the variable is used. It never proves the visible text and the `aria-label` agree, and the second path is the only place this defect has ever actually lived.
- **Derive a coarse-form absence assertion by computing it, never by chopping digits.** `$92,547.67` coarsens to `$92,548`, different digits, so a guard keyed on truncation cannot fire when rounding goes up. Use `expectNoCoarseForm`. A lookahead of `(?!\.)` is additionally defeated by a figure at the end of a sentence; it must be `(?!\.\d)`.

A bar that carries a value is a second copy of a figure. Radix's `Progress` derives `aria-valuetext` from its value and rounds to whole percent, which is where two of the eight came from. `ShareBar` is hidden decoration for that reason, and the figure lives in the text beside it.

## The spousal RRSP is the spouse's asset, not the owner's

The owner is the CONTRIBUTOR. The asset belongs to his wife, and Wealthsimple counts it under her name, which is correct. From 2026-08-31 this project does the same: `SpousalRRSP` joins `Chequing` in `EXCLUDED_KINDS`, so the account stays visible with its own figure and contributes nothing to the portfolio total.

The contribution ROOM is his and must stay his. A spousal contribution is made against the contributor's own RRSP room, so `rooms.ts` groups `SpousalRRSP` under RRSP by KIND and never filters on `inTotals`. His room, her asset: two facts that look like one and are not. `inputs.test.ts` pins both halves, because excluding the account and quietly handing back the room it consumed is the easy mistake here.

This moved the portfolio total from $250,398.10 to **$234,579.83** at 2026-07, and RRSP from $52,634.47 to $36,816.20.

It also explained the ground-truth finding exactly. The owner's 2026-06-30 app reading of $242,019.61 exceeds this project's spousal-excluded 2026-06 total of $227,433.46 by $14,586.15, which is $14,306.21 of spousal asset plus $279.94 of WSE401 pending valuation. Residual $0.00, to the cent. A residual that exact is what makes both halves testable rather than merely plausible, and it confirms that reading included the spousal account.

**A ground-truth observation's SCOPE has to be recorded with it.** `accountValue` is whatever the app showed, and the app's own scope decides what it is comparable to. Note which accounts the screen was counting when taking the next reading.

One assumption the projection makes and does not state on screen: future RRSP contributions are credited to the owner's own balance. Spousal contributions consume his room but build hers, so a plan that keeps funding the spousal account will project his RRSP high. The start year is unaffected, because room used is room used.

**The spouse's own accounts are coming** (owner, 2026-08-31), and this exclusion is the only place the pipeline knows a second person exists. Decide one-person versus household totals BEFORE adding them, because that decision resolves this exclusion, the spousal card's missing history and the projection assumption above all at once. `notes/next.md` carries the three and why they belong together.

## Corpus figures, at 2026-07

Read `data/goldens.json` for the current numbers. The figures below are a snapshot for orientation and will be stale the month after they are written.

Total $234,579.83 at 2026-07 across 10 counted accounts, identical across all three lenses. Book cost $218,486.61, gain $16,093.22. The gain FELL while the total rose over July, because that month's contributions added more book cost than the market added value.

RRSP 2026 $36,000 used of an assessed $70,752, of which $15,200 went to the spousal account and still counts against his room. TFSA 2026 $7,000, FHSA $8,000 against a $40,000 lifetime cap, RESP $4,000 of $50,000 with CESG $600 of $7,200. RRSP 2025 stays $15,000 of $60,191; a closed year does not move.

Runway is rate-**invariant**, verified at 0, 6, 12 and 25 percent and structurally, since no contribution step in `engine.ts` reads a balance: FHSA cap 2028, FHSA closes 2039, RESP cap 2044, CESG ends 2042, RRSP last accrual year 2068. CESG tops out at $6,600 of its $7,200 cap, forfeiting $600, because the beneficiary ages out before the contributions that would claim the rest.

The corpus currently holds NO per-account loss. See the goldens section above for what that costs the loss-colour coverage.

The projection defaults to 6% by owner decision. The rate is fitted from 38 months and renders beside the default with its window as the caveat.

2026 realized gains moved from `-$1,335.86` to `-$3,030.68` over July. That is a real tax-relevant change, not a parsing artifact.

## The year filter, and the one thing it must never do

`YearScope` is `"all"` or a calendar year, held in the hash (`#growth/2024`) so a scoped view is linkable, and applied ONCE in `App` by clipping `analytics.series` and `analytics.returns` through `clipSeries`/`clipReturns`. Every chart, rollup and gain downstream derives from `months` and needs no idea a filter exists. Eight per-chart filters would be eight that can disagree.

Per tab: Overview, Growth, Cards and Reconciliation clip. Wrappers and Tax follow the same year, so there is one year control rather than two that look alike; on "All time" they fall back to the corpus's latest year. **Projections ignores it** and says so on the tab, because a past year does not scope a thirty-year forecast and re-basing to that year's close would quietly produce a different projection that looks just as authoritative. Reconciliation states how many findings the filter hid: a data-quality tab that silently drops problems is a trap.

**The thing it must never do is let deposits read as performance.** 2026 took the portfolio from $85,516.38 to $234,579.83, and a bare "+$149,063" would be true and almost entirely contributions: $129,731.98 was paid in and $19,331.47 was growth. So `yearChange` nets the growth and returns `netDeposits` beside it, and the change line prints both. Never render one without the other.

`yearChange` measures from the last month BEFORE the year, not the year's first month, or January's growth is silently discarded.

### The year's percentage is chained, never growth over the opening balance

`YearChange.returnRate` comes from `buildPortfolioReturns` + `returnsWithin`, the same pair the return chart draws. `growth / start` is the obvious alternative and it is wrong on this corpus: 2026 opened at $85,516 and took in $129,732 during the year, so the money at risk was far more than the opening figure. It reported 22.61% where the chained figure is 10.50%, with the chart beside it showing 10.50%. Two figures for one year is one too many.

## The return chart is the question the value chart cannot answer

A market-value chart climbs when money arrives, so it cannot tell a good year from a well-funded one. `ReturnOverTime` chains each month's own deposit-netted return into a cumulative line. Its netting is `netFlowsByPeriod`, exported from `fittedRate.ts` and shared with the projection's fitted rate, so the line and that rate can never be built from two different ideas of what a deposit is.

The two do not read as equal and should not: the fit is capital-weighted for a thirty-year projection, this chains month by month because it reports what happened. Where they diverge most is early, on the small months the fit deliberately damps.

Two traps, both hit during the build:

- **Compute over the full series, then clip.** Clipping first leaves a year's January with no December to measure against, so "2026's return" silently means February onward while its dollar figure covers January onward. `returnsWithin` re-bases by DIVIDING the compounded factors, not subtracting the percentages: +100% to +150% is a 25% window, not a 50% one.
- **A return axis is signed.** `buildScales` anchors at zero and reads only the maximum, which is right for a currency chart and wrong here. 2025 fell to -3.68% in April and the line vanished under the axis floor, on the one chart whose purpose is showing when you were down. Use `buildSignedScales`.

`bun run contrast` now visits the return chart, because it is behind a toggle and an unvisited state yields no sample, no sample yields no failure, and no failure reads exactly like a pass. It fails the run if that mode is never swept.

## Checkpoints are the outside number

Everything on the dashboard is derived from PDF statements, so the whole pipeline is one chain of inference from one source. A chain like that can be internally consistent and still wrong.

`data/checkpoints.json` holds readings taken off the Wealthsimple app's own screen, dated, before the matching statements exist. Nothing reads it into the build and no rendered figure comes from it. It exists to be compared against, and `notes/checkpoints.md` carries the procedure for reconciling one.

The app's grouping is NOT the registration lens: it splits Crypto into its own group where the lens folds it into Non-registered, so a group-by-group comparison has to map the two first or it double counts.

The 2026-08-31 checkpoint reconciles against the 2026-08 statements to $92.96 over $250,450.58. The statements price some ETFs a few cents off the day's closing trade and the app uses the close; repricing each holding at the close explains the gaps account by account. `notes/checkpoints.md` has the detail.

## Credit cards are a separate pipeline

A Wealthsimple credit card statement is a different document and a different kind of money. `src/ingest/card.ts` parses it, `src/cards/build.ts` writes `data/cards.json`, and `src/ui/Cards.tsx` renders its own tab. Both builds read the same download folder: `bun run build` skips a card statement with an `ingest` warning, and `bun run cards` skips everything that is not one. The two pipelines share `geometry.ts` and `money.ts` and nothing else.

A card balance is money OWED. Adding it to a total built from money held would overstate the portfolio by the size of a debt, and none of the investment analytics apply to it anyway: no market value, no book cost, no contribution room, no return rate. The Cards tab says so in the open, above the figures.

Masking drops the BIN entirely and keeps only the last four digits, which is the only part that tells one card from another. The name, the address and the leading six digits never reach `cards.json`.

Two parsing traps the tests pin. The account summary prints two labelled figures on one row (`- Payments $711.02   + Purchases $651.27`), so figures are read by the label's x position, never by order in the row: first-token and last-token readings are both wrong, and both wrong by a plausible amount. And a card's billing period straddles two months with the year printed once at the end, so a December-to-January statement has to roll the start year back.

## The TFSA assessed room is still outstanding

`ASSESSED_ROOM` in `src/analytics/rooms.ts` carries RRSP 2025 and 2026 only. The TFSA has no assessed figure, so its line falls back to the generic annual maximum and `remaining` is correctly null. That is why 2025 reads $25,000 against a $7,000 annual maximum with no over flag: the owner maxed out accumulated room that year. **That is the reason, not the figure.**

When the owner supplies it, add it to `ASSESSED_ROOM` the way RRSP 2025 and 2026 are, with a comment recording its source and date, and regenerate `analytics.json`. Never derive it from the contribution total. Fitting a room figure to arithmetic is what left the RRSP quietly wrong by $1,000 for three weeks.

## USD book cost is approximate, and always will be

Holdings plus cash reconcile to the stated portfolio **market value** everywhere except three statements, off by one to three cents from rounding the six-decimal rate. Book cost does not reconcile on 21 statements, by up to $279.94, and every one of those holds USD securities while no CAD-only statement diverges at all.

Those two figures used to be written into `CostGapChart`'s caveat as prose literals. Importing one month made both stale, leaving a callout about approximation announcing a wrong number of its own. `bookCostDivergence()` computes them from the reconciliation report now.

This is a property of the source, not a parser defect. Each statement discloses one month-end rate and its own footnote scopes that rate to market value; book cost is an accumulated basis recorded at each purchase's own historical rate, so no single current rate can reconstruct it. `Holding.bookCostConverted` marks every converted figure, and the reconciliation report separates the two cases: a book-cost divergence with no converted holding is an error, because that is a real indexing bug; a divergence with converted holdings is a warning naming the fx limitation. Treat a converted book cost as an estimate, never a filing figure.

## Reconciliation is data, not a build failure

A wrong number that is visible beats a clean dashboard that is off with no way to find out why. Discrepancies surface in the Reconciliation tab with account, period, check, expected, actual, delta and source filename. Only a parse-level failure, a required field absent from a document that should carry it, fails the build, because that means the parser is wrong rather than the data.

Genuine Wealthsimple data errors go in `corrections.ts`: explicit, dated, individually justified. Never a silent adjustment inside the parser.

The $279.94 residual against the app's $242,019.61 is one unpriced holding, `WSE401`, a private-markets fund carried at its purchase price under a pending-valuation disclaimer. If the entire residual is that stale price the finalised NAV is $10.2254, which is testable when the amended statement arrives. That observation is dated 2026-06-30 and stays pinned there; it does not follow the latest period.

### A finding's period has to be stable

`checkStyleConsistency` anchored its finding at the account's LATEST statement. Account 9710's style drift is a permanent fact about its history, so the finding re-fired every month at a new period, missed its acknowledgement in `corrections.ts` (keyed on check, short id and period), and re-raised a reviewed finding as an unacknowledged error on every single import.

Drift findings anchor at the transition now, which for 9710 is 2024-07: the period a reader actually wants, and one that does not move. Any check whose finding outlives the month it fires in needs the same treatment.

## Masking

Never commit an unmasked account number, name, address or statement filename. A statement filename **is** an account number, and so is a fixture list, a test input, and an error message that echoes its input. Source PDFs stay outside the vault in a gitignored directory; only masked derived data is committed.

Account labels are keyed by the 4-char `shortId` in `src/store/registry.ts`, never by the real account number, and never derived from a filename.

A fresh Wealthsimple download names itself `<ACCOUNT>_<owner-kind>-<id>_<YYYY-MM>_v_<n>.pdf`, and the owner kind is not always `person`. July 2026 carried `identity-` on the four chequing statements and `corporation-` on the corporate one, none of which parsed. The regex takes a generic lowercase kind now, because an unmatched filename fails the whole import over a segment nothing downstream reads.

There is no pre-commit guard in this vault, so the check is manual: inspect the staged diff before every commit. The leak gate at `.superpowers/sdd/2026-08-04-investments-ingest/leak-gate.sh <range>` has two known false-positive classes, log-decade axis constants (`1000000`) and hex colours with alpha (`#00000080`), and it will flag other endeavors' files if the range is not scoped. Note that `git grep` silently ignores `\b`, so it can never be used to prove an absence.

## Design and docs

The spec and implementation plans live in `docs/superpowers/`, and the phase ledgers in `.superpowers/sdd/`. Both record corrections made mid-execution, several of which found the spec wrong rather than the code. Styling is Radix Themes; charts are hand-built SVG on `d3-scale`.
