import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { useMeasuredWidth } from "./useMeasuredWidth";

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

function Harness({ onWidth }: { onWidth: (w: number) => void }) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(999);
  onWidth(width);
  return <div ref={ref} data-measured="" />;
}

function renderHarness() {
  let last = 0;
  render(
    <Harness
      onWidth={(w) => {
        last = w;
      }}
    />,
  );
  return () => last;
}

describe("useMeasuredWidth", () => {
  test("falls back to the given width when ResizeObserver is unavailable", () => {
    const original = window.ResizeObserver;
    (window as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = undefined;
    try {
      const width = renderHarness();
      expect(width()).toBe(999);
    } finally {
      window.ResizeObserver = original;
    }
  });

  test("adopts the width the observer reports", () => {
    const original = window.ResizeObserver;
    FakeResizeObserver.instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      const width = renderHarness();
      const observer = FakeResizeObserver.instances[0];
      expect(observer).toBeDefined();
      act(() => {
        observer?.callback([{ contentRect: { width: 640 } }]);
      });
      expect(width()).toBe(640);
    } finally {
      window.ResizeObserver = original;
    }
  });

  test("a zero measurement is ignored, keeping the last real width", () => {
    const original = window.ResizeObserver;
    FakeResizeObserver.instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      const width = renderHarness();
      const observer = FakeResizeObserver.instances[0];
      act(() => {
        observer?.callback([{ contentRect: { width: 700 } }]);
      });
      expect(width()).toBe(700);
      act(() => {
        observer?.callback([{ contentRect: { width: 0 } }]);
      });
      expect(width()).toBe(700);
    } finally {
      window.ResizeObserver = original;
    }
  });
});
