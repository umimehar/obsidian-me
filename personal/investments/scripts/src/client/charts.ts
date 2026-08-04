// Chart.js builders consuming already-shaped data from series.ts. This is
// the fix for the owner's complaint about the old hand-rolled SVG tooltips:
// Chart.js's built-in tooltip plugin, driven with `interaction: { mode:
// "index", intersect: false }`, tracks the cursor across the whole x-band
// instead of requiring a pixel-precise hover over a line/bar.
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { accountLabel, money } from "./format";
import type { ProjectionYear } from "./projection";
import type { AccountCost, CashflowSeries, PeriodSeries, TrendSeries } from "./series";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  // The per-account chart uses a log y-axis; Chart.js v4 is tree-shaken, so a
  // scale that is not registered silently renders nothing at all.
  LogarithmicScale,
  PointElement,
  Tooltip,
);

const instances = new Map<HTMLCanvasElement, Chart>();

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function replace(canvas: HTMLCanvasElement, build: () => Chart): Chart {
  instances.get(canvas)?.destroy();
  const chart = build();
  instances.set(canvas, chart);
  return chart;
}

// Line chart: capital-at-cost (filled area) vs cumulative net deposits
// (dashed reference line), sharing one label axis. The gap between the two
// lines is the gain beyond deposits.
export function capitalVsDepositsChart(canvas: HTMLCanvasElement, data: TrendSeries): Chart {
  const accent = cssVar("--color-accent");
  const text = cssVar("--color-text");
  return replace(canvas, () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("capitalVsDepositsChart: canvas has no 2d context");
    return new Chart(ctx, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "Portfolio at cost",
            data: data.capital,
            borderColor: accent,
            backgroundColor: `${accent}2e`,
            fill: true,
            tension: 0.15,
            pointRadius: 0,
          },
          {
            label: "Net deposits",
            data: data.deposits,
            borderColor: text,
            borderDash: [4, 4],
            backgroundColor: "transparent",
            fill: false,
            tension: 0,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: { x: { type: "category" }, y: { type: "linear" } },
        plugins: {
          legend: { display: true, labels: { color: text } },
          tooltip: {
            enabled: true,
            callbacks: { label: (item) => `${item.dataset.label}: ${money(item.parsed.y ?? 0)}` },
          },
        },
      },
    });
  });
}

// Bar chart: cost vs contributions per account (cost-by-account snapshot).
export function costBars(canvas: HTMLCanvasElement, rows: AccountCost[]): Chart {
  const accent = cssVar("--color-accent");
  const neutral = cssVar("--color-neutral-500");
  const text = cssVar("--color-text");
  return replace(canvas, () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("costBars: canvas has no 2d context");
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: rows.map((r) => accountLabel(r)),
        datasets: [
          { label: "At cost", data: rows.map((r) => r.cost), backgroundColor: accent },
          {
            label: "Contributions",
            data: rows.map((r) => r.contributions),
            backgroundColor: neutral,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: { x: { type: "category" }, y: { type: "linear" } },
        plugins: {
          legend: { display: true, labels: { color: text } },
          tooltip: {
            enabled: true,
            callbacks: { label: (item) => `${item.dataset.label}: ${money(item.parsed.y ?? 0)}` },
          },
        },
      },
    });
  });
}

// Bar chart: inflow (up) vs outflow (down) per period, sharing a zero line.
// `onPeriodClick` (optional) resolves a click on any bar to that bar's label
// — a month ("YYYY-MM") in month grain, or a bare year ("YYYY") in year
// grain — and fires the cashflow drill-down in sections.ts.
export function cashflowChart(
  canvas: HTMLCanvasElement,
  data: CashflowSeries,
  onPeriodClick?: (period: string) => void,
): Chart {
  const accent = cssVar("--color-accent");
  const neutral = cssVar("--color-neutral-500");
  const text = cssVar("--color-text");
  return replace(canvas, () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("cashflowChart: canvas has no 2d context");
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [
          { label: "Inflow", data: data.inflow, backgroundColor: accent },
          { label: "Outflow", data: data.outflow, backgroundColor: neutral },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: { x: { type: "category" }, y: { type: "linear" } },
        onClick: (_event, elements) => {
          const label = data.labels[elements[0]?.index ?? -1];
          if (onPeriodClick && label) onPeriodClick(label);
        },
        plugins: {
          legend: { display: true, labels: { color: text } },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (item) => `${item.dataset.label}: ${money(item.parsed.y ?? 0)}`,
              afterBody: (items) => {
                const first = items[0];
                if (!first) return [];
                const net = data.net[first.dataIndex];
                return net === undefined ? [] : [`Net: ${money(net)}`];
              },
            },
          },
        },
      },
    });
  });
}

