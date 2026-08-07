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
 * Deliberately outside `bun run check`: it needs Chromium and a dev server and
 * takes about fifteen seconds, where the rest of that gate is milliseconds. Run
 * it before shipping anything that changes a colour, a weight or a size.
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

async function sweepTheme(
  browser: Browser,
  url: string,
  theme: Theme,
): Promise<{ samples: Sample[]; problems: string[] }> {
  // Always a light OS preference, so `inherit` and the toggle behave the same
  // way in both passes and `applyTheme` needs at most one click.
  const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce" });
  const samples: Sample[] = [];
  const problems: string[] = [];
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await applyTheme(page, theme);
    for (const tab of TABS) {
      await showTab(page, tab);
      const raw = await page.evaluate(collectSamples);
      if (raw.length < MIN_RUNS_PER_TAB) {
        problems.push(`${theme}/${tab} swept only ${raw.length} runs of text; the tab is empty`);
      }
      for (const sample of raw) samples.push(measureSample(sample, { tab, theme }));
    }
  } finally {
    await context.close();
  }
  return { samples, problems };
}

async function sweep(): Promise<{ samples: Sample[]; problems: string[] }> {
  const { createServer } = await import("vite");
  const server = await createServer({ root: APP_ROOT, logLevel: "warn" });
  await server.listen();
  const browser = await chromium.launch();
  const samples: Sample[] = [];
  const problems: string[] = [];
  try {
    const url = server.resolvedUrls?.local[0];
    if (url === undefined) throw new Error("vite gave no local URL to open");
    for (const theme of THEMES) {
      const swept = await sweepTheme(browser, url, theme);
      samples.push(...swept.samples);
      problems.push(...swept.problems);
    }
  } finally {
    await browser.close();
    await server.close();
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
