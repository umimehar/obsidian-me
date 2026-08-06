import { describe, expect, test } from "bun:test";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { monthsBetween } from "./scales";
import { type CursorSlot, nearestSlotIndex, stepIndex, useChartCursor } from "./useChartCursor";

/**
 * A sparse series with a real hole in it: February states nothing at all,
 * the way `MonthPoint` says an unstated month is absent rather than zero.
 * The whole point of these tests is that the hole stays a hole.
 */
const SPARSE = [
  { period: "2024-01", marketValue: 100 },
  { period: "2024-03", marketValue: 300 },
];

/** Evenly spaced slots, so a coordinate can be stated as a plain number. */
const SLOTS: CursorSlot[] = [
  { period: "2024-01", x: 0 },
  { period: "2024-02", x: 50 },
  { period: "2024-03", x: 100 },
];

/**
 * The hook wired to a real svg, so pointer and key events are dispatched the
 * way React actually delivers them rather than through a hand-built event
 * object. The `<title>` is the readout: which period the cursor is on, and
 * whether that period has a point.
 */
function Harness({
  points = SPARSE,
  slots = SLOTS,
}: {
  points?: readonly { period: string; marketValue: number }[];
  slots?: readonly CursorSlot[];
}) {
  const cursor = useChartCursor(points, slots, { viewBoxWidth: 100, marginLeft: 0 });
  const readout =
    cursor.period === null
      ? "away"
      : `${cursor.period}:${cursor.point === null ? "no point" : cursor.point.marketValue}`;
  return (
    <svg
      viewBox="0 0 100 40"
      role="img"
      aria-label={readout}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a chart is a graphic that still has to be reachable, or its tooltip is mouse-only
      tabIndex={0}
      onPointerMove={cursor.onPointerMove}
      onPointerLeave={cursor.onPointerLeave}
      onKeyDown={cursor.onKeyDown}
      onBlur={cursor.onBlur}
    >
      <title>{readout}</title>
    </svg>
  );
}

/** The rendered svg, with a stub rect so a client x maps into viewBox space. */
function chart(): SVGSVGElement {
  const node = document.querySelector("svg");
  if (node === null) throw new Error("expected the harness svg to render");
  node.getBoundingClientRect = () => new DOMRect(0, 0, 200, 80);
  return node;
}

function readout(): string {
  return screen.getByRole("img").getAttribute("aria-label") ?? "";
}

describe("nearestSlotIndex", () => {
  test("resolves an x to the slot nearest it", () => {
    expect(nearestSlotIndex(SLOTS, 4)).toBe(0);
    expect(nearestSlotIndex(SLOTS, 48)).toBe(1);
    expect(nearestSlotIndex(SLOTS, 97)).toBe(2);
  });

  test("an x exactly between two slots resolves to the earlier one, every time", () => {
    // The tie has to break somewhere. It breaks the same way on every call,
    // so dragging back and forth across the midpoint cannot flicker.
    expect(nearestSlotIndex(SLOTS, 25)).toBe(0);
    expect(nearestSlotIndex(SLOTS, 25)).toBe(0);
    expect(nearestSlotIndex(SLOTS, 75)).toBe(1);
  });

  test("an x outside the plot clamps to an end slot rather than reporting nothing", () => {
    expect(nearestSlotIndex(SLOTS, -400)).toBe(0);
    expect(nearestSlotIndex(SLOTS, 4000)).toBe(2);
  });

  test("no slots means no slot, not slot zero", () => {
    expect(nearestSlotIndex([], 10)).toBeNull();
  });
});

describe("stepIndex", () => {
  test("moves one point at a time in each direction", () => {
    expect(stepIndex(SPARSE, "2024-01", "next")).toBe(1);
    expect(stepIndex(SPARSE, "2024-03", "previous")).toBe(0);
  });

  test("stops at each end rather than wrapping around", () => {
    expect(stepIndex(SPARSE, "2024-03", "next")).toBeNull();
    expect(stepIndex(SPARSE, "2024-01", "previous")).toBeNull();
  });

  test("Home and End jump to the first and last point", () => {
    expect(stepIndex(SPARSE, "2024-03", "first")).toBe(0);
    expect(stepIndex(SPARSE, "2024-01", "last")).toBe(1);
  });

  test("from no cursor at all, next enters at the first point and previous at the last", () => {
    expect(stepIndex(SPARSE, null, "next")).toBe(0);
    expect(stepIndex(SPARSE, null, "previous")).toBe(1);
  });

  test("from a gap month it steps to the neighbouring real point on that side", () => {
    // February has no point. Stepping off it must land on a stated month,
    // never on an index derived from a month the series never reported.
    expect(stepIndex(SPARSE, "2024-02", "next")).toBe(1);
    expect(stepIndex(SPARSE, "2024-02", "previous")).toBe(0);
  });

  test("an empty series has nowhere to step", () => {
    expect(stepIndex([], null, "next")).toBeNull();
    expect(stepIndex([], null, "last")).toBeNull();
  });
});