// Stacked bar chart: cumulative contributions, cumulative government grants,
// and residual growth, one bar per projected year. The three series are
// deliberately never merged into one — grant money must never read as the
// owner's own contribution. Growth is the residual: value minus opening
// minus cumulative contributions minus cumulative grants, so the stack
// height (contributions + grants + growth) is the projection's gain over
// its opening balance, not the full portfolio value. Grant and growth use
// the two categorical series tokens added to personal.css: the accent and the
// neutral scale cannot carry a three-way stack (neutrals are greys, accent
// shades are one hue), so grant and growth get their own hues. Read through
// cssVar like every other chart, so the palette stays in the stylesheet.

export function projectionChart(
  canvas: HTMLCanvasElement,
  rows: ProjectionYear[],
  opening: number,
): Chart {
  const contribColor = cssVar("--color-accent");
  const grantColor = cssVar("--color-series-grant");
  const growthColor = cssVar("--color-series-growth");
  const text = cssVar("--color-text");
  return replace(canvas, () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("projectionChart: canvas has no 2d context");
    const contributions = rows.map((r) => r.cumulativeIn);
    const grants = rows.map((r) => r.cumulativeGrant);
    const growth = rows.map((r) => r.value - opening - r.cumulativeIn - r.cumulativeGrant);
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.year),
        datasets: [
          {
            label: "Contributions",
            data: contributions,
            backgroundColor: contribColor,
            stack: "projection",
          },
          {
            label: "Government grants",
            data: grants,
            backgroundColor: grantColor,
            stack: "projection",
          },
          {
            label: "Growth",
            data: growth,
            backgroundColor: growthColor,
            stack: "projection",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { type: "category", stacked: true },
          y: { type: "linear", stacked: true },
        },
        plugins: {
          legend: { display: true, labels: { color: text } },
          tooltip: {
            enabled: true,
            callbacks: { label: (item) => `${item.dataset.label}: ${money(item.parsed.y ?? 0)}` },
          },
        },
      },
    });
  });
}

// Single-series bar chart: income (dividends + interest) received per period.
export function incomeChart(canvas: HTMLCanvasElement, data: PeriodSeries): Chart {
  const accent = cssVar("--color-accent");
  return replace(canvas, () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("incomeChart: canvas has no 2d context");
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [{ label: "Income", data: data.values, backgroundColor: accent }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: { x: { type: "category" }, y: { type: "linear" } },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            callbacks: { label: (item) => `${item.dataset.label}: ${money(item.parsed.y ?? 0)}` },
          },
        },
      },
    });
  });
}

// One line per account. Colour is keyed to the account's own fixed slot, not
// its position in the list, so filtering the series set never repaints the
// survivors — a line keeps its colour whatever else is on screen. Slots are
// assigned in fixed order and never cycled; past the seventh the palette is
// exhausted, so the caller must cap the series count rather than reuse a hue.
const CATEGORICAL_SLOTS = 8;

export interface AccountLine {
  label: string;
  slot: number;
  values: number[];
}

export function accountProjectionChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  lines: AccountLine[],
): Chart {
  const text = cssVar("--color-text");
  const grid = cssVar("--color-divider");
  return replace(canvas, () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    return new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: lines.map((l) => {
          const colour = cssVar(`--color-cat-${(l.slot % CATEGORICAL_SLOTS) + 1}`);
          return {
            label: l.label,
            // A log axis cannot place zero, and a zeroed line (a closed FHSA)
            // would otherwise collapse the whole scale. null ends the line at
            // closure, which is what actually happens to the account.
            data: l.values.map((v) => (v > 0 ? v : null)),
            borderColor: colour,
            backgroundColor: colour,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.15,
            fill: false,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          // A legend is always present: with more than four lines these are not
          // direct-labelled, so the legend is the only non-colour identity cue
          // besides the year-by-year table below.
          legend: { display: true, position: "bottom", labels: { color: text, boxWidth: 12 } },
          tooltip: {
            // Largest account first. The default is dataset order, which is
            // the fixed colour-slot order and says nothing about size, so the
            // reader has to scan every row to find the biggest. Ranking by
            // value makes the hovered year readable at a glance. A closed
            // account's point is null and Chart.js drops it from the list.
            itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
            callbacks: { label: (item) => `${item.dataset.label}: ${money(item.parsed.y ?? 0)}` },
          },
        },
        scales: {
          x: { ticks: { color: text, maxTicksLimit: 10 }, grid: { display: false } },
          // Logarithmic, because thirty years of compounding across accounts
          // spanning three orders of magnitude is unreadable on a linear axis:
          // every line sits on the baseline until the last decade. On a log
          // axis a constant growth rate is a straight line, so the accounts
          // stay comparable throughout. A closed FHSA reaches exactly zero,
          // which a log scale cannot plot — Chart.js simply ends the line
          // there, which reads correctly as the account ceasing to exist.
          y: {
            type: "logarithmic",
            ticks: {
              color: text,
              callback: (v) => {
                const n = Number(v);
                // Label only the decade gridlines; Chart.js otherwise emits a
                // dense, unreadable run of intermediate log ticks.
                if (!(n > 0)) return "";
                const log = Math.log10(n);
                return Number.isInteger(log) ? money(n) : "";
              },
            },
            grid: { color: grid },
          },
        },
      },
    });
  });
}
