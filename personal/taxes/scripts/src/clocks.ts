/** "Three clocks": the corporate year, the HST year and the personal year drawn on one time axis,
    so it is obvious which period a return covers and when it is due. */

import { dayMs, escapeHtml, plainDate } from "./format";
import type { Filing, FilingKind } from "./types";

export interface Lane {
  readonly kind: FilingKind;
  readonly label: string;
  readonly hint: string;
}

export const LANES: readonly Lane[] = [
  { kind: "T2", label: "Corporate year", hint: "Jan to Dec, T2 return" },
  { kind: "HST", label: "HST year", hint: "Aug 15 to Aug 14, HST return" },
  { kind: "T1", label: "Personal year", hint: "Jan to Dec, T1 return" },
];

/** Space between back-to-back periods so consecutive returns read as separate bars. */
const BAR_GAP = 2;

export interface Bar {
  readonly filing: Filing;
  readonly lane: number;
  readonly x: number;
  readonly width: number;
  readonly dueX: number | null;
}

/** Maps an ISO date onto [0, width] between start and end, clamped to the axis. */
export function xOf(iso: string, start: string, end: string, width: number): number {
  const t0 = dayMs(start);
  const t1 = dayMs(end);
  const t = dayMs(iso);
  const ratio = (t - t0) / (t1 - t0);
  return Math.max(0, Math.min(width, ratio * width));
}

export function bars(filings: readonly Filing[], start: string, end: string, width: number): Bar[] {
  return filings.flatMap((f) => {
    const lane = LANES.findIndex((l) => l.kind === f.kind);
    if (lane < 0) return [];
    const x = xOf(f.period_start, start, end, width);
    const right = xOf(f.period_end, start, end, width);
    const dueX = f.due ? xOf(f.due, start, end, width) : null;
    return [{ filing: f, lane, x, width: Math.max(2, right - x - BAR_GAP), dueX }];
  });
}

/** Left padding inside the SVG; the lane names live in an HTML column pinned beside it. */
const LABEL_W = 8;
const PLOT_W = 860;
const LANE_H = 46;
const TOP = 26;

function yearTicks(start: string, end: string): string {
  const first = Number(start.slice(0, 4)) + 1;
  const last = Number(end.slice(0, 4));
  const ticks: string[] = [];
  for (let y = first; y <= last; y++) {
    const x = LABEL_W + xOf(`${y}-01-01`, start, end, PLOT_W);
    const bottom = TOP + LANES.length * LANE_H;
    ticks.push(
      `<line class="clk-grid" x1="${x}" x2="${x}" y1="${TOP - 6}" y2="${bottom}" />` +
        `<text class="clk-year" x="${x + 4}" y="${TOP - 10}">${y}</text>`,
    );
  }
  return ticks.join("");
}

function barSvg(b: Bar): string {
  const y = TOP + b.lane * LANE_H + 10;
  const f = b.filing;
  const label = `${f.title}: ${plainDate(f.period_start)} to ${plainDate(f.period_end)}, ${f.status}`;
  const due =
    b.dueX === null
      ? ""
      : `<path class="clk-due" d="M ${LABEL_W + b.dueX} ${y - 3} l 5 -7 h -10 z"><title>Due ${plainDate(f.due)}</title></path>`;
  return `<a href="filings.html#${f.id}" aria-label="${escapeHtml(label)}"><rect class="clk-bar clk-${f.status}" x="${LABEL_W + b.x}" y="${y}" width="${b.width}" height="${LANE_H - 20}" rx="2"><title>${escapeHtml(label)}</title></rect></a>${due}`;
}

export function clocksSvg(
  filings: readonly Filing[],
  start: string,
  end: string,
  today: string,
): string {
  const height = TOP + LANES.length * LANE_H + 8;
  const todayX = LABEL_W + xOf(today, start, end, PLOT_W);
  const body = bars(filings, start, end, PLOT_W).map(barSvg).join("");
  const width = LABEL_W + PLOT_W + 10;
  const names = LANES.map(
    (l) =>
      `<li style="height:${LANE_H}px"><span class="clk-lane">${l.label}</span><span class="clk-hint">${l.hint}</span></li>`,
  ).join("");
  return `<div class="clk-wrap"><ul class="clk-lanes" style="padding-top:${TOP}px" aria-hidden="true">${names}</ul><svg class="clk" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="clk-title">
  <title id="clk-title">Every tax period from incorporation to next year, one row per kind of return</title>
  ${yearTicks(start, end)}${body}
  <line class="clk-today" x1="${todayX}" x2="${todayX}" y1="${TOP - 6}" y2="${height - 4}" />
  <text class="clk-today-label" x="${todayX + 4}" y="${height - 6}">Today</text>
</svg></div>`;
}
