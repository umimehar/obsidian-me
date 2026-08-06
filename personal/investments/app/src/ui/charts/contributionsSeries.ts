import type { AnalyticsOutput } from "../../analytics/build";
import { REGISTERED_KINDS, type RegisteredGroup, type RoomLine } from "../../analytics/rooms";
import type { AccountSeries } from "../../analytics/types";
import { formatCurrency } from "../format";
import { contributionsSourceFor } from "../wrappers/roomSource";
import { formatPeriodLabel } from "./plot";
import type { FigureSource } from "./source";

/**
 * A contribution figure that silently covers more than the month it is
 * stated in.
 *
 * A month's contribution is a delta between consecutive stated year-to-date
 * totals. When the months before it stated no total, the delta telescopes
 * over the whole gap, and `MonthPoint.contributionMonthsSpanned` records how
 * far. The managed RRSP's $12,000 is stated at 2025-11 and covers eleven
 * months; drawing it as a November contribution would be a claim the
 * statement does not make.
 */
export interface ContributionLump {
  shortId: string;
  /** `YYYY-MM`, the month the figure is stated in. */
  period: string;
  amount: number;
  monthsSpanned: number;
}

/** One wrapper's position for one calendar year: what went in, and against what, if anything. */
export interface ContributionYear {
  year: number;
  /**
   * Contributed that calendar year, straight off `RoomLine.used` -- nothing
   * is recomputed here.
   *
   * Null when no account in the wrapper has a statement covering the year at
   * all. `buildRoomLines` reports those years as `used: 0`, because it sums
   * a `contributionsByYear` map with no entry for them, and that zero is
   * exactly what must not reach a chart: the RESP's first statement is
   * 2026-01, so its 2023 is an absence and not a year it contributed
   * nothing. A null draws no bar.
   */
  contributed: number | null;
  /**
   * The annual ceiling, or null when there is none to draw.
   *
   * Null for RESP in every year: it has no annual contribution limit at all,
   * only the $50,000 lifetime cap, and no other wrapper's maximum may stand
   * in for it. Also null for a year with no `contributed`, since a ceiling
   * over an absent bar implies a wrapper that was not there.
   */
  limit: number | null;
  /** True only where the limit came from a notice of assessment, carry-forward already inside it. */
  assessed: boolean;
  /**
   * Null unless `assessed`. Against a generic annual maximum carry-forward
   * is invisible in statement data, so there is no remaining to state and a
   * bar past the line is not an over-contribution. There is deliberately no
   * over flag on this shape.
   */
  remaining: number | null;
  /** Null when the year has no figure to attribute a source to. `"derived"` wins over `"stated"` -- see `contributionsSourceFor`. */
  source: FigureSource | null;
  /** The `YYYY-MM`s inside the year whose statement stated no contributions figure at all, oldest first. */
  unstatedMonths: string[];
  /** Stated in month order. Empty in the normal case, where every delta covers its own month. */
  lumps: ContributionLump[];
}

export interface WrapperContributions {
  group: RegisteredGroup;
  /** One entry per year the corpus covers, oldest first, including the years this wrapper has no statement for. */
  years: ContributionYear[];
}

/** The share of a year's band the bar itself occupies, the rest being the gap between bars. */
const BAR_WIDTH_FRACTION = 0.6;

/** One year's slot on the x axis, in plot space. */
export interface YearBand {
  year: number;
  /** The bar's left edge. */
  x: number;
  width: number;
  /** The band's midpoint, where the cursor and the limit line are centred. */
  center: number;
}

/** The years laid out as even bands across `innerWidth`, each bar centred in its own. */
export function yearBands(years: readonly number[], innerWidth: number): YearBand[] {
  if (years.length === 0) return [];
  const band = innerWidth / years.length;
  const width = band * BAR_WIDTH_FRACTION;
  return years.map((year, index) => {
    const center = index * band + band / 2;
    return { year, x: center - width / 2, width, center };
  });
}

/** A year and the band it occupies, so the drawing code never pairs two arrays by index. */
export interface PlacedYear {
  band: YearBand;
  entry: ContributionYear;
}

