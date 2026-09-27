import { afterEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useHashTab } from "./useHashTab";

afterEach(() => {
  window.location.hash = "";
});

describe("useHashTab, the tab half", () => {
  test("a hash naming a tab resolves to that tab", () => {
    window.location.hash = "#projections";
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0].tab).toBe("projections");
  });

  test("an empty hash resolves to overview, all time", () => {
    window.location.hash = "";
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toEqual({ tab: "overview", scope: "all" });
  });

  test("an unknown hash resolves to overview rather than throwing or rendering nothing", () => {
    window.location.hash = "#not-a-real-tab";
    expect(() => renderHook(() => useHashTab())).not.toThrow();
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0].tab).toBe("overview");
  });

  test("setting a tab writes the hash and leaves the scope alone", () => {
    window.location.hash = "#overview/2025";
    const { result } = renderHook(() => useHashTab());

    act(() => {
      result.current[1]({ tab: "tax" });
    });

    expect(result.current[0]).toEqual({ tab: "tax", scope: 2025 });
    expect(window.location.hash).toBe("#tax/2025");
  });
});

describe("useHashTab, the year scope half", () => {
  test("a hash carrying a year resolves to that year", () => {
    window.location.hash = "#growth/2024";
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toEqual({ tab: "growth", scope: 2024 });
  });

  test("a tab with no year is all time, which is the default view", () => {
    window.location.hash = "#growth";
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0].scope).toBe("all");
  });

  test("setting a scope writes it beside the tab", () => {
    window.location.hash = "#wrappers";
    const { result } = renderHook(() => useHashTab());

    act(() => {
      result.current[1]({ scope: 2023 });
    });

    expect(result.current[0]).toEqual({ tab: "wrappers", scope: 2023 });
    expect(window.location.hash).toBe("#wrappers/2023");
  });

  test("returning to all time drops the year from the hash rather than writing it out", () => {
    window.location.hash = "#tax/2023";
    const { result } = renderHook(() => useHashTab());

    act(() => {
      result.current[1]({ scope: "all" });
    });

    expect(window.location.hash).toBe("#tax");
  });

  test("a malformed year falls back to all time rather than rendering an empty view", () => {
    // A pasted link is the most likely thing to be malformed, and every one of
    // these is a shape `Number()` would accept or turn into NaN: "" is 0,
    // "24" is a year that is not four digits, "2024abc" is NaN, and a
    // negative would index nothing.
    for (const bad of ["#tax/", "#tax/24", "#tax/2024abc", "#tax/-2024", "#tax/20245"]) {
      window.location.hash = bad;
      const { result } = renderHook(() => useHashTab());
      expect(result.current[0].scope).toBe("all");
    }
  });

  test("both halves survive a round trip through the hash", () => {
    window.location.hash = "";
    const { result } = renderHook(() => useHashTab());

    act(() => {
      result.current[1]({ tab: "cards", scope: 2026 });
    });
    expect(window.location.hash).toBe("#cards/2026");

    // Re-reading the hash the write produced must give back what was written:
    // this is the property that makes a scoped view linkable at all.
    const { result: reopened } = renderHook(() => useHashTab());
    expect(reopened.current[0]).toEqual({ tab: "cards", scope: 2026 });
  });
});
