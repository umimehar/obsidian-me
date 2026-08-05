import type { CheckName } from "./validate/report";

export interface Acknowledgement {
  check: CheckName;
  /** Masked short id, or "*" for a whole-portfolio finding. */
  shortId: string;
  period: string;
  /** Why this finding is expected. Required — an unexplained entry is a bug. */
  reason: string;
  reviewed: string;
}

/**
 * Findings matching an entry are reported as acknowledged rather than new.
 * Values are never rewritten here: a wrong figure is fixed in the parser, and a
 * genuinely wrong statement stays wrong and visible.
 */
export const ACKNOWLEDGED: readonly Acknowledgement[] = [
  {
    check: "ground-truth",
    shortId: "*",
    period: "2026-06",
    reason:
      "WSE401 carries a pending valuation at its $10.00 purchase price; the app shows the finalised NAV. Accounts for the whole $279.94 delta if the NAV is $10.2254.",
    reviewed: "2026-08-05",
  },
];

export function isAcknowledged(check: CheckName, shortId: string, period: string): boolean {
  return ACKNOWLEDGED.some(
    (a) => a.check === check && a.shortId === shortId && a.period === period,
  );
}
