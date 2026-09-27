import type { Observation } from "./validate/checks";

/**
 * Figures read off the Wealthsimple app on a given date. The external anchor
 * every derived total is measured against. Add a row whenever you check.
 *
 * BASIS: `accountValue` is whatever the app showed, and the app's own scope
 * has to be recorded with it. The 2026-06-30 reading INCLUDED the spousal
 * RRSP, which this project excludes from the portfolio total as of
 * 2026-08-31 (the owner is the contributor; the asset is the spouse's, see
 * `EXCLUDED_KINDS`). That is why its delta is large and explained rather than
 * small: it is measuring a wider scope than the total it is compared against.
 *
 * When taking the next reading, note which accounts the screen was counting.
 * A ground-truth anchor whose scope is unrecorded stops being an anchor.
 */
export const OBSERVATIONS: readonly Observation[] = [
  { observed: "2026-06-30", period: "2026-06", accountValue: 242019.61, netDeposits: 217514.0 },
];
