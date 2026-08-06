import { afterEach, describe, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { restoreReducedMotion, stubReducedMotion } from "../motionPreference";
import { revealMotion, useRevealMotion } from "./reveal";

describe("useRevealMotion", () => {
  let restore: typeof window.matchMedia | null = null;

  afterEach(() => {
    if (restore !== null) restoreReducedMotion(restore);
    restore = null;
  });

  test("reads the OS preference and hands the rule a true", () => {
    restore = stubReducedMotion(true);
    const { result } = renderHook(() => useRevealMotion(716));
    expect(result.current).toEqual(revealMotion(true, 716));
    expect(result.current.duration).toBe(0);
    expect(result.current.initialWidth).toBe(716);
  });

  test("without the preference it hands the rule a false", () => {
    restore = stubReducedMotion(false);
    const { result } = renderHook(() => useRevealMotion(716));
    expect(result.current).toEqual(revealMotion(false, 716));
    expect(result.current.duration).toBeGreaterThan(0.5);
    expect(result.current.initialWidth).toBe(0);
  });
});

describe("revealMotion", () => {
  test("reduced motion skips the reveal rather than running it faster", () => {
    const reveal = revealMotion(true, 716);
    expect(reveal.duration).toBe(0);
    expect(reveal.initialWidth).toBe(716);
  });

  test("without the preference the clip starts closed and takes real time", () => {
    const reveal = revealMotion(false, 716);
    expect(reveal.initialWidth).toBe(0);
    expect(reveal.duration).toBeGreaterThan(0.5);
  });
});
