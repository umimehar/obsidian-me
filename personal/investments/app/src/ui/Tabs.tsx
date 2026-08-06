import { Tabs as RadixTabs } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { TABS, type TabId, useHashTab } from "./useHashTab";

export interface TabsProps {
  panels: Record<TabId, ReactNode>;
}

const LABELS: Record<TabId, string> = {
  overview: "Overview",
  growth: "Growth",
  wrappers: "Wrappers",
  tax: "Tax",
  projections: "Projections",
  reconciliation: "Reconciliation",
};

/**
 * The dashboard's view shell. Six panels, one active at a time, the active
 * one named by `location.hash` through `useHashTab` so a tab is linkable and
 * survives a reload. Radix unmounts an inactive `Tabs.Content` rather than
 * hiding it, which is what makes a panel's content "absent" and not merely
 * invisible.
 */
export function Tabs({ panels }: TabsProps) {
  const [tab, setTab] = useHashTab();

  return (
    <RadixTabs.Root value={tab} onValueChange={(value) => setTab(value as TabId)}>
      <RadixTabs.List aria-label="Dashboard views">
        {TABS.map((id) => (
          <RadixTabs.Trigger key={id} value={id}>
            {LABELS[id]}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {TABS.map((id) => (
        <RadixTabs.Content key={id} value={id}>
          {panels[id]}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
