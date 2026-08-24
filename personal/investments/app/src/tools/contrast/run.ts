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
async function sweepHovers(
  page: Page,
  at: { tab: string; theme: Theme },
  samples: Sample[],
  problems: string[],
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

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(50);
    const found = await sweepState(
      page,
      { ...at, state: `hover chart ${index + 1}` },
      samples,
      TOOLTIP,
    );
    if (found > 0) opened += 1;
  }
  await page.mouse.move(AWAY.x, AWAY.y);
  return opened;
}

async function sweepTheme(
  browser: Browser,
  url: string,
  theme: Theme,
): Promise<{ samples: Sample[]; problems: string[]; hovered: number }> {
  // Always a light OS preference, so `inherit` and the toggle behave the same
  // way in both passes and `applyTheme` needs at most one click.
  const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce" });
  const samples: Sample[] = [];
  const problems: string[] = [];
  let hovered = 0;
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await applyTheme(page, theme);
    for (const tab of TABS) {
      await showTab(page, tab);
      const found = await sweepState(page, { tab, theme, state: "default" }, samples);
      if (found < MIN_RUNS_PER_TAB) {
        problems.push(`${theme}/${tab} swept only ${found} runs of text; the tab is empty`);
      }

      if (tab === "overview") {
        for (const lens of EXTRA_LENSES) {
          const control = page.getByRole("radio", { name: lens, exact: true });
          await control.click();
          await page.waitForTimeout(150);
          const state = `lens ${lens.toLowerCase()}`;
          const inLens = await sweepState(page, { tab, theme, state }, samples);
          if (inLens < MIN_RUNS_PER_TAB) {
            problems.push(`${theme}/${tab} ${state} swept only ${inLens} runs; the lens is empty`);
          }
        }
      }

      hovered += await sweepHovers(page, { tab, theme }, samples, problems);
    }
  } finally {
    await context.close();
  }
  return { samples, problems, hovered };
}

async function sweep(): Promise<{ samples: Sample[]; problems: string[] }> {
  const { createServer } = await import("vite");
  const server = await createServer({ root: APP_ROOT, logLevel: "warn" });
  await server.listen();
  const browser = await chromium.launch();
  const samples: Sample[] = [];
  const problems: string[] = [];
  let hovered = 0;
  try {
    const url = server.resolvedUrls?.local[0];
    if (url === undefined) throw new Error("vite gave no local URL to open");
    for (const theme of THEMES) {
      const swept = await sweepTheme(browser, url, theme);
      samples.push(...swept.samples);
      problems.push(...swept.problems);
      hovered += swept.hovered;
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
  const lensStates = new Set(
    samples.filter((sample) => sample.state.startsWith("lens ")).map((sample) => sample.state),
  );
  if (lensStates.size < EXTRA_LENSES.length) {
    problems.push(
      `only ${lensStates.size} of ${EXTRA_LENSES.length} non-default overview lenses were swept`,
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
