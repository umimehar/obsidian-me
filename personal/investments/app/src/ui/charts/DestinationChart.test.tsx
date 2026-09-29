import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { DestinationBucket } from "../../analytics/flows/graph";
import { DestinationChart } from "./DestinationChart";

afterEach(cleanup);

type ResizeCallback = (entries: readonly { contentRect: { width: number } }[]) => void;

/** A minimal stand-in for the real `ResizeObserver`, which happy-dom does not implement. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeCallback;
  constructor(callback: ResizeCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {}
}

const BUCKETS: DestinationBucket[] = [
  { bucket: "2026-01", values: { TFSA: 1000, RRSP: 500 } },
  { bucket: "2026-02", values: { TFSA: 2000 } },
];

function renderChart(buckets: readonly DestinationBucket[] = BUCKETS) {
  render(
    <Theme>
      <DestinationChart buckets={buckets} />
    </Theme>,
  );
}

function svg(): SVGSVGElement {
  const el = document.querySelector("svg[role='img']");
  if (el === null || !(el instanceof SVGSVGElement)) {
    throw new Error("expected the destination chart to render");
  }
  return el;
}

describe("DestinationChart", () => {
  test("an empty period renders a stated empty state instead of an axis with nothing on it", () => {
    renderChart([]);
    expect(document.body.textContent).toContain("No money arrived in any account this period.");
    expect(document.querySelector("svg[role='img']")).toBeNull();
  });

  test("one bar segment per label present in a bucket", () => {
    renderChart();
    expect(document.querySelectorAll('[data-destination-bar="2026-01"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-destination-bar="2026-02"]')).toHaveLength(1);
  });

  test("the chart is role=img and carries a hoverable readout, like every other chart", () => {
    renderChart();
    const chart = svg();
    expect(chart.getAttribute("role")).toBe("img");
    chart.getBoundingClientRect = () => new DOMRect(0, 0, 800, 260);
    fireEvent.pointerMove(chart, { clientX: 100, clientY: 100 });
    expect(document.querySelector("[data-chart-tooltip]")).not.toBeNull();
  });

  test("a legend names every series in text, in the same order and colour the bars use", () => {
    renderChart();
    const legend = document.querySelector("[data-destination-legend]");
    expect(legend?.textContent).toBe("TFSARRSP");
    const swatches = legend?.querySelectorAll("rect") ?? [];
    expect(swatches).toHaveLength(2);
    expect(swatches[0]?.getAttribute("fill")).toBe("var(--blue-9)");
    expect(swatches[1]?.getAttribute("fill")).toBe("var(--crimson-9)");
  });

  test("the chart is laid out at the container's own measured width", () => {
    const original = window.ResizeObserver;
    FakeResizeObserver.instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      renderChart();
      const observer = FakeResizeObserver.instances[0];
      expect(observer).toBeDefined();
      act(() => {
        observer?.callback([{ contentRect: { width: 350 } }]);
      });
      const [, , width] = (svg().getAttribute("viewBox") ?? "").split(" ");
      expect(width).toBe("350");
    } finally {
      window.ResizeObserver = original;
    }
  });
});
