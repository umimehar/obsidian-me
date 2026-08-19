/** Renders a year over year change in a cost table.

    The shared stylesheet maps `.pos` to the accent colour and `.neg` to a muted grey.
    On a page about a premium that rose, the increases are what the reader must not miss,
    so an increase takes the accent and a saving stays quiet. */

import { wholeMoney } from "./format";

export function deltaHtml(prior: number, renewal: number): string {
  const diff = renewal - prior;
  if (diff === 0) return '<span class="num">0</span>';
  const cls = diff > 0 ? "pos" : "neg";
  const sign = diff > 0 ? "+" : "-";
  return `<span class="num ${cls}">${sign}${wholeMoney(Math.abs(diff)).slice(1)}</span>`;
}
