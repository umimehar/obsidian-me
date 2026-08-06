import { afterEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useHashTab } from "./useHashTab";

afterEach(() => {
  window.location.hash = "";
});

describe("useHashTab", () => {
  test("a hash naming a tab resolves to that tab", () => {
    window.location.hash = "#projections";
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe("projections");
  });

  test("an empty hash resolves to overview", () => {
    window.location.hash = "";
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe("overview");
  });

  test("an unknown hash resolves to overview rather than throwing or rendering nothing", () => {
    window.location.hash = "#not-a-real-tab";
    expect(() => renderHook(() => useHashTab())).not.toThrow();
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe("overview");
  });

  test("setting a tab writes the hash", () => {
    window.location.hash = "";
    const { result } = renderHook(() => useHashTab());

    act(() => {
      result.current[1]("tax");
    });

    expect(result.current[0]).toBe("tax");
    expect(window.location.hash).toBe("#tax");
  });
});
