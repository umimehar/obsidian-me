import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useState,
} from "react";
import { type ChartScales, monthsBetween, periodToDate } from "./scales";

/** The minimum a cursor needs of a plotted point: which period it states. */
export interface CursorPoint {
  /** `YYYY-MM`. */
  period: string;
}

/** One month of the chart's x axis, at the pixel position a point in that month is drawn at. */
export interface CursorSlot {
  period: string;
  x: number;
}

/** Where the chart's plot area sits, so a client coordinate can be put into plot space. */
export interface CursorGeometry {
  /** The full viewBox width. The svg is laid out at `width: 100%`, so its pixel width is not this. */
  viewBoxWidth: number;
  /** The plot area's left offset inside the viewBox. */
  marginLeft: number;
}

export interface ChartCursor<P extends CursorPoint> {
  /** The `YYYY-MM` the cursor is on, or null when it is away from the chart. */
  period: string | null;
  /**
   * The point stated for `period`, or null when the series states nothing for
   * that month. A null here is a gap, never a zero: the caller must say so
   * rather than print a figure.
   */
  point: P | null;
  /** `period`'s position in plot space, for a crosshair. Null alongside a null period. */
  x: number | null;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerLeave: () => void;
  onKeyDown: (event: KeyboardEvent<SVGSVGElement>) => void;
  onBlur: (event: FocusEvent<SVGSVGElement>) => void;
}

/** How a key moves the cursor through the series' points. */
export type CursorStep = "first" | "last" | "previous" | "next";

const STEP_KEYS: Readonly<Record<string, CursorStep>> = {
  ArrowRight: "next",
  ArrowLeft: "previous",
  Home: "first",
  End: "last",
};

/**
 * The chart's x axis as cursor slots: every month from `range[0]` to
 * `range[1]`, each at the pixel position `scales` puts it.
 *
 * `range` is the axis's range, which is not always the series' own. Each
 * group card is drawn on the whole portfolio's range so the cards are
 * comparable, so a six-month group has thirty-one slots ahead of its first
 * statement, every one of them a month it reported nothing for. Empty
 * whenever there is no range or no scale to place it on, which is the empty
 * state's case.
 */
export function cursorSlots(
  range: readonly [string, string] | null,
  scales: ChartScales | null,
): CursorSlot[] {
  if (range === null || scales === null) return [];
  return monthsBetween(range[0], range[1]).map((period) => ({
    period,
    x: scales.x(periodToDate(period)),
  }));
}

/**
 * The crosshair, and a dot on the focused point.
 *
 * The dot is drawn only where there is a point to draw it on. A month the
 * series never stated gets the line and no dot, which is the same fact the
 * tooltip states in words: there is nothing here, rather than something at
 * zero.
 */
export function CursorMarks({
  x,
  y,
  height,
}: {
  x: number | null;
  y: number | null;
  height: number;
}) {
  if (x === null) return null;
  return (
    <g data-cursor-marks="">
      <line x1={x} x2={x} y1={0} y2={height} stroke="var(--gray-a8)" strokeWidth={1} />
      {y === null ? null : (
        <circle
          data-cursor-marker=""
          cx={x}
          cy={y}
          r={4}
          fill="var(--jade-a11)"
          stroke="var(--color-panel-solid)"
          strokeWidth={1.5}
        />
      )}
    </g>
  );
}

/**
 * The index of the slot nearest `x`, or null when there are no slots.
 *
 * An `x` beyond either end clamps to that end rather than reporting nothing:
 * the pointer being a few pixels past the last month is still the reader
 * asking about the last month.
 *
 * Ties break to the earlier slot, because the scan keeps the first strict
 * improvement. That is arbitrary but fixed, so a pointer sitting exactly on
 * a midpoint cannot flicker between two months.
 */
export function nearestSlotIndex(slots: readonly CursorSlot[], x: number): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, slot] of slots.entries()) {
    const distance = Math.abs(slot.x - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/**
 * The index in `points` a keypress moves to from `period`, or null when there
 * is nowhere to go (an empty series, or an end that must hold rather than
 * wrap around to the other end).
 *
 * `period` may name a month the series has no point for, since the pointer
 * can leave the cursor on a gap. Stepping compares periods rather than
 * indices for exactly that reason: from a gap, `next` lands on the first
 * stated month after it and `previous` on the last one before it.
 */
export function stepIndex<P extends CursorPoint>(
  points: readonly P[],
  period: string | null,
  step: CursorStep,
): number | null {
  if (points.length === 0) return null;
  if (step === "first") return 0;
  if (step === "last") return points.length - 1;
  if (period === null) return step === "next" ? 0 : points.length - 1;

  if (step === "next") {
    const found = points.findIndex((point) => point.period > period);
    return found === -1 ? null : found;
  }
  const found = points.findLastIndex((point) => point.period < period);
  return found === -1 ? null : found;
}

/** A client x in plot space, or NaN when the chart has no laid-out box to measure against. */
function plotX(event: PointerEvent<SVGSVGElement>, geometry: CursorGeometry): number {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width === 0) return Number.NaN;
  return ((event.clientX - rect.left) / rect.width) * geometry.viewBoxWidth - geometry.marginLeft;
}

/**
 * One hover-and-focus behaviour for every chart on the page.
 *
 * The cursor tracks a **month**, not a point index. `slots` is the axis, one
 * entry per calendar month in range; `points` is the sparse series, which
 * omits any month it has no statement for. Resolving a pointer against the
 * axis and then looking the month up in the series is what makes an unstated
 * month report `point: null` instead of quietly answering with whichever
 * neighbour happens to be nearest. A nearest-point lookup would print a
 * figure for a month that has none, which is the one thing a tooltip over
 * sparse data must never do.
 *
 * Keyboard moves through the points instead, since arrowing across a
 * thirteen-month hole one empty month at a time says nothing.
 */
export function useChartCursor<P extends CursorPoint>(
  points: readonly P[],
  slots: readonly CursorSlot[],
  geometry: CursorGeometry,
): ChartCursor<P> {
  const [period, setPeriod] = useState<string | null>(null);

  const onPointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const x = plotX(event, geometry);
      if (Number.isNaN(x)) return;
      const index = nearestSlotIndex(slots, x);
      setPeriod(index === null ? null : (slots[index]?.period ?? null));
    },
    [slots, geometry],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (event.key === "Escape") {
        setPeriod(null);
        return;
      }
      const step = STEP_KEYS[event.key];
      if (step === undefined) return;
      event.preventDefault();
      const index = stepIndex(points, period, step);
      if (index === null) return;
      setPeriod(points[index]?.period ?? null);
    },
    [points, period],
  );

  const clear = useCallback(() => setPeriod(null), []);

  const point = period === null ? null : (points.find((p) => p.period === period) ?? null);
  const slot = period === null ? undefined : slots.find((s) => s.period === period);

  return {
    period,
    point,
    x: slot?.x ?? null,
    onPointerMove,
    onPointerLeave: clear,
    onKeyDown,
    onBlur: clear,
  };
}
