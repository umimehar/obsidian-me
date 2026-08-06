import { useCallback, useEffect, useState } from "react";

export type TabId = "overview" | "growth" | "wrappers" | "tax" | "projections" | "reconciliation";

export const TABS: readonly TabId[] = [
  "overview",
  "growth",
  "wrappers",
  "tax",
  "projections",
  "reconciliation",
];

/**
 * The tab a hash names, or `"overview"` for anything else: an empty hash,
 * an unknown one, or a hand-edited or truncated URL. Total, matching
 * `decodeScope`'s rule in the CSV-era `url.ts` -- the dashboard has to open
 * no matter what is in the address bar.
 */
function decodeTab(hash: string): TabId {
  const candidate = hash.replace(/^#/, "");
  return (TABS as readonly string[]).includes(candidate) ? (candidate as TabId) : "overview";
}

/**
 * The active tab, synced with `location.hash` in both directions so the
 * active tab is linkable and survives a reload, matching the CSV-era page's
 * URL-as-state convention.
 */
export function useHashTab(): [TabId, (id: TabId) => void] {
  const [tab, setTabState] = useState<TabId>(() => decodeTab(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setTabState(decodeTab(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setTab = useCallback((id: TabId) => {
    window.location.hash = id;
    setTabState(id);
  }, []);

  return [tab, setTab];
}
