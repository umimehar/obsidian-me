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
  PointElement,
  Tooltip,
} from "chart.js";
import { money } from "./format";
import type { CashflowSeries, GrowthRow, PeriodSeries, TrendSeries } from "./series";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
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

// Line chart: capital-at-cost (filled area) vs cumulative contributions
// (dashed reference line), sharing one label axis.
export function contributionsChart(canvas: HTMLCanvasElement, data: TrendSeries): Chart {
  const accent = cssVar("--color-accent");
  const text = cssVar("--color-text");
  return replace(canvas, () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("contributionsChart: canvas has no 2d context");
    return new Chart(ctx, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "Capital at cost",
            data: data.capital,
            borderColor: accent,
            backgroundColor: `${accent}2e`,
            fill: true,
            tension: 0.15,
            pointRadius: 0,
          },
          {
            label: "Contributions",
            data: data.contributions,
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

// Bar chart: cost vs market value per account (growth-by-account snapshot).
export function growthBars(canvas: HTMLCanvasElement, rows: GrowthRow[]): Chart {
  const accent = cssVar("--color-accent");
  const neutral = cssVar("--color-neutral-500");
  const text = cssVar("--color-text");
  return replace(canvas, () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("growthBars: canvas has no 2d context");
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.name),
        datasets: [
          { label: "At cost", data: rows.map((r) => r.cost), backgroundColor: neutral },
          { label: "Market value", data: rows.map((r) => r.market), backgroundColor: accent },
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
export function cashflowChart(canvas: HTMLCanvasElement, data: CashflowSeries): Chart {
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
