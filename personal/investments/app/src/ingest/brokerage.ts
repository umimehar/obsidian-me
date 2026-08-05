import type {
  AssetClassTotal,
  CashPaidIn,
  CashPaidOut,
  CashSummary,
  Contributions,
  Currency,
  PortfolioSummary,
  Statement,
} from "../types";
import {
  type LabelValue,
  type Page,
  type Row,
  findRow,
  labelStartX,
  rowText,
  scanPairs,
  sliceColumns,
} from "./geometry";
import type { SourceRef } from "./source";

const ACCOUNT_TYPE =
  /^(Managed|Self-directed|Order Execution Only|Crypto|Chequing|Tax-Free Savings|First Home Savings)\b.*\bAccount$/;
const PERIOD = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const FX_RATE = /\$1\s?USD\s?=\s?\$([\d.]+)\s?CAD/;

/** Rows from the row matching `start` (exclusive) to the first matching any `ends`. */
function sectionRows(pages: readonly Page[], start: RegExp, ends: readonly RegExp[]): Row[] {
  const all = pages.flatMap((p) => p.rows);
  const from = all.findIndex((r) => start.test(rowText(r)));
  if (from === -1) return [];
  const rest = all.slice(from + 1);
  const to = rest.findIndex((r) => ends.some((e) => e.test(rowText(r))));
  return to === -1 ? rest : rest.slice(0, to);
}

function readAccountType(pages: readonly Page[]): string {
  const row = findRow(pages, ACCOUNT_TYPE);
  if (!row) throw new Error("could not find the account type row");
  return rowText(row);
}

function readPeriod(pages: readonly Page[]): { start: string; end: string } {
  const row = findRow(pages, PERIOD);
  const m = row ? PERIOD.exec(rowText(row)) : null;
  if (!m?.[1] || !m[2]) throw new Error("could not find the statement period");
  return { start: m[1], end: m[2] };
}

const PORTFOLIO_END = [/Portfolio Cash/];
const PORTFOLIO_START = /Account No\./;

/**
 * The summary table sits right of the mailing address, so it is read from a
 * column slice anchored on the "Total Portfolio" row rather than from whole
 * rows. Absolute x is never used: the anchor is found, then everything to its
 * left (the address) is discarded. The label headers above "Cash" carry no
 * money and merge into the first pair scanPairs closes, so lookups match on
 * the label's trailing word rather than requiring an exact match.
 *
 * The guard is "Total Portfolio" alone, not a "Market Value" header check:
 * 2023-era statements wrap the header across two rows ("Market % of Market
 * Book % of Total Book" / "Value($) Value Value($) Value"), so "Market Value"
 * never appears contiguous in any row and that guard silently drops a
 * statement that otherwise parses fine.
 */
function readPortfolio(pages: readonly Page[]): PortfolioSummary | null {
  const totalRow = findRow(pages, /Total Portfolio/);
  if (!totalRow) return null;

  const labelX = labelStartX(totalRow, /Total Portfolio/);
  if (labelX === null) return null;

  const section = sectionRows(pages, PORTFOLIO_START, PORTFOLIO_END);
  const table = sliceColumns(section, labelX - 1, Number.POSITIVE_INFINITY);
  const pairs = scanPairs(table);

  const find = (re: RegExp): number[] => pairs.find((p) => re.test(p.label))?.values ?? [];
  const cash = find(/(?:^|\s)Cash$/);
  const total = find(/Total Portfolio$/);
  if (cash.length < 3 || total.length < 3) return null;

  // Columns are market value, % of market value, book cost, % of total book.
  const classes: AssetClassTotal[] = pairs
    .filter((p) => /Equities/.test(p.label) && p.values.length >= 3)
    .map((p) => ({
      name: p.label.trim(),
      marketValue: p.values[0] ?? 0,
      bookCost: p.values[2] ?? 0,
    }));

  return {
    cashMarketValue: cash[0] ?? 0,
    cashBookCost: cash[2] ?? 0,
    classes,
    totalMarketValue: total[0] ?? 0,
    totalBookCost: total[2] ?? 0,
  };
}

const CASH_END = [/Portfolio Assets/, /Activity - Current period/, /Money-weighted/];

interface CashBlock {
  currencies: Currency[];
  summary: LabelValue[];
  items: LabelValue[];
  contributions: LabelValue[];
}

/**
 * Splits the cash block into the three panels the managed layout prints side by
 * side. A dual-currency statement has no panels, so all three views are the same
 * pair list and the label lookups still resolve. Either way the value rule is
 * uniform: take the last N values, N being the currency count.
 */
function readCashBlock(pages: readonly Page[]): CashBlock {
  const rows = sectionRows(pages, /Portfolio Cash/, CASH_END);
  const dual = rows.some((r) => /USD Transactions/.test(rowText(r)));

  if (dual) {
    const pairs = scanPairs(rows);
    return { currencies: ["CAD", "USD"], summary: pairs, items: pairs, contributions: pairs };
  }

  const paidInRow = rows.find((r) => /Cash Paid In/.test(rowText(r)));
  const contribRow = rows.find((r) => /Contributions/.test(rowText(r)));
  // Anchored: these rows carry earlier panel text before the label, and an
  // unanchored regex matches that whole prefix once it reaches the label,
  // returning the prefix's x0 instead of the label's own.
  const xIn = paidInRow ? labelStartX(paidInRow, /^Cash Paid In/) : null;
  const xContrib = contribRow ? labelStartX(contribRow, /^Contributions/) : null;

  const inf = Number.POSITIVE_INFINITY;
  // Some account types (Chequing) print an "Interest:" stats panel instead of
  // "Contributions:", so there is no contributions column at all. Falling
  // back to x=0 there would slice in the whole row width — summary and items
  // panels included — instead of correctly reporting no contributions panel.
  const contributions = xContrib === null ? [] : scanPairs(sliceColumns(rows, xContrib, inf));
  return {
    currencies: ["CAD"],
    summary: scanPairs(sliceColumns(rows, 0, xIn ?? inf)),
    items: scanPairs(sliceColumns(rows, xIn ?? 0, xContrib ?? inf)),
    contributions,
  };
}

