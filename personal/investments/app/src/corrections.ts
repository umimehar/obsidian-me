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
      "The account's first-ever statement, funded mid-period with a $12,000 deposit; the printed Change in Market Value is $0.00, but the securities it bought were actually worth $15.78 less by period end (bought for $11,953.48 net of fees, closed at a portfolio value of $11,937.70). The statement's own start/deposits/withdrawals/change-in-market-value/end row does not reconcile ($12,000.00 derived versus $11,984.22 printed), because Wealthsimple's Change in Market Value figure does not capture the intra-period revaluation of a position opened and revalued within the same period. Not a parser defect: every input number is read correctly from the page.",
    reviewed: "2026-08-06",
  },
  {
    check: "return-direction",
    shortId: "d6d9",
    period: "2026-02",
    reason:
      "Wealthsimple's returns block contradicts its own balance summary. This account is under a year old and none of its statements print a one-year rate, so the since-inception figure is cumulative rather than annualized. Over 2026-02 the balance summary prints $0.00 deposits and $0.00 withdrawals with market value rising from $11,902.63 to $11,977.14; against the single $12,000.00 deposit that opened the account that is a cumulative -0.81% moving to -0.19%, yet the printed since-inception rate moves from -0.12% to -3.05%. Not a parser defect: the returns row prints six percentages whose x positions align exactly with the six horizon headers, and every one is read correctly.",
    reviewed: "2026-08-06",
  },
  {
    check: "return-direction",
    shortId: "d6d9",
    period: "2026-04",
    reason:
      "The same defect as 2026-02 in the opposite direction. Over 2026-04 the balance summary prints $0.00 deposits and $0.00 withdrawals with market value falling from $12,531.01 to $12,370.86, a cumulative +4.43% falling to +3.09%, yet the printed since-inception rate rises from -0.52% to 10.31%. Neither of those two rates matches the cumulative return the same statement's own balance summary implies. 10.31% is the figure the returns chart renders as card text, and it is left visible and wrong: no value is rewritten in the parser.",
    reviewed: "2026-08-06",
  },
  {
    check: "style-drift",
    shortId: "9710",
    period: "2026-06",
    reason:
      "A real, owner-initiated product change, not a parser defect: this TFSA moved from self-directed to a Wealthsimple Managed portfolio. Its history reads Tax-Free Savings Account (self-directed), then Tax-Free Savings Managed Cash Account, then Managed TFSA Account.",
    reviewed: "2026-08-06",
  },
];

/**
 * Throws on an entry whose reason is blank. The type comment on `reason`
 * calls an unexplained entry a bug, and this is what makes that true: an
 * empty reason survives `ack?.reason ?? null` intact and reaches the page as
 * an Acknowledged badge with nothing under it, which reads as "explained"
 * while explaining nothing. Run over `ACKNOWLEDGED` at module load, so the
 * build fails rather than the dashboard lying.
 */
export function assertReasonsGiven(entries: readonly Acknowledgement[]): void {
  for (const entry of entries) {
    if (entry.reason.trim() === "") {
      throw new Error(
        `acknowledgement ${entry.check}/${entry.shortId}/${entry.period} has a blank reason`,
      );
    }
  }
}

assertReasonsGiven(ACKNOWLEDGED);

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