export function placeYears(wrapper: WrapperContributions, innerWidth: number): PlacedYear[] {
  const bands = yearBands(
    wrapper.years.map((year) => year.year),
    innerWidth,
  );
  return wrapper.years.flatMap((entry) => {
    const band = bands.find((candidate) => candidate.year === entry.year);
    return band === undefined ? [] : [{ band, entry }];
  });
}

function accountsFor(series: readonly AccountSeries[], group: RegisteredGroup): AccountSeries[] {
  const kinds = REGISTERED_KINDS[group];
  return series.filter((account) => kinds.includes(account.kind));
}

/** Whether any account in the wrapper has a statement in that calendar year. This, not a non-zero total, is what makes a year drawable. */
function coversYear(accounts: readonly AccountSeries[], year: number): boolean {
  return accounts.some((account) =>
    account.months.some((month) => Number(month.period.slice(0, 4)) === year),
  );
}

function unstatedMonthsIn(accounts: readonly AccountSeries[], year: number): string[] {
  const periods = new Set<string>();
  for (const account of accounts) {
    for (const month of account.months) {
      if (Number(month.period.slice(0, 4)) !== year) continue;
      if (month.contributions === null) periods.add(month.period);
    }
  }
  return [...periods].sort();
}

/**
 * A zero spanning several months is not reported. It carries no figure to
 * misattribute, and the span on it is an artifact of the same telescoping:
 * the self-directed RRSP's 2025-08 states a zero spanning eight months,
 * which says nothing a reader needs warning about.
 */
function lumpsIn(accounts: readonly AccountSeries[], year: number): ContributionLump[] {
  const lumps: ContributionLump[] = [];
  for (const account of accounts) {
    for (const month of account.months) {
      if (Number(month.period.slice(0, 4)) !== year) continue;
      const amount = month.contributions;
      if (amount === null || amount === 0 || month.contributionMonthsSpanned <= 1) continue;
      lumps.push({
        shortId: account.shortId,
        period: month.period,
        amount,
        monthsSpanned: month.contributionMonthsSpanned,
      });
    }
  }
  return lumps.sort((a, b) => a.period.localeCompare(b.period));
}

function roomLineFor(
  analytics: AnalyticsOutput,
  group: RegisteredGroup,
  year: number,
): RoomLine | null {
  return (analytics.rooms[String(year)] ?? []).find((line) => line.group === group) ?? null;
}

/**
 * One wrapper-year. Everything about it collapses to nothing when the year
 * is uncovered, so the absence is enforced by the data rather than by every
 * consumer remembering to check.
 */
function buildYear(
  analytics: AnalyticsOutput,
  group: RegisteredGroup,
  year: number,
): ContributionYear {
  const accounts = accountsFor(analytics.series, group);
  const line = roomLineFor(analytics, group, year);

  if (line === null || !coversYear(accounts, year)) {
    return {
      year,
      contributed: null,
      limit: null,
      assessed: false,
      remaining: null,
      source: null,
      unstatedMonths: [],
      lumps: [],
    };
  }

  return {
    year,
    contributed: line.used,
    limit: line.limit,
    assessed: line.assessed,
    remaining: line.remaining,
    source: contributionsSourceFor(analytics.series, group, year),
    unstatedMonths: unstatedMonthsIn(accounts, year),
    lumps: lumpsIn(accounts, year),
  };
}

/**
 * Per-wrapper, per-year contributed totals, read off `analytics.rooms` and
 * `analytics.series` without recomputing either.
 *
 * The years come from `rooms`, so the axis is the corpus's own range rather
 * than the calendar's, and the wrapper order is the order `buildRoomLines`
 * states them in.
 */
export function buildContributionsSeries(analytics: AnalyticsOutput): WrapperContributions[] {
  const years = Object.keys(analytics.rooms)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);

  const groups: RegisteredGroup[] = [];
  for (const year of years) {
    for (const line of analytics.rooms[String(year)] ?? []) {
      if (!groups.includes(line.group)) groups.push(line.group);
    }
  }

  return groups.map((group) => ({
    group,
    years: years.map((year) => buildYear(analytics, group, year)),
  }));
}

