import type { DerivedReturnReason, ReturnPoint, ReturnSeries } from "../../analytics/returns";
import type { AccountSeries } from "../../analytics/types";
import type { Returns } from "../../types";
import { formatRate } from "../format";
import { formatPeriodLabel } from "./plot";

/**
 * Why a month has no rate to plot.
 *
 * The first three are `DerivedReturnReason` passed through untouched, so the
 * pipeline stays the one authority on why a derived figure is absent. The
 * fourth is this layer's own: a `"stated"` point whose statement printed no
 * current-period rate. Wealthsimple prints `0.00%` for a horizon shorter than
 * the account's life, already parsed to null upstream rather than a measured
 * zero, and the chart has to keep it that way.
 */
export type ReturnGap = DerivedReturnReason | "no-stated-rate";

/** One month of one account, ready to plot. */
export interface ReturnValuePoint {
  /** `YYYY-MM`. */
  period: string;
  /**
   * The rate to plot, percent, at the precision the source states. Null when
   * there is nothing to plot, in which case `gap` says why -- never zero, and
   * never a neighbour's figure carried across.
   */
  rate: number | null;
  /** The whole stated block, so the readout can reach every horizon. Null on a derived point. */
  statedMwr: Returns | null;
  /** Populated exactly when `rate` is null. */
  gap: ReturnGap | null;
}

/** One account's returns, with the identity its card needs to name itself. */
export interface AccountReturns {
  maskedId: string;
  shortId: string;
  label: string;
  /** False for the Chequing accounts, which the card marks the same way the Overview does. */
  inTotals: boolean;
  /** Uniform across an account's points -- see `ReturnPoint.source`. */
  source: "stated" | "derived";
  /** Oldest period first. */
  points: ReturnValuePoint[];
}

/** How many accounts state their rates versus compute them, the figure the provenance line prints. */
export interface ReturnsProvenance {
  stated: number;
  derived: number;
  total: number;
}

/**
 * A stated point plots the statement's own current-period rate. A null there
 * is a horizon the statement did not state, which is a gap and not a zero --
 * see `ReturnGap`.
 */
function statedValue(point: ReturnPoint): ReturnValuePoint {
  const rate = point.statedMwr?.currentPeriod ?? null;
  return {
    period: point.period,
    rate,
    statedMwr: point.statedMwr,
    gap: rate === null ? "no-stated-rate" : null,
  };
}

/**
 * A derived point plots `periodReturn`, and carries the pipeline's own reason
 * when that is null. The reason is passed through rather than re-derived: an
 * earlier version of this pipeline published a 186% month, and the book-cost
 * check that removed it lives upstream, not here.
 */
function derivedValue(point: ReturnPoint): ReturnValuePoint {
  return {
    period: point.period,
    rate: point.periodReturn,
    statedMwr: null,
    gap: point.periodReturn === null ? (point.reason ?? "insufficient-data") : null,
  };
}

/**
 * One `AccountReturns` per entry in `returns`, stated accounts first.
 *
 * The order is what makes the provenance claim land: the two accounts whose
 * rates Wealthsimple itself printed are the first two cards, and everything
 * below them is this project's own arithmetic. `series` supplies the display
 * label and `inTotals`; an account `series` does not name falls back to its
 * masked id, which is already safe to print.
 */
export function buildReturnsSeries(
  returns: readonly ReturnSeries[],
  series: readonly AccountSeries[],
): AccountReturns[] {
  const byId = new Map(series.map((account) => [account.maskedId, account]));

  const built = returns.map((entry): AccountReturns => {
    const account = byId.get(entry.maskedId);
    const source = entry.points[0]?.source ?? "derived";
    return {
      maskedId: entry.maskedId,
      shortId: account?.shortId ?? entry.maskedId,
      label: account?.label ?? entry.maskedId,
      inTotals: account?.inTotals ?? false,
      source,
      points: entry.points.map(source === "stated" ? statedValue : derivedValue),
    };
  });

  return [
    ...built.filter((a) => a.source === "stated"),
    ...built.filter((a) => a.source !== "stated"),
  ];
}

/** How many of an account's months actually have a figure. */
export function plottedCount(points: readonly ReturnValuePoint[]): number {
  return points.filter((point) => point.rate !== null).length;
}

/** A `YYYY-MM` as a count of months, so two periods can be tested for adjacency. */
function monthIndex(period: string): number {
  const [year, month] = period.split("-").map(Number);
  return (year ?? 0) * 12 + (month ?? 1);
}

/**
 * The runs of consecutive plottable months, each drawn as its own line.
 *
 * Two things end a run, and both have to: a month with no figure, and a month
 * the account has no point for at all. Either would otherwise be spanned by a
 * straight segment, which reads as a measured path between two figures rather
 * than as the absence it is. The managed RRSP's statements print no rate for
 * three of its six months; joining across them would draw a trend nobody
 * measured.
 */
