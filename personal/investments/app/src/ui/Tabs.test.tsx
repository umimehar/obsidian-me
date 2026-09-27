import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { Tabs } from "./Tabs";
import { useHashTab } from "./useHashTab";
import type { TabId } from "./useHashTab";

const PANELS: Record<TabId, string> = {
  overview: "Overview panel content",
  growth: "Growth panel content",
  wrappers: "Wrappers panel content",
  tax: "Tax panel content",
  cards: "Cards panel content",
  projections: "Projections panel content",
  reconciliation: "Reconciliation panel content",
  data: "Data panel content",
};

/**
 * `Tabs` is controlled now: `App` owns the hash, because the hash also
 * carries the year scope and two components decoding it independently would
 * be two states that only agree by way of an event. This harness is the same
 * wiring `App` does, so the hash-driven tests below still exercise the real
 * path rather than a prop set by hand.
 */
function Harness() {
  const [{ tab }, setHash] = useHashTab();
  return (
    <Tabs
      tab={tab}
      onTabChange={(next) => setHash({ tab: next })}
      panels={{
        overview: <div>{PANELS.overview}</div>,
        growth: <div>{PANELS.growth}</div>,
        wrappers: <div>{PANELS.wrappers}</div>,
        tax: <div>{PANELS.tax}</div>,
        cards: <div>{PANELS.cards}</div>,
        projections: <div>{PANELS.projections}</div>,
        reconciliation: <div>{PANELS.reconciliation}</div>,
        data: <div>{PANELS.data}</div>,
      }}
    />
  );
}

function renderTabs() {
  render(
    <Theme>
      <Harness />
    </Theme>,
  );
}

afterEach(() => {
  window.location.hash = "";
});

describe("Tabs", () => {
  test("every tab renders as a trigger", () => {
    renderTabs();
    // Radix's TabsTrigger renders its label twice -- once visible, once
    // hidden at bold weight, so the visible width never shifts on select --
    // which doubles the accessible name. Matching a prefix sidesteps that
    // implementation detail rather than pinning it.
    for (const label of [
      "Overview",
      "Growth",
      "Wrappers",
      "Tax",
      "Projections",
      "Reconciliation",
    ]) {
      expect(screen.getByRole("tab", { name: new RegExp(`^${label}\\b`) })).toBeDefined();
    }
  });

  test("the active panel's content is present and the inactive panels' is absent", () => {
    renderTabs();
    expect(screen.getByText(PANELS.overview)).toBeDefined();
    expect(screen.queryByText(PANELS.growth)).toBeNull();
    expect(screen.queryByText(PANELS.wrappers)).toBeNull();
    expect(screen.queryByText(PANELS.tax)).toBeNull();
    expect(screen.queryByText(PANELS.projections)).toBeNull();
    expect(screen.queryByText(PANELS.reconciliation)).toBeNull();
  });

  test("opening with a hash already naming a tab renders that tab's panel", () => {
    window.location.hash = "#reconciliation";
    renderTabs();

    expect(screen.getByText(PANELS.reconciliation)).toBeDefined();
    expect(screen.queryByText(PANELS.overview)).toBeNull();
  });

  test("switching tab changes which panel's content is present", () => {
    renderTabs();
    // Radix's TabsTrigger activates on pointerdown, not click, so the test
    // fires the same event a real pointer press sends.
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Reconciliation\b/ }), { button: 0 });

    expect(screen.getByText(PANELS.reconciliation)).toBeDefined();
    expect(screen.queryByText(PANELS.overview)).toBeNull();
  });
});