/**
 * The top of one card's own y axis: the largest of everything that card
 * draws, bars and limit lines alike, so a limit above every bar still fits.
 * Null when the card has nothing to draw, which is the empty state.
 *
 * Per card, not shared across cards. The RESP's $3,000 and the RRSP's
 * $70,752 ceiling on one axis would flatten the RESP to two pixels, and
 * these cards exist to be read each against its own ceiling, not against
 * each other.
 */
export function contributionsMax(wrapper: WrapperContributions): number | null {
  const values: number[] = [];
  for (const year of wrapper.years) {
    if (year.contributed !== null) values.push(year.contributed);
    if (year.limit !== null) values.push(year.limit);
  }
  if (values[0] === undefined) return null;
  return Math.max(...values);
}

/** How many of a wrapper's years actually have a figure to draw. */
export function drawnYearCount(wrapper: WrapperContributions): number {
  return wrapper.years.filter((year) => year.contributed !== null).length;
}

/**
 * A year carrying the `period` key `useChartCursor` steps through.
 *
 * The cursor is shared with the time-series charts, where a period is a
 * `YYYY-MM`. Here it is a bare `YYYY`, which orders and compares the same
 * way, so the same hook drives both without either chart learning about the
 * other's axis.
 */
export type YearCursorPoint = ContributionYear & { period: string };

export function yearCursorPoints(wrapper: WrapperContributions): YearCursorPoint[] {
  return wrapper.years.map((year) => ({ ...year, period: String(year.year) }));
}

const SOURCE_LINE: Readonly<Record<FigureSource, string>> = {
  stated: "Stated on the statements",
  derived: "Derived here, not stated on a statement",
};

/** The limit, in the words the wrappers tab already uses, so the two views cannot say different things about one ceiling. */
function limitLines(entry: ContributionYear): string[] {
  if (entry.limit === null) return ["No annual contribution limit"];
  if (entry.assessed) {
    const remaining =
      entry.remaining === null
        ? `Against the ${formatCurrency(entry.limit)} assessed limit`
        : `${formatCurrency(entry.remaining)} remaining of the ${formatCurrency(entry.limit)} assessed limit`;
    return ["From your notice of assessment", remaining];
  }
  return [
    `Against the ${formatCurrency(entry.limit)} annual maximum`,
    "Carry-forward not visible in statement data, so this is not an over-contribution",
  ];
}

function unstatedLine(entry: ContributionYear): string[] {
  const count = entry.unstatedMonths.length;
  if (count === 0) return [];
  const noun = count === 1 ? "month states" : "months state";
  const named = entry.unstatedMonths.map(formatPeriodLabel).join(", ");
  return [`${count} ${noun} no contributions figure: ${named}`];
}

function lumpLines(entry: ContributionYear): string[] {
  return entry.lumps.map(
    (lump) =>
      `${formatCurrency(lump.amount)} stated at ${formatPeriodLabel(lump.period)} covers ` +
      `${lump.monthsSpanned} months, not that one month`,
  );
}

/**
 * What the cursor says about one wrapper-year, one line at a time.
 *
 * Pure, and the single source of all three copies: the visible tooltip, the
 * live announcement and the chart's accessible name are all built from one
 * call. Two independently written copies of the same figures is how this
 * project shipped an announced $241,740 beside a rendered $241,739.67, and
 * every figure in here goes through `formatCurrency` at full precision.
 *
 * A year with no `contributed` prints no figure at all, and specifically not
 * a zero: no bar, no limit, nothing but the fact that no statement covers it.
 */
export function contributionsTooltipLines(
  group: RegisteredGroup,
  entry: ContributionYear | null,
): string[] {
  if (entry === null) return ["No year here"];
  const label = String(entry.year);
  if (entry.contributed === null) return [label, "No statement for this year"];

  return [
    label,
    `Contributed ${formatCurrency(entry.contributed)}`,
    ...(entry.source === null ? [] : [SOURCE_LINE[entry.source]]),
    ...limitLines(entry),
    ...unstatedLine(entry),
    ...lumpLines(entry),
    ...(group === "RESP" ? ["Grants are counted separately and are not in this figure"] : []),
  ];
}
