/**
 * The contrast regression check: `bun run contrast`.
 *
 * It renders the real dashboard in Chromium, on every tab and in both themes,
 * and measures the contrast of every run of text against what is actually
 * painted behind it. It asserts nothing about class names. `App.a11y.test.tsx`
 * pins `highContrast` as a proxy because happy-dom resolves no stylesheet and
 * cannot compute a ratio; this is the thing that proxy stands in for, and the
 * only check here that would notice a Radix accent scale shifting a step or a
 * new badge landing in a colour nobody swept.
 *
 * A gate only proves what it VISITS, and pages are not states. For a whole
 * build phase this reported "AA pass, worst light 4.67" while structurally
 * unable to see two things:
 *
 * - **Every tooltip.** It sampled the text present at sweep time and never
 *   hovered a chart, so no chart readout was measured once, before or after
 *   any change to one. It now hovers every chart on every tab.
 * - **Two of the overview's three lenses.** It opened the default lens only,
 *   so the loss colour -- which only the account lens paints, on the two real
 *   losses of -$3.16 and -$45.04 -- was never in the sweep. It now switches
 *   lenses.
 *
 * Both holes were silent by construction, which is why `sweep` now fails the
 * run outright if the hover path reaches no readout or a lens goes unswept.
 * A state that yields no sample yields no failure, and no failure is
 * indistinguishable from a pass.
 *
 * Deliberately outside `bun run check`: it needs Chromium and a dev server and
 * takes about fourteen seconds, where the rest of that gate is milliseconds.
 * Driving the states above cost two of those, measured, not estimated: 11s
 * before, 13.5s after, for 2876 runs of text swept rising to 3606. Run it
 * before shipping anything that changes a colour, a weight or a size.
 */

import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { TABS } from "../../ui/useHashTab";
import type { Sample, Theme } from "./audit";
import {
  backgroundMatchesTheme,
  failures,
  formatFailure,
  formatSummary,
  measureSample,
} from "./audit";
import { collectSamples } from "./collect";
import { parseCssColor } from "./color";

const APP_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const THEMES: readonly Theme[] = ["light", "dark"];

/**
 * The fewest runs of text a tab may render before the sweep is assumed broken.
 * A check that finds three elements and passes has not checked anything, and a
 * tab that failed to mount looks exactly like a tab with nothing on it.
 */
const MIN_RUNS_PER_TAB = 8;

/** The readout a chart shows under the cursor. Only in the DOM while a cursor is on a chart. */
const TOOLTIP = "[data-chart-tooltip]";

/**
 * The two lenses the overview does not open on. `"By registration"` is the
 * default state and is swept as `default`, so sweeping it again here would
 * only duplicate it.
 *
 * The account lens is not optional decoration: it is the only lens that paints
 * a loss, and the two real ones (-$3.16 and -$45.04) are the only text in the
 * app drawn in the loss colour. Before this, no run of this gate had ever
 * measured that colour.
 */
/** The overview's lens toggle, by its own accessible name. */
const LENS_GROUP = '[role="radiogroup"][aria-label="Group accounts by"]';

/**
 * The portfolio chart's other mode.
 *
 * It is behind a toggle, so it is a state this gate reaches only by asking
 * for it -- the same shape as the lenses above, and the same failure if it
 * does not: an unvisited chart yields no sample, no sample yields no failure,
 * and a return line painted in an unreadable colour would pass. It draws its
 * own axis labels, its own readout and a line coloured by sign, none of which
 * the value chart has.
 */
const RETURN_MODE = "Return";
const CHART_GROUP = '[role="radiogroup"][aria-label="Chart"]';

const EXTRA_LENSES: readonly string[] = ["By account", "By purpose"];

/** Somewhere no chart can be, so a pointer parked here leaves every cursor cleared. */
const AWAY = { x: 0, y: 0 } as const;

/** Waits for the panel the hash names to be the mounted one, not merely for time to pass. */
async function showTab(page: Page, tab: string): Promise<void> {
  await page.evaluate((id) => {
    window.location.hash = id;
  }, tab);
  await page.waitForFunction(
    (id) => document.querySelector('[role="tab"][data-state="active"]')?.id.endsWith(id) === true,
    tab,
  );
  // The charts wipe in. Reduced motion is emulated so they are drawn rather
  // than animated, but the paint still has to land before anything is measured.
  await page.waitForTimeout(150);
}

