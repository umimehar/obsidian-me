# Investments project — instructions for Claude Code

Personal finance dashboard built from Wealthsimple's monthly **PDF statements**. A bun/TypeScript pipeline in `app/` turns 220 statements into a masked datastore, an analytics payload and a reconciliation report; a local React app renders them. Read this before changing analytics, parsing, or any number shown on screen.

The CSV pipeline that preceded this lived in `scripts/` and rendered `notes/index.html`. **Both were deleted on 2026-08-24**, after the rebuild shipped every feature the spec's Predictions section called for. Its findings are gone with it and most were true only of the CSVs: no market value in the data, a currency field contaminated with ticker symbols, account kind inferred from a filename. None of those is true here. If you find a note repeating one, it is describing a pipeline that no longer exists.

`app/src/projection/engine.ts` was a byte-identical port of the old `scripts/src/client/projection.ts`. That was verified for the last time immediately before the deletion, both files at `bf1d3342afd4f8a44f6a60c219058e94df5fbd5e`, and the reference is now gone, so the check cannot be run again. The engine's own inline comments carry the five traps that cost real debugging, indexation compounding an unrounded base above all. Read them before touching it.

## The dashboard app's gates (`app/`)

Two commands, and they are deliberately not one.

- `bun run check` — biome, `tsc --noEmit`, `bun test`. The per-commit gate. It must stay clean and it runs in about ten seconds.
- `bun run contrast` — renders the dashboard in Chromium on all six tabs in both themes and **measures** the WCAG AA contrast of every rendered run of text against the opaque colour actually painted behind it. About fourteen seconds, and it needs a browser: `bunx playwright install chromium` once, then `bun run contrast`. Run it before shipping anything that changes a colour, a font size, a font weight, or adds a badge, a callout or a chart label.

It is out of `bun run check` on purpose. Folding a browser launch and a dev server into the gate that runs on every commit trades ten seconds for twenty-five, on every commit, to catch a class of regression that only a colour change can cause. The cost is that a colour change with no `bun run contrast` behind it can land green; that is what the line above exists to prevent.

`src/ui/App.a11y.test.tsx` asserts that every soft badge carries `highContrast`. That is a **proxy**, and its own comment says so: happy-dom resolves no stylesheet, so no ratio is computable there. It catches the prop being deleted. It cannot catch a Radix accent scale shifting a step, or a new badge in a colour nobody swept. `bun run contrast` is the check that can, and the two are not redundant.

The colour arithmetic lives in `src/tools/contrast/color.ts` and `audit.ts` and is unit tested; only `collect.ts` runs in the page, and it measures nothing — it reports computed strings so the maths stays testable without a browser. Radix paints most surfaces in alpha steps (`--gray-a2`, `--jade-a3`) and every SVG chart label in `--gray-a11`, so reading one parent's `background-color` gives a translucent colour and a wrong answer; the ancestor chain is composited instead. Large text is 24px, or 18.66px at weight 700 — not 18.66px at any weight, which would drop the requirement from 4.5 to 3.0 and pass real failures.

### A gate only proves what it visits

For a whole build phase `bun run contrast` reported "AA pass, worst light 4.67" while structurally unable to see two things. It sampled the text present at sweep time and never hovered, so **no chart readout was measured once**. And it opened only the default lens of a three-lens view, so the loss colour, which only the account lens paints, was never swept.

Both holes were silent by construction: an unvisited state yields no sample, no sample yields no failure, and no failure is distinguishable from a pass. Corrected 2026-08-24. It now hovers every chart on every tab and visits all three lenses, samples carry the state they were taken in, and the run fails outright if the hover path reaches nothing or a lens goes unswept. 3606 runs of text, up from 2876.

Ask what **states** a gate reaches, not what pages. A chart below the fold is one such state: the pointer only moves within the viewport, so charts must be scrolled into view or they are silently never hovered.

## The precision rule, and the defect class this project has fought hardest

Eight instances have shipped of one defect: a figure announced coarser than the figure rendered beside it. $241,740 for $241,739.67. 20% for 20.4%. 2% for 1.6%. 47% for 46.641% and 25% for 24.921%, the last two on the room bars, fixed 2026-08-24.

The visible text, the `aria-label`, any live announcement and any tooltip come from **one** formatting call. `formatCurrency`, `formatShare` and `formatRate` in `src/ui/format.ts` are the only formatters allowed near a rendered figure; the axis formatters in `charts/plot.ts` are for gridlines and nothing else.

Two rules that follow from how the guards themselves failed:

- **Mutate each rendering path independently, never a shared variable.** A shared-variable mutation proves the variable is used. It never proves the visible text and the `aria-label` agree, and the second path is the only place this defect has ever actually lived.
- **Derive a coarse-form absence assertion by computing it, never by chopping digits.** `$92,547.67` coarsens to `$92,548`, different digits, so a guard keyed on truncation cannot fire when rounding goes up. Use `expectNoCoarseForm`. A lookahead of `(?!\.)` is additionally defeated by a figure at the end of a sentence; it must be `(?!\.\d)`.

