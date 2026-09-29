import type { FlowPeriod } from "../analytics/flows/period";
import { allTime, latestMonth } from "../analytics/flows/period";
import type { FlowsData } from "../analytics/flows/types";

/** Which shape of period control is showing: a fixed month, a chosen month, a year, a range, or all time. */
export type FlowPeriodPreset = "thisMonth" | "month" | "year" | "range" | "allTime";

/** Every period the corpus's cash blocks cover, oldest first, `YYYY-MM`. */
export function monthOptions(data: FlowsData): string[] {
  return [...new Set(data.blocks.map((b) => b.period))].sort();
}

/** Every calendar year the corpus's cash blocks cover, oldest first. */
export function yearOptions(data: FlowsData): number[] {
  return [...new Set(monthOptions(data).map((p) => Number(p.slice(0, 4))))].sort((a, b) => a - b);
}

/**
 * Which preset a period reads as, so the controls show the matching selects
 * on first render and after a reload -- a pure function of the period
 * itself, never a second piece of state that could drift from the hash it
 * mirrors. A single month equal to the corpus's latest reads as "This
 * month"; any other single month reads as "Month".
 */
export function presetOf(data: FlowsData, period: FlowPeriod | "all"): FlowPeriodPreset {
  if (period === "all") return "allTime";
  if (period.from === period.to) {
    return period.from === latestMonth(data).from ? "thisMonth" : "month";
  }
  const year = period.from.slice(0, 4);
  if (period.from === `${year}-01` && period.to === `${year}-12`) return "year";
  return "range";
}

/** `period` resolved to a concrete span: "all time" becomes the corpus's own full range. */
export function resolvePeriod(data: FlowsData, period: FlowPeriod | "all"): FlowPeriod {
  return period === "all" ? allTime(data) : period;
}
