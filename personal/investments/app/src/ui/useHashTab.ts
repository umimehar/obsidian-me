import { useCallback, useEffect, useState } from "react";
import type { FlowPeriod } from "../analytics/flows/period";
import { yearPeriod } from "../analytics/flows/period";
import type { YearScope } from "./scope";

export type TabId =
  | "month"
  | "flow"
  | "portfolio"
  | "holdings"
  | "growth"
  | "income"
  | "contributions"
  | "nonRegistered"
  | "corporate"
  | "future"
  | "data";

export const TABS: readonly TabId[] = [
  "month",
  "flow",
  "portfolio",
  "holdings",
  "growth",
  "income",
  "contributions",
  "nonRegistered",
  "corporate",
  "future",
  "data",
];

/**
 * Where a pasted link from an older tab shell resolves under the current
 * structure. `decodeHash` checks `TABS` first and only falls back to this
 * map, so a link never resolves to a name that is no longer a real tab.
 * None of these map to "month": it is new, with no old tab that ever meant
 * it. `wrappers` now resolves to `contributions`, where the registered
 * planner actually lives. `plan` and `projections` both resolve to
 * `future`, which took over the projection when the interim `plan` tab was
 * removed. `tax` resolves to `income`, where the investment income view now
 * lives alongside the income and cost figures it used to sit above alone.
 */
export const LEGACY_TABS: Readonly<Record<string, TabId>> = {
  overview: "portfolio",
  wrappers: "contributions",
  tax: "income",
  projections: "future",
  plan: "future",
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
  /**
   * The Flow tab's own period control, carried in the hash's second segment
   * in place of the year scope: `#flow/2026`, `#flow/2026-09`,
   * `#flow/2026-01..2026-06`. Only meaningful when `tab` is `"flow"`; `scope`
   * stays `"all"` there so the global year filter is never implied by it.
   */
  flowPeriod: FlowPeriod | "all";
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

/** A `YYYY-MM` string is a real calendar month, 01 through 12. */
function isMonth(raw: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(raw)) return false;
  const m = Number(raw.slice(5));
  return m >= 1 && m <= 12;
}

/**
 * `YYYY` a year, `YYYY-MM` a single month, `YYYY-MM..YYYY-MM` a range when
 * `from <= to` and both sides are real months, anything else all time. Total:
 * a hand-edited or truncated link always resolves to a period rather than
 * throwing.
 */
function decodeFlowPeriod(raw: string): FlowPeriod | "all" {
  if (/^\d{4}$/.test(raw)) return yearPeriod(Number(raw));
  if (isMonth(raw)) return { from: raw, to: raw };
  const [from = "", to = ""] = raw.split("..");
  if (raw.includes("..") && isMonth(from) && isMonth(to) && from <= to) return { from, to };
  return "all";
}

/** The inverse of `decodeFlowPeriod`: a whole calendar year encodes as `YYYY`, else `YYYY-MM[..YYYY-MM]`. */
function encodeFlowPeriod(p: FlowPeriod | "all"): string | null {
  if (p === "all") return null;
  const year = p.from.slice(0, 4);
  if (p.from === `${year}-01` && p.to === `${year}-12`) return year;
  return p.from === p.to ? p.from : `${p.from}..${p.to}`;
}

function decodeHash(hash: string): HashState {
  const [rawTab = "", rawSecond = ""] = hash.replace(/^#/, "").split("/");
  const tab = (TABS as readonly string[]).includes(rawTab)
    ? (rawTab as TabId)
    : (legacyTab(rawTab) ?? "month");
  if (tab === "flow") {
    return { tab, scope: "all", flowPeriod: decodeFlowPeriod(rawSecond) };
  }
  // A four-digit year only. `Number("")` is 0 and `Number("2024abc")` is NaN,
  // so the shape is checked before the conversion rather than after it.
  const scope: YearScope = /^\d{4}$/.test(rawSecond) ? Number(rawSecond) : "all";
  return { tab, scope, flowPeriod: "all" };
}

function encodeHash({ tab, scope, flowPeriod }: HashState): string {
  if (tab === "flow") {
    const segment = encodeFlowPeriod(flowPeriod);
    return segment === null ? tab : `${tab}/${segment}`;
  }
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
