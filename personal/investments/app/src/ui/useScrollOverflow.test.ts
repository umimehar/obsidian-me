import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useScrollOverflow } from "./useScrollOverflow";

type ResizeCallback = () => void;

/** A minimal stand-in for the real `ResizeObserver`, which happy-dom does not implement. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeCallback;
  observed: Element[] = [];
  constructor(callback: ResizeCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  disconnect(): void {}
}

function element(scrollHeight: number, clientHeight: number): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  return el;
}

function withFakeResizeObserver(run: () => void): void {
  const original = window.ResizeObserver;
  FakeResizeObserver.instances = [];
  window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  try {
    run();
  } finally {
    window.ResizeObserver = original;
  }
}

describe("useScrollOverflow", () => {
  test("false when scrollHeight does not exceed clientHeight", () => {
    withFakeResizeObserver(() => {
      const el = element(200, 300);
      const { result } = renderHook(() => useScrollOverflow(el));
      expect(result.current).toBe(false);
    });
  });

  test("true when scrollHeight exceeds clientHeight", () => {
    withFakeResizeObserver(() => {
      const el = element(1400, 360);
      const { result } = renderHook(() => useScrollOverflow(el));
      expect(result.current).toBe(true);
    });
  });

  test("false with neither element mounted yet, rather than throwing", () => {
    expect(() => renderHook(() => useScrollOverflow(null))).not.toThrow();
    const { result } = renderHook(() => useScrollOverflow(null));
    expect(result.current).toBe(false);
  });

  test("re-measures scrollEl when the observed contentEl resizes", () => {
    withFakeResizeObserver(() => {
      const scrollEl = element(200, 360);
      const contentEl = document.createElement("div");
      const { result } = renderHook(() => useScrollOverflow(scrollEl, contentEl));
      expect(result.current).toBe(false);

      // A shorter period's period changed to a longer one: the content grew,
      // so its own resize is what the observer watches for -- see
      // `useScrollOverflow`'s own comment on why `contentEl` is watched
      // rather than `scrollEl`, which never itself changes size once capped.
      Object.defineProperty(scrollEl, "scrollHeight", { value: 1400, configurable: true });
      const observer = FakeResizeObserver.instances[0];
      expect(observer?.observed).toContain(contentEl);
      act(() => {
        observer?.callback();
      });
      expect(result.current).toBe(true);
    });
  });

  test("watches scrollEl itself when no separate contentEl is given", () => {
    withFakeResizeObserver(() => {
      const scrollEl = element(200, 360);
      renderHook(() => useScrollOverflow(scrollEl));
      const observer = FakeResizeObserver.instances[0];
      expect(observer?.observed).toEqual([scrollEl]);
    });
  });
});
