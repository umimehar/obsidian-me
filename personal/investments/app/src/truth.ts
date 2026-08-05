import type { Observation } from "./validate/checks";

/**
 * Figures read off the Wealthsimple app on a given date. The external anchor
 * every derived total is measured against. Add a row whenever you check.
 */
export const OBSERVATIONS: readonly Observation[] = [
  { observed: "2026-06-30", period: "2026-06", accountValue: 242019.61, netDeposits: 217514.0 },
];
