import type { SourceRef } from "./ingest/source";

export type Currency = "CAD" | "USD";

export interface Holding {
  name: string;
  /** Can be empty (a spinoff with no printed ticker, a name split across a page break) -- never use as a unique key. */
  symbol: string;
  quantity: number;
  segregatedQuantity: number;
  marketPrice: number;
  priceCurrency: Currency;
  marketValue: number;
  /**
   * True when marketValue was converted from USD to CAD at the statement's
   * own fx rate -- exactly what the class heading's footnote sanctions, so
   * this is not an approximation flag like bookCostConverted below. It marks
   * which holdings the disclosed rate actually touched, so a reconciliation
   * check can attribute a small residual (the statement's own six-decimal
   * rate rounding, summed across several holdings) to that cause instead of
   * reporting it as a parser defect.
   */
  marketValueConverted: boolean;
  bookCost: number;
  assetClass: string;
  /** True when the statement says pricing for the period is not yet final. */
  pendingValuation: boolean;
  /**
   * True when bookCost was converted from USD to CAD at the statement's own
   * fx rate. That rate is disclosed for market value only (see the class
   * heading's footnote); book cost is an accumulated basis recorded at each
   * purchase's own historical rate, which a single current rate cannot
   * reconstruct exactly. This flag marks the figure as approximate so a
   * downstream tax calculation can choose to flag or exclude it rather than
   * silently treat it as exact.
   */
  bookCostConverted: boolean;
}

export interface AssetClassTotal {
  name: string;
  marketValue: number;
  bookCost: number;
}

export interface PortfolioSummary {
  cashMarketValue: number;
  cashBookCost: number;
  classes: AssetClassTotal[];
  totalMarketValue: number;
  totalBookCost: number;
}

export interface CashPaidIn {
  deposits: number;
  proceedsFromSales: number;
  dividends: number;
  interestEarned: number;
  stockLendingIncome: number;
  other: number;
}

export interface CashPaidOut {
  fees: number;
  taxes: number;
  interestPaid: number;
  costOfInvestments: number;
  withdrawals: number;
  other: number;
}

export interface CashSummary {
  currency: Currency;
  opening: number;
  closing: number;
  /** Null on the CASH template, which prints balances but no in/out totals. */
  totalIn: number | null;
  totalOut: number | null;
  paidIn: CashPaidIn | null;
  paidOut: CashPaidOut | null;
}

export interface ActivityRow {
  date: string;
  /** Only the CASH template carries a separate posted date. */
  postedDate: string | null;
  /** Statement code: BUY, SELL, DIV, CONT, GRANT, TRFIN. Empty on CASH rows. */
  code: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  currency: Currency;
}

export interface Contributions {
  /** Self-directed registered accounts print one year-to-date figure. */
  yearToDate: number | null;
  /** Managed registered accounts split the year instead. */
  first60Days: number | null;
  restOfYear: number | null;
}

export interface Returns {
  currentPeriod: number | null;
  oneYear: number | null;
  threeYears: number | null;
  fiveYears: number | null;
  tenYears: number | null;
  sinceInception: number | null;
}

export interface PeriodBalances {
  start: number;
  deposits: number;
  withdrawals: number;
  changeInMarketValue: number;
  end: number;
}

export interface Statement {
  source: SourceRef;
  /** Verbatim from the page, e.g. "Order Execution Only Spousal RRSP Account". */
  accountType: string;
  periodStart: string;
  periodEnd: string;
  /** Null only on the CASH template. Null on a BROKERAGE statement is a parser bug. */
  portfolio: PortfolioSummary | null;
  cash: CashSummary[];
  holdings: Holding[];
  activity: ActivityRow[];
  contributions: Contributions | null;
  dividendsYearToDate: number | null;
  fxRate: number | null;
  returns: Returns | null;
  balances: PeriodBalances | null;
}
