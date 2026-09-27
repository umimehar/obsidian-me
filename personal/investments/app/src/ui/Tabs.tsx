import { Box, Tabs as RadixTabs } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { TABS, type TabId } from "./useHashTab";

export interface TabsProps {
  panels: Record<TabId, ReactNode>;
  tab: TabId;
  onTabChange: (tab: TabId) => void;
}

const LABELS: Record<TabId, string> = {
  month: "This month",
  portfolio: "Portfolio",
  growth: "Growth",
  plan: "Plan",
  data: "Data",
};

/**
 * The dashboard's view shell. One panel active at a time, the active
 * one owned by `App` rather than read from the hash here: the hash now also
 * carries the year scope, and two components decoding it independently would
 * be two states that only agree by way of an event.
 *
 * The original
 * one named by `location.hash` through `useHashTab` so a tab is linkable and
 * survives a reload. Radix unmounts an inactive `Tabs.Content` rather than
 * hiding it, which is what makes a panel's content "absent" and not merely
 * invisible.
 */
export function Tabs({ panels, tab, onTabChange }: TabsProps) {
  return (
    <RadixTabs.Root value={tab} onValueChange={(value) => onTabChange(value as TabId)}>
      <RadixTabs.List aria-label="Dashboard views">
        {TABS.map((id) => (
          <RadixTabs.Trigger key={id} value={id}>
            {LABELS[id]}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {TABS.map((id) => (
        <RadixTabs.Content key={id} value={id}>
          {/* Breathing room between the tab bar and the panel's first row. */}
          <Box pt="5" data-tab-panel-body="">
            {panels[id]}
          </Box>
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