function lookup(pairs: readonly LabelValue[], re: RegExp, count: number): number[] {
  const found = pairs.find((p) => re.test(p.label));
  if (!found) return new Array<number>(count).fill(0);
  return found.values.slice(-count);
}

function readCash(block: CashBlock): CashSummary[] {
  const n = block.currencies.length;

  // "Other" appears under both Cash Paid In and Cash Paid Out. Split the item
  // list at the Cash Paid Out heading so each half is unambiguous. Anchored:
  // "Total Cash Paid Out" (a summary row) contains the same words but never
  // starts with them.
  const outAt = block.items.findIndex((p) => /^Cash Paid Out/.test(p.label));
  const inItems = outAt === -1 ? block.items : block.items.slice(0, outAt);
  const outItems = outAt === -1 ? block.items : block.items.slice(outAt);

  const opening = lookup(block.summary, /Last Statement Cash Balance/, n);
  const totalIn = lookup(block.summary, /Total Cash Paid In/, n);
  const totalOut = lookup(block.summary, /Total Cash Paid Out/, n);
  const closing = lookup(block.summary, /Closing Cash Balance/, n);

  const paidIn: Record<keyof CashPaidIn, number[]> = {
    deposits: lookup(inItems, /Deposits/, n),
    proceedsFromSales: lookup(inItems, /Proceeds from sales/, n),
    dividends: lookup(inItems, /(^|\s)Dividends$/, n),
    interestEarned: lookup(inItems, /Interest Earned/, n),
    stockLendingIncome: lookup(inItems, /Stock Lending Income/, n),
    other: lookup(inItems, /(^|\s)Other$/, n),
  };
  const paidOut: Record<keyof CashPaidOut, number[]> = {
    fees: lookup(outItems, /Fees/, n),
    taxes: lookup(outItems, /Taxes/, n),
    interestPaid: lookup(outItems, /Interest Paid/, n),
    costOfInvestments: lookup(outItems, /Cost of Investments/, n),
    withdrawals: lookup(outItems, /Withdrawals/, n),
    other: lookup(outItems, /(^|\s)Other$/, n),
  };

  return block.currencies.map((currency, i) => ({
    currency,
    opening: opening[i] ?? 0,
    closing: closing[i] ?? 0,
    totalIn: totalIn[i] ?? 0,
    totalOut: totalOut[i] ?? 0,
    paidIn: {
      deposits: paidIn.deposits[i] ?? 0,
      proceedsFromSales: paidIn.proceedsFromSales[i] ?? 0,
      dividends: paidIn.dividends[i] ?? 0,
      interestEarned: paidIn.interestEarned[i] ?? 0,
      stockLendingIncome: paidIn.stockLendingIncome[i] ?? 0,
      other: paidIn.other[i] ?? 0,
    },
    paidOut: {
      fees: paidOut.fees[i] ?? 0,
      taxes: paidOut.taxes[i] ?? 0,
      interestPaid: paidOut.interestPaid[i] ?? 0,
      costOfInvestments: paidOut.costOfInvestments[i] ?? 0,
      withdrawals: paidOut.withdrawals[i] ?? 0,
      other: paidOut.other[i] ?? 0,
    },
  }));
}

function readContributions(block: CashBlock): Contributions | null {
  const ytd = block.contributions.find((p) => /Contributions \(year to date\)/.test(p.label));
  if (ytd) {
    const v = ytd.values[ytd.values.length - 1] ?? 0;
    return { yearToDate: v, first60Days: null, restOfYear: null };
  }
  const first = block.contributions.find((p) => /First 60 Days/.test(p.label));
  const rest = block.contributions.find((p) => /Rest of Year/.test(p.label));
  if (first && rest) {
    return {
      yearToDate: null,
      first60Days: first.values[first.values.length - 1] ?? 0,
      restOfYear: rest.values[rest.values.length - 1] ?? 0,
    };
  }
  return null;
}

function readDividendsYtd(block: CashBlock): number | null {
  const p = block.contributions.find((x) => /Dividends \(year to date\)/.test(x.label));
  return p ? (p.values[p.values.length - 1] ?? null) : null;
}

function readFxRate(pages: readonly Page[]): number | null {
  const row = findRow(pages, FX_RATE);
  const m = row ? FX_RATE.exec(rowText(row)) : null;
  return m?.[1] ? Number(m[1]) : null;
}

export function parseBrokerage(pages: readonly Page[], source: SourceRef): Statement {
  // Read account type first: it is the failure mode the "type row absent" test
  // exercises, and it must be the error that surfaces, not a later one.
  const accountType = readAccountType(pages);
  const period = readPeriod(pages);
  const block = readCashBlock(pages);

  return {
    source,
    accountType,
    periodStart: period.start,
    periodEnd: period.end,
    portfolio: readPortfolio(pages),
    cash: readCash(block),
    holdings: [],
    activity: [],
    contributions: readContributions(block),
    dividendsYearToDate: readDividendsYtd(block),
    fxRate: readFxRate(pages),
    returns: null,
    balances: null,
  };
}
