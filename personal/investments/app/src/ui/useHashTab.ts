import { useCallback, useEffect, useState } from "react";
import type { YearScope } from "./scope";

export type TabId =
  | "overview"
  | "growth"
  | "wrappers"
  | "tax"
  | "cards"
  | "projections"
  | "reconciliation";

export const TABS: readonly TabId[] = [
  "overview",
  "growth",
  "wrappers",
  "tax",
  // Cards sits after tax and before projections: it is real money the owner
  // owes, so it belongs on the page, but it feeds none of the figures the
  // tabs before it build up and none of the projections after it.
  "cards",
  "projections",
  "reconciliation",
];

/**
 * The hash carries the tab and the year scope, `#growth` or `#growth/2024`.
 *
 * Both halves are decoded TOTALLY: an empty hash, an unknown tab, a
 * hand-edited year, a truncated URL and a year the corpus does not cover all
 * resolve to the default rather than throwing or rendering an empty view.
 * The dashboard has to open no matter what is in the address bar, and a
 * pasted link is the most likely thing to be malformed.
 */
export interface HashState {
  tab: TabId;
  scope: YearScope;
}

function decodeHash(hash: string): HashState {
  const [rawTab = "", rawScope = ""] = hash.replace(/^#/, "").split("/");
  const tab = (TABS as readonly string[]).includes(rawTab) ? (rawTab as TabId) : "overview";
  // A four-digit year only. `Number("")` is 0 and `Number("2024abc")` is NaN,
  // so the shape is checked before the conversion rather than after it.
  const scope: YearScope = /^\d{4}$/.test(rawScope) ? Number(rawScope) : "all";
  return { tab, scope };
}

function encodeHash({ tab, scope }: HashState): string {
  return scope === "all" ? tab : `${tab}/${scope}`;
}

/**
 * The active tab and year scope, synced with `location.hash` in both
 * directions so a scoped view is linkable and survives a reload, matching
 * the CSV-era page's URL-as-state convention.
 *
 * The scope rides in the hash rather than in component state because it is
 * the thing a reader most wants to send someone: "look at 2025" is a link,
 * not an instruction to click a control.
 */
export function useHashTab(): [HashState, (next: Partial<HashState>) => void] {
  const [state, setState] = useState<HashState>(() => decodeHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setState(decodeHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const update = useCallback((next: Partial<HashState>) => {
    setState((current) => {
      const merged = { ...current, ...next };
      window.location.hash = encodeHash(merged);
      return merged;
    });
  }, []);

  return [state, update];
}