function rootBackground(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.querySelector(".radix-themes");
    return root === null ? "" : getComputedStyle(root).backgroundColor;
  });
}

/**
 * Puts the page into `theme` using the toggle a reader would use, and proves it
 * took by reading the page's own background back.
 *
 * The dark theme is only reachable through that toggle. `<Theme
 * appearance="inherit">` resolves to light whatever `prefers-color-scheme`
 * says, because Radix Themes ships no media query for it -- so emulating a dark
 * OS is not enough, and worse, it flips what the toggle's first click does.
 */
async function applyTheme(page: Page, theme: Theme): Promise<void> {
  const toggle = page.getByRole("button", { name: /switch to/i });
  for (let click = 0; click <= 2; click += 1) {
    const background = parseCssColor(await rootBackground(page));
    if (background !== null && backgroundMatchesTheme(theme, background)) return;
    await toggle.click();
    await page.waitForTimeout(50);
  }
  throw new Error(`the theme toggle never produced the ${theme} theme`);
}

/**
 * Sweeps one state and returns how many runs of text it found.
 *
 * A zero here is never nothing to worry about: it means the state was driven
 * and produced no text, which is the shape every silent hole in this gate has
 * had. Callers decide whether that is expected for the state they asked for.
 */
async function sweepState(
  page: Page,
  at: { tab: string; theme: Theme; state: string },
  samples: Sample[],
  root?: string,
): Promise<number> {
  const raw = await page.evaluate(collectSamples, root);
  for (const sample of raw) samples.push(measureSample(sample, at));
  return raw.length;
}

/**
 * Hovers every chart on the tab in turn and measures the readout each one
 * opens.
 *
 * The pointer is parked away from every chart between charts, so a readout
 * left over from the previous one cannot be measured under this one's name.
 * That reset is asserted rather than assumed: `onPointerLeave` clearing the
 * cursor is the behaviour the whole loop rests on.
 *
 * A chart that opens nothing is not a fault -- several `role="img"` graphics
 * carry no cursor at all -- so this returns the count that did open and the
 * caller decides. The portfolio chart sits above the tab strip and is present
 * on every tab, so it is legitimately hovered once per tab.
 */
/**
 * Where along each chart the pointer stops.
 *
 * The centre alone is one x position per chart, and one position samples one
 * month. A readout's gain/loss colour is a property of WHICH month is
 * hovered, so a single position measures whichever tone that month happens to
 * carry: the portfolio chart's centre lands on a gaining month, and its seven
 * loss months (at roughly 0.03, 0.08, 0.11, 0.57, 0.59, 0.62 and 0.89 of the
 * series) were never hovered at all. The near ends reach them.
 *
 * This is coverage, not proof. `TONES` below is the proof, and it is what
 * fails the run if a colour goes unrendered rather than leaving these three
 * numbers trusted to keep landing well.
 */
const HOVER_FRACTIONS = [0.1, 0.5, 0.9] as const;

/** Both tones a readout can paint. A run that never renders one has not measured it. */
const TONES = ["gain", "loss"] as const;

/**
 * One chart, hovered at each of `HOVER_FRACTIONS`, recording which tones the
 * readout actually painted. True when at least one position opened a readout.
 */
async function sweepChartHovers(
  page: Page,
  at: { tab: string; theme: Theme },
  index: number,
  box: { x: number; y: number; width: number; height: number },
  samples: Sample[],
  tonesSwept: Set<string>,
): Promise<boolean> {
  let opened = 0;
  for (const fraction of HOVER_FRACTIONS) {
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    await page.waitForTimeout(50);
    const state = `hover chart ${index + 1} at ${fraction}`;
    if ((await sweepState(page, { ...at, state }, samples, TOOLTIP)) > 0) opened += 1;
    // Read off the rendered attribute, never parsed back out of a sample's
    // text: a tone is a colour decision the component made, and inferring it
    // from a minus sign would be a second, independent reading of the very
    // thing being checked.
    for (const tone of TONES) {
      const painted = await page.locator(`${TOOLTIP} [data-tooltip-tone="${tone}"]`).count();
      if (painted > 0) tonesSwept.add(tone);
    }
  }
  return opened > 0;
}

/** The Flow tab's Sankey band elements, one per rendered link. */
const FLOW_LINK = "[data-flow-link]";