A bar that carries a value is a second copy of a figure. Radix's `Progress` derives `aria-valuetext` from its value and rounds to whole percent, which is where two of the eight came from. `ShareBar` is hidden decoration for that reason, and the figure lives in the text beside it.

## Corpus figures, verified against the committed artifact

Total $241,739.67 at 2026-06, identical across all three lenses. Book cost $223,675.08, gain $18,064.59, which is 8.1% and equals the sum of the registration-lens group gains.

RRSP 2025 $15,000 used of an assessed $60,191. RRSP 2026 $33,000 of $70,752. TFSA 2025 $25,000, TFSA 2026 $7,000. FHSA $24,000 of a $40,000 lifetime cap. RESP $3,000 of $50,000 with CESG $550 of $7,200.

Runway, and every year of it is rate-**invariant**, verified at 0, 6, 12 and 25 percent and structurally, since no contribution step in `engine.ts` reads a balance: FHSA cap 2028, FHSA closes 2039, RESP cap 2044, CESG ends 2042, RRSP last accrual year 2068. CESG tops out at $6,650 of its $7,200 cap, forfeiting $550, because the beneficiary ages out before the contributions that would claim the rest.

Two real losses exist, both in the account lens: RRSP (managed) at -$3.16 and Crypto at -$45.04. They are the only text in the app painted in the loss colour.

The projection defaults to 6% by owner decision. The rate fitted from 37 months is 24.84% and compounds to roughly $431M over thirty years, so it renders beside the default with its window as the caveat.

## The TFSA assessed room is still outstanding

`ASSESSED_ROOM` in `src/analytics/rooms.ts` carries RRSP 2025 and 2026 only. The TFSA has no assessed figure, so its line falls back to the generic annual maximum and `remaining` is correctly null. That is why 2025 reads $25,000 against a $7,000 annual maximum with no over flag: the owner maxed out accumulated room that year. **That is the reason, not the figure.**

When the owner supplies it, add it to `ASSESSED_ROOM` the way RRSP 2025 and 2026 are, with a comment recording its source and date, and regenerate `analytics.json`. Never derive it from the contribution total. Fitting a room figure to arithmetic is what left the RRSP quietly wrong by $1,000 for three weeks.

## USD book cost is approximate, and always will be

Holdings plus cash reconcile to the stated portfolio **market value** everywhere except three statements, off by one to three cents from rounding the six-decimal rate. Book cost does not reconcile on 19 statements, by up to $218.92, and every one of those holds USD securities while no CAD-only statement diverges at all.

This is a property of the source, not a parser defect. Each statement discloses one month-end rate and its own footnote scopes that rate to market value; book cost is an accumulated basis recorded at each purchase's own historical rate, so no single current rate can reconstruct it. `Holding.bookCostConverted` marks every converted figure, and the reconciliation report separates the two cases: a book-cost divergence with no converted holding is an error, because that is a real indexing bug; a divergence with converted holdings is a warning naming the fx limitation. Treat a converted book cost as an estimate, never a filing figure.

## Reconciliation is data, not a build failure

A wrong number that is visible beats a clean dashboard that is off with no way to find out why. Discrepancies surface in the Reconciliation tab with account, period, check, expected, actual, delta and source filename. Only a parse-level failure, a required field absent from a document that should carry it, fails the build, because that means the parser is wrong rather than the data.

Genuine Wealthsimple data errors go in `corrections.ts`: explicit, dated, individually justified. Never a silent adjustment inside the parser.

The $279.94 residual against the app's $242,019.61 is one unpriced holding, `WSE401`, a private-markets fund carried at its purchase price under a pending-valuation disclaimer. If the entire residual is that stale price the finalised NAV is $10.2254, which is testable when the amended statement arrives.

## Masking

Never commit an unmasked account number, name, address or statement filename. A statement filename **is** an account number, and so is a fixture list, a test input, and an error message that echoes its input. Source PDFs stay outside the vault in a gitignored directory; only masked derived data is committed.

Account labels are keyed by the 4-char `shortId` in `src/store/registry.ts`, never by the real account number, and never derived from a filename.

There is no pre-commit guard in this vault, so the check is manual: inspect the staged diff before every commit. The leak gate at `.superpowers/sdd/2026-08-04-investments-ingest/leak-gate.sh <range>` has two known false-positive classes, log-decade axis constants (`1000000`) and hex colours with alpha (`#00000080`), and it will flag other endeavors' files if the range is not scoped. Note that `git grep` silently ignores `\b`, so it can never be used to prove an absence.

## Design and docs

The spec and implementation plans live in `docs/superpowers/`, and the phase ledgers in `.superpowers/sdd/`. Both record corrections made mid-execution, several of which found the spec wrong rather than the code. Styling is Radix Themes; charts are hand-built SVG on `d3-scale`.
