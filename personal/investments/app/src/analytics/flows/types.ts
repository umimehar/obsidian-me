import type { AccountKind } from "../../store/mask";
import type { Purpose } from "../../store/registry";
import type { Currency } from "../../types";

export type SourceCategory = "payroll" | "outsideBank" | "interacIn" | "business";

export type FlowCategory =
  | SourceCategory
  | "grant"
  | "income"
  | "saleProceeds"
  | "buy"
  | "fee"
  | "withholding"
  | "leftWealthsimple"
  | "fxConversion"
  | "inKind";

export interface FlowRow {
  /** `${shortId}:${period}:${template initial}:${row index}`, stable across builds. */
  id: string;
  accountId: string;
  period: string;
  date: string;
  /** The statement code, or `CASH_*` resolved from a CASH row's description. */
  code: string;
  /** For a movement credit, the outside source it is if it proves unpaired. */
  category: FlowCategory;
  /** A leg that may pair with another account's opposite leg. */
  movement: boolean;
  /** Signed from the account's side: positive into it. */
  amountCad: number;
  currency: Currency;
  amount: number;
  fxRate: number | null;
  /** Ticker read off BUY, SELL and DIV descriptions; "" otherwise or when absent. */
  symbol: string;
  pairId: string | null;
  lagDays: number | null;
}

export interface CashBlock {
  accountId: string;
  period: string;
  currency: Currency;
  opening: number;
  closing: number;
  fxRate: number | null;
  rowsNet: number;
  /** closing − opening − rowsNet, in the block's own currency. */
  residual: number;
}

export interface FlowAccount {
  accountId: string;
  shortId: string;
  label: string;
  kind: AccountKind;
  purpose: Purpose;
  inTotals: boolean;
  firstPeriod: string;
  lastPeriod: string;
  /**
   * The account's latest statement carries a $0 portfolio (or, on a CASH
   * template, $0 cash closings) and its `lastPeriod` is before the corpus's
   * latest period -- it stopped reporting because it was closed, not
   * because this import simply has not reached that month for it yet.
   */
  closed: boolean;
}

export interface FlowsData {
  generated: string;
  accounts: FlowAccount[];
  rows: FlowRow[];
  blocks: CashBlock[];
  /**
   * Every BUY symbol whose held name reads as a non-equity class the asset
   * class table does not list -- a bond fund, a money market or savings
   * vehicle -- computed once at build time from the statement description
   * (`collectSuspectSymbols`). The description itself never reaches this
   * file; only these already-filtered tickers do.
   */
  suspectSymbols: string[];
}