/**
 * The Flow tab's Sankey is `role="group"`, not `role="img"`: its bands are
 * individually interactive, so the generic `sweepHovers` loop above -- which
 * only ever looks at `svg[role="img"]` -- never reaches it. This scrolls the
 * chart into view, hovers the widest band (the largest single money flow,
 * read off its own `stroke-width`), and measures the readout that opens.
 * Returns false when no band could be found or hovered, so the caller can
 * fail the run outright: an unhovered Sankey is exactly the kind of silent
 * hole `bun run contrast`'s own history warns against.
 */
async function sweepFlowSankey(
  page: Page,
  at: { tab: string; theme: Theme },
  samples: Sample[],
): Promise<boolean> {
  const chart = page.locator('svg[role="group"]').first();
  if ((await chart.count()) === 0) return false;
  await chart.scrollIntoViewIfNeeded().catch(() => undefined);

  // A screen point actually on the largest band's own path, not the
  // element's `getBoundingClientRect()`: an SVG path's box is the geometry
  // of its centreline, with no allowance for `stroke-width` at all, so a
  // curved band -- every band here is a bezier -- can report a box a few
  // pixels tall regardless of how wide the rendered stroke actually is.
  // The exact geometric midpoint has its own failure: `NodeLabels` paints
  // labels after the links, so a midpoint that happens to fall under a
  // node's own label (the widest band on the real corpus does, landing
  // under "Non registered") hovers the label instead and opens nothing.
  // Sampling several points along the path and keeping the first one
  // `elementFromPoint` actually resolves back to the path -- the same test
  // the real pointer's hit-testing performs -- finds a pixel the mouse can
  // truly land on rather than trusting the geometry alone.
  const point = await page.evaluate((selector) => {
    let best: Element | null = null;
    let bestWidth = -1;
    for (const link of document.querySelectorAll(selector)) {
      const width = Number(link.getAttribute("stroke-width") ?? "0");
      if (width > bestWidth) {
        bestWidth = width;
        best = link;
      }
    }
    if (!(best instanceof SVGPathElement)) return null;
    const ctm = best.getScreenCTM();
    if (ctm === null) return null;
    const length = best.getTotalLength();
    for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
      const p = best.getPointAtLength(length * fraction);
      const x = p.x * ctm.a + p.y * ctm.c + ctm.e;
      const y = p.x * ctm.b + p.y * ctm.d + ctm.f;
      if (document.elementFromPoint(x, y) === best) return { x, y };
    }
    return null;
  }, FLOW_LINK);
  if (point === null) return false;

  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(50);
  const opened = await sweepState(page, { ...at, state: "hover flow band" }, samples, TOOLTIP);
  await page.mouse.move(AWAY.x, AWAY.y);
  return opened > 0;
}

async function sweepHovers(
  page: Page,
  at: { tab: string; theme: Theme },
  samples: Sample[],
  problems: string[],
  tonesSwept: Set<string>,
): Promise<number> {
  const charts = await page.locator('svg[role="img"]').all();
  let opened = 0;
  let leakReported = false;
  for (const [index, chart] of charts.entries()) {
    // The pointer can only be moved within the viewport, so a chart below the
    // fold is unreachable and opens nothing. Skipping the scroll made this
    // loop measure only the first chart on every tab -- the portfolio one,
    // which sits above the tab strip -- while reporting a clean hover sweep.
    // Read the box AFTER scrolling, or it is the pre-scroll position.
    await chart.scrollIntoViewIfNeeded().catch(() => undefined);
    const box = await chart.boundingBox();
    if (box === null || box.width < 40 || box.height < 20) continue;

    await page.mouse.move(AWAY.x, AWAY.y);
    await page.waitForTimeout(20);
    if (!leakReported && (await page.locator(TOOLTIP).count()) > 0) {
      leakReported = true;
      problems.push(
        `${at.theme}/${at.tab} a readout stayed open after the pointer left the chart, ` +
          "so a hover sample cannot be attributed to the chart it names",
      );
    }

    if (await sweepChartHovers(page, at, index, box, samples, tonesSwept)) opened += 1;
  }
  await page.mouse.move(AWAY.x, AWAY.y);
  return opened;
}

/**
 * Switches the portfolio chart to its return mode, sweeps it, and switches
 * back. Returns false when the toggle did not take, so a silently failed
 * click cannot pass as coverage.
 */
