import { useCallback, useEffect, useState } from "react";
import type { YearScope } from "./scope";

// "month" stays in the union now so a later ticket only has to edit the
// array below, not every place that already switches on `TabId`.
export type TabId = "month" | "portfolio" | "growth" | "plan" | "data";

export const TABS: readonly TabId[] = ["portfolio", "growth", "plan", "data"];

/**
 * Where a pasted link from the old eight-tab shell resolves under the new
 * four (soon five) tab structure. `decodeHash` checks `TABS` first and only
 * falls back to this map, so a link never resolves to a name that is no
 * longer a real tab.
 */
export const LEGACY_TABS: Readonly<Record<string, TabId>> = {
  overview: "portfolio",
  wrappers: "plan",
  tax: "portfolio",
  projections: "plan",
  reconciliation: "data",
  cards: "data",
};

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

/**
 * A safe lookup on `LEGACY_TABS`, keyed by a hash segment an attacker or a
 * hand-edited URL controls. A plain `LEGACY_TABS[rawTab]` reaches the
 * prototype chain for `"constructor"`, `"toString"`, `"hasOwnProperty"` and
 * `"__proto__"`, returning a function or an object rather than `undefined` --
 * `Object.hasOwn` checks the object's own keys only, never the chain.
 */
function legacyTab(rawTab: string): TabId | undefined {
  return Object.hasOwn(LEGACY_TABS, rawTab)
    ? LEGACY_TABS[rawTab as keyof typeof LEGACY_TABS]
    : undefined;
}

function decodeHash(hash: string): HashState {
  const [rawTab = "", rawScope = ""] = hash.replace(/^#/, "").split("/");
  const tab = (TABS as readonly string[]).includes(rawTab)
    ? (rawTab as TabId)
    : (legacyTab(rawTab) ?? "portfolio");
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
