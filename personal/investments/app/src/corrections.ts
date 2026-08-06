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
  {
    check: "cross-document",
    shortId: "d6d9",
    period: "2025-11",
    reason:
      "The account's first-ever statement, funded mid-period with a $12,000 deposit; the printed Change in Market Value is $0.00, but the securities it bought were actually worth $15.78 less by period end (bought for $11,953.48 net of fees, closed at a portfolio value of $11,937.70). The statement's own start/deposits/withdrawals/change-in-market-value/end row does not reconcile ($12,000.00 derived versus $11,984.22 printed) -- Wealthsimple's Change in Market Value figure does not capture the intra-period revaluation of a position opened and revalued within the same period. Not a parser defect: every input number is read correctly from the page.",
    reviewed: "2026-08-06",
  },
  {
    check: "style-drift",
    shortId: "9710",
    period: "2026-06",
    reason:
      "A real, owner-initiated product change, not a parser defect: this TFSA moved from self-directed to a Wealthsimple Managed portfolio. Its history reads Tax-Free Savings Account (self-directed) -> Tax-Free Savings Managed Cash Account -> Managed TFSA Account.",
    reviewed: "2026-08-06",
  },
];

/** The entry covering this exact (check, account, period), or undefined when there is none. */
export function acknowledgementFor(
  check: CheckName,
  shortId: string,
  period: string,
): Acknowledgement | undefined {
  return ACKNOWLEDGED.find(
    (a) => a.check === check && a.shortId === shortId && a.period === period,
  );
}

export function isAcknowledged(check: CheckName, shortId: string, period: string): boolean {
  return acknowledgementFor(check, shortId, period) !== undefined;
}