async function sweepReturnChart(
  page: Page,
  at: { tab: string; theme: Theme },
  samples: Sample[],
  tonesSwept: Set<string>,
): Promise<boolean> {
  const toggle = page.getByRole("radio", { name: RETURN_MODE, exact: true });
  if ((await toggle.count()) === 0) return false;
  await toggle.click();
  const took = await page
    .waitForFunction(
      ({ name, group }) =>
        document
          .querySelector(`${group} [role="radio"][aria-checked="true"]`)
          ?.textContent?.includes(name) === true,
      { name: RETURN_MODE, group: CHART_GROUP },
      { timeout: 2000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!took) return false;

  await page.waitForTimeout(150);
  await sweepState(page, { ...at, state: "chart return" }, samples);
  const chart = page.locator("[data-return-chart]");
  const box = (await chart.count()) > 0 ? await chart.boundingBox() : null;
  if (box !== null) {
    await sweepChartHovers(page, { ...at, tab: `${at.tab} return` }, 0, box, samples, tonesSwept);
  }
  await page.getByRole("radio", { name: "Value", exact: true }).click();
  await page.waitForTimeout(100);
  return true;
}

/**
 * Each non-default overview lens, selected and swept. The account lens is
 * the only one that can paint a per-account loss, so a run that never
 * reaches it has not measured that colour.
 */
async function sweepLenses(
  page: Page,
  { tab, theme }: { tab: string; theme: Theme },
  samples: Sample[],
  problems: string[],
  lensesSwept: Set<string>,
): Promise<void> {
  for (const lens of EXTRA_LENSES) {
    const control = page.getByRole("radio", { name: lens, exact: true });
    await control.click();
    // Prove the lens took, the same way `applyTheme` proves the theme
    // did by reading the page's own background back. Without this the
    // guard below only shows that SOME text was swept under a lens
    // label: a click that silently failed would sweep the default lens
    // a second time, count as covered, and hide the loss colour again.
    //
    // Scoped to the lens toggle's OWN radiogroup. It used to read the
    // document's first checked radio, which worked only while the lens
    // was the only such control on the page; the year and chart
    // controls now render above it, so the unscoped query returned
    // "All time" and this guard failed a lens that had switched
    // perfectly well.
    // Both the name AND the selector are passed in. A `waitForFunction`
    // body runs in the BROWSER, so a module constant referenced inside
    // it is an undefined identifier there: the function throws, the
    // wait times out, and the failure reads as "the lens never
    // switched" for a lens that switched perfectly well.
    await page
      .waitForFunction(
        ({ name, group }) =>
          document
            .querySelector(`${group} [role="radio"][aria-checked="true"]`)
            ?.textContent?.includes(name) === true,
        { name: lens, group: LENS_GROUP },
        { timeout: 2000 },
      )
      .catch(() => {
        problems.push(`${theme}/${tab} the ${lens} lens never became the selected one`);
      });
    await page.waitForTimeout(150);
    const state = `lens ${lens.toLowerCase()}`;
    const inLens = await sweepState(page, { tab, theme, state }, samples);
    if (inLens < MIN_RUNS_PER_TAB) {
      problems.push(`${theme}/${tab} ${state} swept only ${inLens} runs; the lens is empty`);
    } else {
      // Recorded by the lens itself, never by parsing `state` back out of
      // the samples. A guard that reads a label it also writes is
      // measuring its own formatting, and renaming the label would then
      // either break the guard or quietly satisfy it.
      lensesSwept.add(lens);
    }
  }
}

interface ThemeSweepState {
  samples: Sample[];
  problems: string[];
  hovered: number;
  lensesSwept: Set<string>;
  tonesSwept: Set<string>;
  chartModesSwept: Set<string>;
}

/** One tab's whole sweep: the default state, its lenses/return mode if it has any, and every hover. */
async function sweepTab(
  page: Page,
  tab: string,
  theme: Theme,
  state: ThemeSweepState,
): Promise<void> {
  const { samples, problems, lensesSwept, tonesSwept, chartModesSwept } = state;
  await showTab(page, tab);
  const found = await sweepState(page, { tab, theme, state: "default" }, samples);
  if (found < MIN_RUNS_PER_TAB) {
    problems.push(`${theme}/${tab} swept only ${found} runs of text; the tab is empty`);
  }

  if (tab === "portfolio") {
    await sweepLenses(page, { tab, theme }, samples, problems, lensesSwept);
  }

  state.hovered += await sweepHovers(page, { tab, theme }, samples, problems, tonesSwept);

  if (tab === "flow") {
    const swept = await sweepFlowSankey(page, { tab, theme }, samples);
    if (!swept) problems.push(`${theme}/${tab} no [data-flow-link] band was hovered`);
    state.hovered += swept ? 1 : 0;
  }

  if (tab === "portfolio") {
    const swept = await sweepReturnChart(page, { tab, theme }, samples, tonesSwept);
    if (swept) chartModesSwept.add(RETURN_MODE);
    else problems.push(`${theme}/${tab} the ${RETURN_MODE} chart never became the selected one`);
    state.hovered += swept ? 1 : 0;
  }
}

async function sweepTheme(browser: Browser, url: string, theme: Theme): Promise<ThemeSweepState> {
  // Always a light OS preference, so `inherit` and the toggle behave the same
  // way in both passes and `applyTheme` needs at most one click.
  const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce" });
  const state: ThemeSweepState = {
    samples: [],
    problems: [],
    hovered: 0,
    lensesSwept: new Set<string>(),
    tonesSwept: new Set<string>(),
    chartModesSwept: new Set<string>(),
  };
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await applyTheme(page, theme);
    for (const tab of TABS) await sweepTab(page, tab, theme, state);
  } finally {
    await context.close();
  }
  return state;
}

