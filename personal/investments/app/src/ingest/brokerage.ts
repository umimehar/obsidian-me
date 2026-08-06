import type {
  ActivityRow,
  AssetClassTotal,
  CashPaidIn,
  CashPaidOut,
  CashSummary,
  Contributions,
  Currency,
  Holding,
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
import { isMoney, parseMoney } from "./money";
import type { SourceRef } from "./source";

const ACCOUNT_TYPE =
  /^(Managed|Self-directed|Order Execution Only|Crypto|Chequing|Tax-Free Savings|First Home Savings)\b.*\bAccount$/;
const PERIOD = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const FX_RATE = /\$1\s?USD\s?=\s?\$([\d.]+)\s?CAD/;
/** Trailing footnote on a class name ("(The conversion rate used to convert...)") that is not part of the name itself. */
const CONVERSION_RATE_FOOTNOTE = /\s*\(The conversion rate.*$/;

/** Strips the trailing conversion-rate footnote a class name can carry, wherever it is read from. */
function stripConversionRateFootnote(text: string): string {
  return text.replace(CONVERSION_RATE_FOOTNOTE, "").trim();
}

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
 * A two-line class name ("Canadian Equities and" / "Alternatives") wraps as a
 * money-bearing row followed by a continuation row with no money of its own.
 * `scanPairs` accumulates label words forward until a money row closes them,
 * which attaches the continuation to the *next* class instead of the one it
 * belongs to — so this walks `table`'s rows directly instead. A row carrying
 * money starts a new class entry; a row carrying none is a continuation and
 * is appended to the entry that precedes it.
 */
function readAssetClasses(table: readonly Row[]): AssetClassTotal[] {
  const cashRowIdx = table.findIndex((r) => r.words.some((w) => isMoney(w.text)));
  const totalRowIdx = table.findIndex((r) => /^Total Portfolio\b/.test(rowText(r).trim()));
  if (cashRowIdx === -1 || totalRowIdx === -1) return [];

  const classes: AssetClassTotal[] = [];
  for (const row of table.slice(cashRowIdx + 1, totalRowIdx)) {
    const words: string[] = [];
    const values: number[] = [];
    for (const w of row.words) {
      if (isMoney(w.text)) values.push(parseMoney(w.text));
      else words.push(w.text);
    }
    if (values.length >= 3) {
      classes.push({
        name: words.join(" "),
        marketValue: values[0] ?? 0,
        bookCost: values[2] ?? 0,
      });
      continue;
    }
    const last = classes[classes.length - 1];
    if (last) last.name = `${last.name} ${words.join(" ")}`.trim();
  }

  // The last class's name may also carry the conversion-rate footnote.
  for (const c of classes) {
    c.name = stripConversionRateFootnote(c.name);
  }
  return classes;
}

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

  const cashIdx = pairs.findIndex((p) => /(?:^|\s)Cash$/.test(p.label));
  const totalIdx = pairs.findIndex((p) => /Total Portfolio$/.test(p.label));
  if (cashIdx === -1 || totalIdx === -1) return null;
  const cash = pairs[cashIdx]?.values ?? [];
  const total = pairs[totalIdx]?.values ?? [];
  if (cash.length < 3 || total.length < 3) return null;

  // Columns are market value, % of market value, book cost, % of total book.
  // Wealthsimple has renamed these classes at least three times (Equities,
  // then Securities, then Crypto Assets appeared as a fourth class with no
  // shared word at all), so a wording allow-list keeps breaking on the next
  // account type. Every row between Cash and Total Portfolio that carries
  // the same four money columns those two rows do is a class, regardless of
  // what it is called.
  const classes = readAssetClasses(table);

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

const SUMMARY_ROW_LABELS = [/Last Statement Cash Balance/, /Closing Cash Balance/];

/**
 * `readCashBlock`'s currency count rests entirely on whether `/USD
 * Transactions/` matched. If that single marker is ever wrong on a real
 * statement, `lookup`'s `slice(-n)` still returns a value — just the wrong
 * one, silently mislabeled with the wrong currency. This is the shape check
 * that catches it: on a correctly parsed statement, the summary panel has
 * been sliced down to exactly one value per currency on both the opening and
 * closing balance rows. The dual layout's raw rows also carry a leading
 * "Combined" total, so it alone tolerates one extra value; the single-panel
 * layout's slice never has that column, so any extra value there means a
 * second currency slipped through undetected, not a Combined total, and must
 * throw the same as too few.
 */
function assertCurrencyCountConsistent(block: CashBlock, dual: boolean): void {
  const n = block.currencies.length;
  const max = dual ? n + 1 : n;
  for (const label of SUMMARY_ROW_LABELS) {
    const pair = block.summary.find((p) => label.test(p.label));
    const count = pair?.values.length ?? 0;
    if (count < n || count > max) {
      throw new Error(
        `cash currency count mismatch: expected ${n} currenc${n === 1 ? "y" : "ies"} ` +
          `(${block.currencies.join("/")}) but the "${label.source}" row carries ${count} value(s)`,
      );
    }
  }
}

/**
 * Splits the cash block into the three panels the managed layout prints side by
 * side. A dual-currency statement has no panels, so all three views are the same
 * pair list and the label lookups still resolve. Either way the value rule is
 * uniform: take the last N values, N being the currency count.
 */
function readDualCurrencyCashBlock(rows: readonly Row[]): CashBlock {
  const pairs = scanPairs(rows);
  const block: CashBlock = {
    currencies: ["CAD", "USD"],
    summary: pairs,
    items: pairs,
    contributions: pairs,
  };
  assertCurrencyCountConsistent(block, true);
  return block;
}

/** The x0 of the first row matching `find`, anchored within it by `anchor`. */
function findPanelX(rows: readonly Row[], find: RegExp, anchor: RegExp): number | null {
  const row = rows.find((r) => find.test(rowText(r)));
  return row ? labelStartX(row, anchor) : null;
}

function readSingleCurrencyCashBlock(rows: readonly Row[]): CashBlock {
  // Anchored: these rows carry earlier panel text before the label, and an
  // unanchored regex matches that whole prefix once it reaches the label,
  // returning the prefix's x0 instead of the label's own.
  const xIn = findPanelX(rows, /Cash Paid In/, /^Cash Paid In/);
  const xContrib = findPanelX(rows, /Contributions/, /^Contributions/);
  // Some account types print a stats panel instead of "Contributions:" --
  // "Interest:" on Chequing, "Dividends:" on non-registered Cash accounts --
  // so there is no contributions column at all, handled below. But that
  // panel's column still needs a right edge for the items panel: without
  // one, its header text shares a row with the last item (e.g. Deposits)
  // and bleeds into the same pair, so the item's label reads "...Deposits
  // Interest:" and no longer ends in "Deposits", breaking the end-anchored
  // lookups below.
  const xStats = findPanelX(rows, /Interest:|Dividends:/, /^(?:Interest|Dividends):/);

  const inf = Number.POSITIVE_INFINITY;
  // Falling back to x=0 for contributions would slice in the whole row width
  // — summary and items panels included — instead of correctly reporting no
  // contributions panel.
  const contributions = xContrib === null ? [] : scanPairs(sliceColumns(rows, xContrib, inf));
  const block: CashBlock = {
    currencies: ["CAD"],
    summary: scanPairs(sliceColumns(rows, 0, xIn ?? inf)),
    items: scanPairs(sliceColumns(rows, xIn ?? 0, xContrib ?? xStats ?? inf)),
    contributions,
  };
  assertCurrencyCountConsistent(block, false);
  return block;
}

function readCashBlock(pages: readonly Page[]): CashBlock {
  // A missing Portfolio Cash section is a parser failure, not a zero-activity
  // account: without it every summary/items lookup below falls through to
  // `lookup`'s all-zero fallback and fabricates a complete, reconciling
  // CashSummary that is indistinguishable from a real one.
  if (!findRow(pages, /Portfolio Cash/)) {
    throw new Error("could not find the Portfolio Cash section");
  }

  const rows = sectionRows(pages, /Portfolio Cash/, CASH_END);
  const dual = rows.some((r) => /USD Transactions/.test(rowText(r)));
  return dual ? readDualCurrencyCashBlock(rows) : readSingleCurrencyCashBlock(rows);
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

  // End-anchored, matching Dividends/Other below: several of these labels keep
  // their panel prefix after slicing ("Cash Paid In Deposits", "Cash Paid Out
  // Fees"), so a start anchor would miss them, but the item name is always
  // the last word(s) on its own pair, so an unanchored regex risks matching a
  // different row that happens to contain the same substring.
  //
  // Older statements label the same two rows differently: "Interest Earned"
  // used to print as bare "Interest", and "Stock Lending Income" as "Interest
  // from Stock Lending" (the two physical rows "Interest from" / "Stock
  // Lending" that `scanPairs` joins into one label). The bare "Interest" arm
  // cannot also match "Interest Paid" (a paid-out row, a different items
  // list entirely) since that string never ends in "Interest", nor swallow
  // "Interest from Stock Lending" since that string never ends in "Interest"
  // or "Interest Earned" either -- the two resolve to distinct fields.
  const paidIn: Record<keyof CashPaidIn, number[]> = {
    deposits: lookup(inItems, /(^|\s)Deposits$/, n),
    proceedsFromSales: lookup(inItems, /(^|\s)Proceeds from sales$/, n),
    dividends: lookup(inItems, /(^|\s)Dividends$/, n),
    interestEarned: lookup(inItems, /(^|\s)Interest(?: Earned)?$/, n),
    stockLendingIncome: lookup(
      inItems,
      /(^|\s)(?:Stock Lending Income|Interest from Stock Lending)$/,
      n,
    ),
    other: lookup(inItems, /(^|\s)Other$/, n),
  };
  const paidOut: Record<keyof CashPaidOut, number[]> = {
    fees: lookup(outItems, /(^|\s)Fees$/, n),
    taxes: lookup(outItems, /(^|\s)Taxes$/, n),
    interestPaid: lookup(outItems, /(^|\s)Interest Paid$/, n),
    costOfInvestments: lookup(outItems, /(^|\s)Cost of Investments$/, n),
    withdrawals: lookup(outItems, /(^|\s)Withdrawals$/, n),
    other: lookup(outItems, /(^|\s)Other$/, n),
  };

  return block.currencies.map((currency, i) => ({
    currency,
    opening: opening[i] ?? 0,
    closing: closing[i] ?? 0,
    totalIn: totalIn[i] ?? 0,
    totalOut: totalOut[i] ?? 0,
    paidIn: pickCurrency(paidIn, i),
    paidOut: pickCurrency(paidOut, i),
  }));
}

/** The i-th currency's value out of every `lookup`ed field on a Record built by `readCash`, defaulting each to 0. */
function pickCurrency<K extends string>(
  byField: Record<K, number[]>,
  i: number,
): Record<K, number> {
  const entries = (Object.keys(byField) as K[]).map((key) => [key, byField[key][i] ?? 0] as const);
  return Object.fromEntries(entries) as Record<K, number>;
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

const ASSETS_START = /Portfolio (Assets|Equities)|Crypto Portfolio/;
const ASSETS_END = [/^\*Book Cost/, /Activity - Current period/, /LEVERAGE DISCLOSURE/];
const CLASS_HEADING = /^(Canadian|US)[- ](Listed Securities|Equities)/;
const PENDING = /PENDING VALUATION|Pricing for this period is not yet available/;

interface MoneyToken {
  x0: number;
  amount: number;
}

interface CurrencyToken {
  x0: number;
  currency: Currency;
}

interface RowTokens {
  money: MoneyToken[];
  currency: CurrencyToken[];
  words: string[];
}

function classifyRow(row: Row): RowTokens {
  const money: MoneyToken[] = [];
  const currency: CurrencyToken[] = [];
  const words: string[] = [];
  for (const w of row.words) {
    if (isMoney(w.text)) money.push({ x0: w.x0, amount: parseMoney(w.text) });
    else if (w.text === "USD" || w.text === "CAD") currency.push({ x0: w.x0, currency: w.text });
    else words.push(w.text);
  }
  return { money, currency, words };
}

/**
 * A holding row carries a trailing symbol and at least the five money
 * columns -- six on a statement with the extra Aggregate Book Cost column,
 * so a genuinely short row on such a statement is not mistaken for a
 * holding that happens to be missing its aggregate figure. The name is
 * normally present too, but when a long name wraps across a page break, the
 * numbers can land on the page-2 side alone with only the symbol — a bare
 * word that itself looks like a ticker still means this is a real holding,
 * just one whose name printed elsewhere and is lost.
 */
function isHoldingRow(tokens: RowTokens, hasAggregateBookCost: boolean): boolean {
  const minMoney = hasAggregateBookCost ? 6 : 5;
  return tokens.money.length >= minMoney && tokens.words.length >= 1;
}

/**
 * Each money column (price, market value, book cost) can carry its own
 * currency tag, independently of the others — a "CAD Hedged" holding prices
 * in USD but values in CAD, so a single per-row currency is not enough. A
 * tag is paired to the nearest money token to its left across both token
 * lists sorted together by x-position, which is what a reader does visually
 * and holds even when a tag wraps onto the row below (its x still falls
 * under the column it labels).
 */
function attachCurrencies(
  money: readonly MoneyToken[],
  currency: readonly CurrencyToken[],
): (Currency | null)[] {
  const tags: (Currency | null)[] = money.map(() => null);
  const entries = [
    ...money.map((m, idx) => ({ x0: m.x0, idx, currency: null as Currency | null })),
    ...currency.map((c) => ({ x0: c.x0, idx: -1, currency: c.currency })),
  ].sort((a, b) => a.x0 - b.x0);

  let lastMoneyIdx = -1;
  for (const entry of entries) {
    if (entry.currency === null) {
      lastMoneyIdx = entry.idx;
    } else if (lastMoneyIdx !== -1 && tags[lastMoneyIdx] === null) {
      tags[lastMoneyIdx] = entry.currency;
    }
  }
  return tags;
}

interface HoldingIdentity {
  symbol: string;
  name: string;
}

/**
 * The last word is normally the ticker, but a handful of holdings — a recent
 * spinoff, in the one seen so far — print only a name and never get a ticker
 * column at all. Such a row is still real money and must stay in the
 * reconciliation; it just carries an empty symbol.
 */
function extractHoldingIdentity(tokens: RowTokens): HoldingIdentity {
  const lastWord = tokens.words[tokens.words.length - 1];
  const hasSymbol = !!lastWord && /^[A-Z][A-Z0-9.]*$/.test(lastWord);
  return {
    symbol: hasSymbol ? lastWord : "",
    name: hasSymbol ? tokens.words.slice(0, -1).join(" ") : tokens.words.join(" "),
  };
}

/**
 * A wrapped continuation line — the tail of a long name, a trailing currency
 * tag for market value or book cost, or both together — is folded in for its
 * currency tokens only; its words are never a holding's name or symbol, so
 * they are discarded. It is recognized as "not itself a holding row" rather
 * than "carries only currency", since a real continuation often wraps a
 * currency tag alongside leftover name words (e.g. "Income Strategy ETF USD").
 */
function resolveCurrencyTokens(
  tokens: RowTokens,
  next: Row | undefined,
  hasAggregateBookCost: boolean,
): CurrencyToken[] {
  const nextTokens = next ? classifyRow(next) : null;
  if (!nextTokens || isHoldingRow(nextTokens, hasAggregateBookCost)) return tokens.currency;
  return [...tokens.currency, ...nextTokens.currency];
}

interface HoldingColumns {
  quantity: number;
  segregatedQuantity: number;
  marketPrice: number;
  priceCurrency: Currency;
  marketValue: number;
  marketValueConverted: boolean;
  bookCost: number;
  bookCostConverted: boolean;
}

/**
 * A holding row is: name, symbol, total quantity, segregated quantity,
 * optionally a quantity on loan, price, market value, book cost. Quantity on
 * loan appears on roughly a third of statements, so the last three money
 * tokens (price, market value, book cost) are read from the end rather than
 * a fixed front offset — stable whether the row carries five values or six.
 * A USD-priced holding's market value and book cost can print in USD, not
 * CAD, on the page. The portfolio summary they must reconcile against is CAD
 * throughout, and Holding carries no separate currency for these two
 * fields, so a USD-tagged one is converted here at the statement's own rate.
 */
/** The amount of the money token at `index`, or 0 when the row is short one. */
function amountAt(money: readonly MoneyToken[], index: number): number {
  return money[index]?.amount ?? 0;
}

function resolveHoldingColumns(
  tokens: RowTokens,
  currencyTokens: readonly CurrencyToken[],
  hasAggregateBookCost: boolean,
  fxRate: number | null,
): HoldingColumns {
  const money = hasAggregateBookCost ? tokens.money.slice(0, -1) : tokens.money;
  const n = money.length;
  const tags = attachCurrencies(money, currencyTokens);
  const priceCurrency = tags[n - 3] ?? "CAD";
  const valueConverted = tags[n - 2] === "USD";
  const costConverted = tags[n - 1] === "USD";
  const rate = fxRate ?? 1;

  return {
    quantity: amountAt(money, 0),
    segregatedQuantity: amountAt(money, 1),
    marketPrice: amountAt(money, n - 3),
    priceCurrency,
    marketValue: amountAt(money, n - 2) * (valueConverted ? rate : 1),
    marketValueConverted: valueConverted,
    bookCost: amountAt(money, n - 1) * (costConverted ? rate : 1),
    bookCostConverted: costConverted,
  };
}

/**
 * A handful of statements add a seventh "Aggregate Book Cost" column after
 * Book Cost (for superficial-loss tracking). It sits at the far end, not the
 * middle like a loan or staked quantity, so reading price/value/cost from
 * the end of the row would misalign by one for every holding — this is
 * checked once per statement, from the header row this section starts with
 * ("...Market Book Aggregate"). The phrase "Book Aggregate" adjacent is the
 * marker, not the bare word: a real holding can be named "Aggregate" (e.g.
 * "BMO Aggregate Bond Index ETF"), and the scan is limited to `rows[0]`, the
 * header, so such a holding is never mistaken for it.
 */
function hasAggregateBookCostColumn(rows: readonly Row[]): boolean {
  const header = rows[0];
  return !!header && /\bBook Aggregate\b/.test(rowText(header));
}

/**
 * Every Equities layout heads each class explicitly (`CLASS_HEADING` below).
 * A Crypto Portfolio does not: it goes straight from the column header row
 * ("Crypto Asset Symbol...") to the holdings, with no per-class heading row
 * at all, because there is only ever the one class. Leaving the default
 * empty would never match the summary table's "Crypto Assets" class, so a
 * correctly-parsed crypto holding would falsely fail a per-class reconciliation.
 */
function defaultAssetClass(rows: readonly Row[]): string {
  return rows.some((r) => /Crypto Asset Symbol/.test(rowText(r))) ? "Crypto Assets" : "";
}

function readHoldings(pages: readonly Page[]): Holding[] {
  const rows = sectionRows(pages, ASSETS_START, ASSETS_END);
  const pendingSymbols = readPendingSymbols(pages);
  const fxRate = readFxRate(pages);
  const hasAggregateBookCost = hasAggregateBookCostColumn(rows);

  const holdings: Holding[] = [];
  let assetClass = defaultAssetClass(rows);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const text = rowText(row);

    if (CLASS_HEADING.test(text)) {
      assetClass = stripConversionRateFootnote(text);
      continue;
    }
    if (/^Total\b/.test(text)) continue;

    const tokens = classifyRow(row);
    if (!isHoldingRow(tokens, hasAggregateBookCost)) continue;

    const { symbol, name } = extractHoldingIdentity(tokens);
    const currencyTokens = resolveCurrencyTokens(tokens, rows[i + 1], hasAggregateBookCost);
    const columns = resolveHoldingColumns(tokens, currencyTokens, hasAggregateBookCost, fxRate);

    holdings.push({
      name,
      symbol,
      ...columns,
      assetClass,
      pendingValuation: pendingSymbols.has(symbol),
    });
  }
  return holdings;
}

/** Symbols named in a pending-valuation disclaimer, e.g. "WSE401 is valued...". */
function readPendingSymbols(pages: readonly Page[]): Set<string> {
  const out = new Set<string>();
  if (!findRow(pages, PENDING)) return out;
  for (const row of pages.flatMap((p) => p.rows)) {
    const m = /\b([A-Z][A-Z0-9]{2,})\s+is valued\b/.exec(rowText(row));
    if (m?.[1]) out.add(m[1]);
  }
  return out;
}

function readFxRate(pages: readonly Page[]): number | null {
  const row = findRow(pages, FX_RATE);
  const m = row ? FX_RATE.exec(rowText(row)) : null;
  return m?.[1] ? Number(m[1]) : null;
}

const ACTIVITY_HEADING = /^(?:(CAD|USD) )?Activity - Current period$/;
const ACTIVITY_END = [
  /^LEVERAGE DISCLOSURE/,
  /^STATEMENT NOTES/,
  /^Money-weighted Return Rates/,
  // The PERFORMANCE template's statement-code glossary. Missing this let the
  // whole glossary (hundreds of words) get swallowed as a "continuation" of
  // the last activity row on the page, since it carries no leading date and
  // no money -- which in turn broke duplicate-row detection below, since the
  // row's description no longer matched its verbatim twin.
  /^GLOSSARY/,
  // A registered account's beneficiary designation, printed as a footnote
  // under whichever activity row happens to be last on the page (any DIV,
  // LOAN or RECALL row on a registered account can carry it) -- real PII
  // (a beneficiary's name), not transaction text. Missing this is exactly
  // the GLOSSARY bug again: the block, and the "Name Beneficiary Type"/
  // beneficiary-name rows under it, get swallowed as a continuation.
  /^Designation of Beneficiary/,
  // The year-end statement's audit notice (auditor name, firm, address,
  // phone, email), printed once on the December statement and attached to
  // whichever row is last on the page. Same shape as the two above.
  /^AUDIT NOTE/,
  // A trade placed near period end can settle after it. Wealthsimple prints
  // those in a separate two-column ("To be Debited"/"To be Credited", no
  // running balance) table for the *next* period, dated past periodEnd --
  // real money, but not part of this statement's reconciliation. A
  // dual-currency statement prefixes it with the currency, same as the
  // heading above.
  /^(?:(?:CAD|USD) )?Transactions for Future Settlement/,
];
const COLUMN_HEADER = /^Date\s+Transaction\s+Description/;
const PAGE_NUMBER = /^\d+\s*\/\s*\d+$/;
const ACTIVITY_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Some codes carry an underscore (E_TRFIN, AFT_IN, P2P_OUT) rather than being
// plain alphanumeric.
const ACTIVITY_CODE = /^[A-Z][A-Z0-9_]*$/;

/**
 * A data row is a date, a code, description words, and three money columns
 * (debit, credit, balance) at the far right. The description can itself
 * carry dollar-shaped tokens -- a per-share price, a bare share count that
 * parses as money too -- so only the *last three* money-looking tokens in
 * the row are treated as the real columns; everything earlier stays in the
 * description text even when it looks like an amount. Returns null when the
 * row does not have a date first word, or does not carry at least three
 * money tokens (not a data row at all).
 */
function parseActivityDataRow(row: Row, currency: Currency): ActivityRow | null {
  const first = row.words[0];
  if (!first || !ACTIVITY_DATE.test(first.text)) return null;

  const rest = row.words.slice(1);
  const moneyIdx = rest.reduce<number[]>((acc, w, i) => {
    if (isMoney(w.text)) acc.push(i);
    return acc;
  }, []);
  if (moneyIdx.length < 3) return null;

  const valueIdx = new Set(moneyIdx.slice(-3));
  const values = moneyIdx.slice(-3).map((i) => parseMoney(rest[i]?.text ?? "0"));
  const textWords = rest.filter((_, i) => !valueIdx.has(i)).map((w) => w.text);

  const code = textWords[0];
  if (!code || !ACTIVITY_CODE.test(code)) return null;

  return {
    date: first.text,
    postedDate: null,
    code,
    description: textWords.slice(1).join(" "),
    debit: values[0] ?? 0,
    credit: values[1] ?? 0,
    balance: values[2] ?? 0,
    currency,
  };
}

/**
 * A handful of amended/restated statements print one activity row twice in
 * immediate succession -- same date, code, description, debit, credit and
 * balance -- with no other row between the two. The reasoning that makes
 * this safe to collapse only holds when a debit or credit is nonzero: a real
 * second transaction can never then share the first's balance, since a
 * nonzero amount always moves it. A zero-value row proves nothing that way
 * -- an unchanged balance is exactly what a real, distinct zero-value row
 * (a same-day stock loan/recall on a different security, an in-kind
 * transfer of different shares) looks like too, and only `description`
 * tells those apart, so it must be compared as well. Two $0.00 rows for
 * different securities are real, separate transactions and must both
 * survive.
 *
 * The zero-value guard is a deliberate one-way trade, not an oversight: it
 * means a genuine verbatim rendering duplicate of a *zero-value* row (the
 * same amended-statement quirk that motivated this function, just with
 * debit and credit both $0.00) can no longer be collapsed. That is
 * acceptable because the two failure modes are not symmetric -- the case
 * this guards against was a confirmed, measured 386-row data-loss bug; a
 * zero-value verbatim duplicate slipping through is unconfirmed and, being
 * zero-value, contributes nothing to the credit/debit reconciliation either
 * way. The corpus shows zero new reconciliation errors after this change.
 */
function isDuplicateOf(a: ActivityRow, b: ActivityRow): boolean {
  if (a.debit === 0 && a.credit === 0) return false;
  return (
    a.date === b.date &&
    a.code === b.code &&
    a.currency === b.currency &&
    a.debit === b.debit &&
    a.credit === b.credit &&
    a.balance === b.balance &&
    a.description === b.description
  );
}

/**
 * The verbatim-duplicate check runs only after every row's description is
 * fully assembled (see `readActivity`), not while rows are still being
 * built: the duplicate's own wrapped continuation (e.g. a repeated
 * "(executed at ...)" tail) has not been appended to it yet at the moment
 * it is first parsed, so comparing descriptions during the build would
 * compare a fully-merged first copy against a still-bare second one and
 * never match.
 *
 * This still assumes the continuation line itself is not also duplicated:
 * a wrapped continuation always attaches to whichever copy was parsed most
 * recently (`readActivity`'s `current`), so if a real duplicate's second
 * copy is the one that ends up carrying the continuation rather than the
 * first, the two descriptions would differ and the pair would not collapse.
 * Not observed in the corpus -- every verbatim duplicate found so far
 * either carries no continuation or duplicates it on both copies.
 */
function dropVerbatimDuplicates(rows: readonly ActivityRow[]): ActivityRow[] {
  const out: ActivityRow[] = [];
  for (const row of rows) {
    const prev = out[out.length - 1];
    if (prev && isDuplicateOf(row, prev)) continue;
    out.push(row);
  }
  return out;
}

/**
 * A row without a leading date continues the previous row's description
 * (a wrapped name, an "(executed at ...)" tail). Page numbers and the
 * column header repeated on every page are dropped explicitly, since
 * neither carries a date and both would otherwise look like a stray
 * continuation.
 */
interface ActivityScanState {
  currency: Currency;
  inSection: boolean;
  current: ActivityRow | null;
}

/** One row's worth of the state machine `readActivity` walks, factored out to keep both functions under the complexity budget. */
function scanActivityRow(row: Row, state: ActivityScanState, rows: ActivityRow[]): void {
  const text = rowText(row);

  const heading = ACTIVITY_HEADING.exec(text);
  if (heading) {
    state.currency = heading[1] === "USD" ? "USD" : "CAD";
    state.inSection = true;
    state.current = null;
    return;
  }
  if (!state.inSection) return;
  if (ACTIVITY_END.some((re) => re.test(text))) {
    state.inSection = false;
    state.current = null;
    return;
  }
  if (PAGE_NUMBER.test(text) || COLUMN_HEADER.test(text)) return;

  const parsed = parseActivityDataRow(row, state.currency);
  if (parsed) {
    state.current = parsed;
    rows.push(state.current);
    return;
  }

  if (state.current && !row.words.some((w) => isMoney(w.text))) {
    state.current.description = `${state.current.description} ${text}`.trim();
  }
}

function readActivity(pages: readonly Page[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  const state: ActivityScanState = { currency: "CAD", inSection: false, current: null };

  for (const row of pages.flatMap((p) => p.rows)) {
    scanActivityRow(row, state, rows);
  }
  return dropVerbatimDuplicates(rows);
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
    holdings: readHoldings(pages),
    activity: readActivity(pages),
    contributions: readContributions(block),
    dividendsYearToDate: readDividendsYtd(block),
    fxRate: readFxRate(pages),
    returns: null,
    balances: null,
  };
}