describe("useChartCursor pointer", () => {
  test("a pointer over a stated month reports that month's point", () => {
    render(<Harness />);
    fireEvent.pointerMove(chart(), { clientX: 200 });
    expect(readout()).toBe("2024-03:300");
  });

  test("a pointer over a month the series never stated reports no point", () => {
    render(<Harness />);
    // Halfway across is February, which has no statement. A nearest-point
    // lookup would answer January or March here and the tooltip would print
    // a figure for a month that has none.
    fireEvent.pointerMove(chart(), { clientX: 100 });
    expect(readout()).toBe("2024-02:no point");
  });

  test("the same pointer position always resolves to the same month", () => {
    render(<Harness />);
    fireEvent.pointerMove(chart(), { clientX: 60 });
    const first = readout();
    fireEvent.pointerMove(chart(), { clientX: 199 });
    fireEvent.pointerMove(chart(), { clientX: 60 });
    expect(readout()).toBe(first);
  });

  test("leaving the chart clears the cursor rather than leaving a stale month on it", () => {
    render(<Harness />);
    fireEvent.pointerMove(chart(), { clientX: 200 });
    fireEvent.pointerLeave(chart());
    expect(readout()).toBe("away");
  });

  test("a chart with no laid-out box ignores the pointer instead of guessing a month", () => {
    render(<Harness />);
    const node = document.querySelector("svg");
    if (node === null) throw new Error("expected the harness svg to render");
    node.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
    fireEvent.pointerMove(node, { clientX: 100 });
    expect(readout()).toBe("away");
  });
});

describe("useChartCursor keyboard", () => {
  test("right and left arrows move the cursor point by point", () => {
    render(<Harness />);
    const svg = chart();
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(readout()).toBe("2024-01:100");
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(readout()).toBe("2024-03:300");
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(readout()).toBe("2024-01:100");
  });

  test("arrows skip the gap rather than landing on a month with no statement", () => {
    render(<Harness />);
    const svg = chart();
    fireEvent.pointerMove(svg, { clientX: 100 });
    expect(readout()).toBe("2024-02:no point");
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(readout()).toBe("2024-03:300");
  });

  test("Home and End jump to the first and last point", () => {
    render(<Harness />);
    const svg = chart();
    fireEvent.keyDown(svg, { key: "End" });
    expect(readout()).toBe("2024-03:300");
    fireEvent.keyDown(svg, { key: "Home" });
    expect(readout()).toBe("2024-01:100");
  });

  test("an arrow at the end of the series holds rather than wrapping to the other end", () => {
    render(<Harness />);
    const svg = chart();
    fireEvent.keyDown(svg, { key: "End" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(readout()).toBe("2024-03:300");
  });

  test("Escape and blur put the cursor away", () => {
    render(<Harness />);
    const svg = chart();
    fireEvent.keyDown(svg, { key: "End" });
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(readout()).toBe("away");
    fireEvent.keyDown(svg, { key: "End" });
    fireEvent.blur(svg);
    expect(readout()).toBe("away");
  });

  test("a key the chart does not handle leaves the cursor alone", () => {
    render(<Harness />);
    const svg = chart();
    fireEvent.keyDown(svg, { key: "Home" });
    fireEvent.keyDown(svg, { key: "a" });
    expect(readout()).toBe("2024-01:100");
  });
});

describe("useChartCursor handler identity", () => {
  test("the pointer handler survives a rerender, so the memo is not decorative", () => {
    // Both charts pass a module-level geometry constant for this reason. A
    // fresh object literal per render would rebuild the handler every time
    // and the useCallback would be doing nothing.
    const geometry = { viewBoxWidth: 100, marginLeft: 0 };
    const { result, rerender } = renderHook(() => useChartCursor(SPARSE, SLOTS, geometry));
    const first = result.current.onPointerMove;
    rerender();
    expect(result.current.onPointerMove).toBe(first);
  });

  test("a changed geometry does rebuild it, so the memo is not stale either", () => {
    const { result, rerender } = renderHook(
      ({ geometry }) => useChartCursor(SPARSE, SLOTS, geometry),
      { initialProps: { geometry: { viewBoxWidth: 100, marginLeft: 0 } } },
    );
    const first = result.current.onPointerMove;
    rerender({ geometry: { viewBoxWidth: 800, marginLeft: 68 } });
    expect(result.current.onPointerMove).not.toBe(first);
  });
});

describe("monthsBetween", () => {
  test("names every month in the range, including the ones the series never stated", () => {
    expect(monthsBetween("2024-01", "2024-04")).toEqual([
      "2024-01",
      "2024-02",
      "2024-03",
      "2024-04",
    ]);
  });

  test("crosses a year boundary", () => {
    expect(monthsBetween("2023-11", "2024-02")).toEqual([
      "2023-11",
      "2023-12",
      "2024-01",
      "2024-02",
    ]);
  });

  test("a single-month range is that one month", () => {
    expect(monthsBetween("2026-06", "2026-06")).toEqual(["2026-06"]);
  });

  test("the real portfolio range is thirty-seven months", () => {
    expect(monthsBetween("2023-06", "2026-06").length).toBe(37);
  });

  test("an inverted range is empty rather than looping forever", () => {
    expect(monthsBetween("2026-06", "2023-06")).toEqual([]);
  });
});
