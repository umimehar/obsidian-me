import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DestinationBucket } from "../../analytics/flows/graph";
import { DestinationChart } from "./DestinationChart";

afterEach(cleanup);

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
});