export function returnSegments(points: readonly ReturnValuePoint[]): readonly ReturnValuePoint[][] {
  const segments: ReturnValuePoint[][] = [];
  let current: ReturnValuePoint[] = [];
  let previousIndex: number | null = null;

  for (const point of points) {
    const index = monthIndex(point.period);
    if (point.rate === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      previousIndex = null;
      continue;
    }
    if (previousIndex !== null && index !== previousIndex + 1) {
      segments.push(current);
      current = [];
    }
    current.push(point);
    previousIndex = index;
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

/** The `[min, max]` plotted rate across every account, the shared y domain. Null when nothing is plottable. */
export function returnsRateExtent(
  accounts: readonly AccountReturns[],
): readonly [number, number] | null {
  const rates = accounts
    .flatMap((account) => account.points)
    .map((point) => point.rate)
    .filter((rate): rate is number => rate !== null);
  const first = rates[0];
  if (first === undefined) return null;
  return [Math.min(...rates), Math.max(...rates)];
}

/**
 * The `[first, last]` period across every account, the shared x domain, so
 * one card's line cannot imply more history than it has. Includes months with
 * no figure: they are still months the account reported in.
 */
export function returnsPeriodExtent(
  accounts: readonly AccountReturns[],
): readonly [string, string] | null {
  const periods = accounts.flatMap((account) => account.points).map((point) => point.period);
  const first = periods[0];
  if (first === undefined) return null;
  return [periods.reduce((a, b) => (b < a ? b : a)), periods.reduce((a, b) => (b > a ? b : a))];
}

/** The stated/derived split the provenance line states in words. */
export function provenance(accounts: readonly AccountReturns[]): ReturnsProvenance {
  const stated = accounts.filter((account) => account.source === "stated").length;
  return { stated, derived: accounts.length - stated, total: accounts.length };
}

/** Every reason an account has a gap, each named once, in first-seen order. */
export function distinctGaps(points: readonly ReturnValuePoint[]): ReturnGap[] {
  const seen: ReturnGap[] = [];
  for (const point of points) {
    if (point.gap !== null && !seen.includes(point.gap)) seen.push(point.gap);
  }
  return seen;
}

const GAP_PHRASES: Readonly<Record<ReturnGap, string>> = {
  "no-prior-period": "no earlier statement to compare against",
  "insufficient-data": "a market value is missing for this month or the one before",
  "unreconciled-flow":
    "money moved in a way the cash records cannot confirm, so a return here would mislead",
  "no-stated-rate": "the statement printed no rate for this month",
};

/** A gap as a sentence fragment a reader can act on, rather than a slug. */
export function gapPhrase(gap: ReturnGap): string {
  return GAP_PHRASES[gap];
}

const HORIZON_LABELS: readonly (readonly [keyof Returns, string])[] = [
  ["currentPeriod", "This month"],
  ["oneYear", "One year"],
  ["threeYears", "Three years"],
  ["fiveYears", "Five years"],
  ["tenYears", "Ten years"],
  ["sinceInception", "Since inception"],
];

/**
 * A stated month's horizons: one line per rate the statement actually states,
 * then one line naming the horizons it does not.
 *
 * The naming line is the point of this function. Three years, five years and
 * ten years are null on all 21 stated points in the corpus, because neither
 * account is that old. Dropping them silently would leave a reader to guess
 * whether the rate was zero or absent; printing them as `0.00%` would answer
 * that question wrongly.
 */
function statedLines(point: ReturnValuePoint): string[] {
  const stated = point.statedMwr;
  if (stated === null) return ["No rate stated for this month"];

  const lines: string[] = [];
  const missing: string[] = [];
  for (const [key, label] of HORIZON_LABELS) {
    const value = stated[key];
    // The current period gets its own line when it is absent, below, rather
    // than joining the not-applicable list: a month with no rate is not the
    // same fact as a ten-year horizon on a one-year-old account.
    if (value !== null) lines.push(`${label} ${formatRate(value)}`);
    else if (key !== "currentPeriod") missing.push(label.toLowerCase());
  }
  if (point.rate === null) lines.unshift("No rate stated for this month");
  if (missing.length > 0) {
    lines.push(`Not applicable at this account's age: ${missing.join(", ")}`);
  }
  return lines;
}

/** A derived month: its figure, or the reason it has none. */
function derivedLines(point: ReturnValuePoint): string[] {
  if (point.rate === null) {
    return [`No figure: ${gapPhrase(point.gap ?? "insufficient-data")}`];
  }
  return [`This month ${formatRate(point.rate)}`];
}

/**
 * What the cursor says about one month of one account, one line at a time.
 *
 * Pure, and the single source of all three copies: the visible tooltip, the
 * live announcement and the chart's accessible name are all built from one
 * call. Two independently written copies of the same figures is how this
 * project shipped an announced $241,740 beside a rendered $241,739.67.
 *
 * A null `point` is a month the account has no statement for, and it prints
 * no figure at all. Neither does a month whose figure is absent: it prints
 * the reason instead, which is the whole difference between "the return was
 * nothing" and "there is no return to state".
 */
export function returnsTooltipLines(
  period: string,
  point: ReturnValuePoint | null,
  source: "stated" | "derived",
): string[] {
  const label = formatPeriodLabel(period);
  if (point === null) return [label, "No statement for this month"];
  if (source === "stated") {
    return [label, "Stated on the statement", ...statedLines(point)];
  }
  return [label, "Derived here, not stated on a statement", ...derivedLines(point)];
}