async function sweep(): Promise<{ samples: Sample[]; problems: string[] }> {
  const { createServer } = await import("vite");
  const server = await createServer({ root: APP_ROOT, logLevel: "warn" });
  await server.listen();
  const browser = await chromium.launch();
  const samples: Sample[] = [];
  const problems: string[] = [];
  const lensesSwept = new Set<string>();
  const tonesSwept = new Set<string>();
  const chartModesSwept = new Set<string>();
  let hovered = 0;
  try {
    const url = server.resolvedUrls?.local[0];
    if (url === undefined) throw new Error("vite gave no local URL to open");
    for (const theme of THEMES) {
      const swept = await sweepTheme(browser, url, theme);
      samples.push(...swept.samples);
      problems.push(...swept.problems);
      hovered += swept.hovered;
      for (const lens of swept.lensesSwept) lensesSwept.add(lens);
      for (const tone of swept.tonesSwept) tonesSwept.add(tone);
      for (const mode of swept.chartModesSwept) chartModesSwept.add(mode);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  // The guard against this gate going blind again. It reported AA pass for a
  // whole build phase while never once measuring a tooltip, because it never
  // hovered: an unvisited state yields no sample, no sample yields no failure,
  // and no failure reads exactly like a pass. If the hover path silently stops
  // working -- a renamed hook, a changed selector, a chart that no longer
  // takes a cursor -- this says so instead of quietly passing.
  if (hovered === 0) {
    problems.push(
      "no chart readout was measured anywhere in the run; the hover sweep reached nothing",
    );
  }
  const missed = EXTRA_LENSES.filter((lens) => !lensesSwept.has(lens));
  if (missed.length > 0) {
    problems.push(`overview lenses never swept: ${missed.join(", ")}`);
  }
  // The same failure the lens guard catches, one level down. A readout paints
  // a gain green and a loss red, and a run that hovered only gaining months
  // measured one of those two colours and called the sweep clean. The corpus
  // holds both, so both must appear; if a future corpus genuinely holds no
  // loss, this fails loudly and says so rather than going quietly unmeasured.
  if (!chartModesSwept.has(RETURN_MODE)) {
    problems.push(
      `the ${RETURN_MODE} chart was never swept, so its axis, line and readout are unmeasured`,
    );
  }
  const untoned = TONES.filter((tone) => !tonesSwept.has(tone));
  if (untoned.length > 0) {
    problems.push(
      `readout tones never rendered, so their contrast is unmeasured: ${untoned.join(", ")}`,
    );
  }
  return { samples, problems };
}

async function main(): Promise<number> {
  const { samples, problems } = await sweep();
  const bad = failures(samples);
  console.log(`\nswept ${samples.length} runs of text across ${TABS.length} tabs and 2 themes`);
  console.log(formatSummary(samples));
  for (const problem of problems) console.log(`PROBLEM  ${problem}`);
  if (bad.length > 0) {
    console.log(`\n${bad.length} contrast failures:\n`);
    for (const sample of bad) console.log(`${formatFailure(sample)}\n`);
  }
  const ok = bad.length === 0 && problems.length === 0;
  console.log(ok ? "\nAA contrast: pass" : "\nAA contrast: FAIL");
  return ok ? 0 : 1;
}

process.exitCode = await main();
